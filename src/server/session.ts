// Sign-in with lockout, sign-out, and turning a session into a Principal.
import { APIError } from "better-auth/api";
import {
  afterFailedLogin,
  isLocked,
  LOCKOUT_MINUTES,
} from "@/domain/passwords";
import type { Principal } from "@/domain/permissions";
import { audit } from "./audit";
import type { Auth } from "./auth";
import type { Db } from "./db";

/** The signed-in user as pages and actions see it. */
export type SessionUser = Principal & {
  name: string;
  email: string;
  mustChangePassword: boolean;
};

export const LOGIN_FAILED = "Email or password is incorrect.";

export type LoginResult =
  | { ok: true; userId: string; mustChangePassword: boolean; headers: Headers }
  | { ok: false; error: string };

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Signs in, counting failures per account: after MAX_FAILED_LOGINS in a row
 * the account is locked for LOCKOUT_MINUTES (STACK rule 18). An admin can
 * unlock it sooner. Every attempt on a known account is audited.
 */
export async function login(
  db: Db,
  auth: Auth,
  input: { email: string; password: string; headers: Headers },
  now: Date,
): Promise<LoginResult> {
  const email = normaliseEmail(input.email);
  const user = await db.user.findUnique({ where: { email } });
  const log = (action: string, note?: string) =>
    user &&
    db.$transaction((tx) =>
      audit(
        tx,
        {
          userId: user.id,
          action,
          entityType: "User",
          entityId: user.id,
          note,
        },
        now,
      ),
    );

  if (user && isLocked(user.lockedUntil, now)) {
    await log("login-blocked", "account locked");
    return {
      ok: false,
      error: `Too many failed attempts. Try again after ${LOCKOUT_MINUTES} minutes, or ask an administrator to unlock your account.`,
    };
  }
  if (user && !user.active) {
    await log("login-blocked", "account inactive");
    return { ok: false, error: LOGIN_FAILED };
  }

  try {
    const { headers } = await auth.api.signInEmail({
      body: { email, password: input.password, rememberMe: false },
      headers: input.headers,
      returnHeaders: true,
    });
    await db.user.update({
      where: { id: user!.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
    await log("login");
    return {
      ok: true,
      userId: user!.id,
      mustChangePassword: user!.mustChangePassword,
      headers,
    };
  } catch (err) {
    if (!(err instanceof APIError)) throw err;
    if (user) {
      // Read-modify-write under a row lock so parallel attempts all count.
      await db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ failedLogins: number }[]>`
          SELECT "failedLogins" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
        const next = afterFailedLogin(row.failedLogins, now);
        await tx.user.update({ where: { id: user.id }, data: next });
        await audit(
          tx,
          {
            userId: user.id,
            action: next.lockedUntil ? "lockout" : "login-failed",
            entityType: "User",
            entityId: user.id,
          },
          now,
        );
      });
    }
    return { ok: false, error: LOGIN_FAILED };
  }
}

export async function logout(auth: Auth, headers: Headers): Promise<void> {
  await auth.api.signOut({ headers });
}

/** The active user behind the request's session cookie, or null. */
export async function sessionUser(
  db: Db,
  auth: Auth,
  headers: Headers,
): Promise<SessionUser | null> {
  const s = await auth.api.getSession({ headers });
  if (!s) return null;
  const u = await db.user.findUnique({ where: { id: s.user.id } });
  if (!u || !u.active) return null;
  return {
    id: u.id,
    role: u.role,
    unitId: u.unitId,
    active: u.active,
    canRoute: u.canRoute,
    name: u.name,
    email: u.email,
    mustChangePassword: u.mustChangePassword,
  };
}

export async function loadPrincipal(
  db: Db,
  userId: string,
): Promise<Principal> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    id: u.id,
    role: u.role,
    unitId: u.unitId,
    active: u.active,
    canRoute: u.canRoute,
  };
}
