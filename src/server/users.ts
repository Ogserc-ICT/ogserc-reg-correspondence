// Admin-managed staff accounts (no public sign-up). Passwords never reach the
// audit log; only the fact that one was set.
import { passwordProblems } from "@/domain/passwords";
import { roleUnitError, type Principal, type Role } from "@/domain/permissions";
import type { User } from "@/generated/prisma/client";
import { audit, changedFields } from "./audit";
import { hashPassword, verifyPassword } from "./auth";
import type { Db, Tx } from "./db";
import { assertCan, ValidationError } from "./errors";
import { normaliseEmail } from "./session";

const CREDENTIAL = "credential";

export type UserInput = {
  name: string;
  email: string;
  role: Role;
  unitId: string | null;
  isSignatory: boolean;
  /** Grants registry.route only (SPEC-v2 C5.1, C12). Omitted = false. */
  canRoute?: boolean;
  designation: string | null;
};

/** Fields safe to show and audit. */
function publicFields(u: User) {
  return {
    name: u.name,
    email: u.email,
    role: u.role,
    unitId: u.unitId,
    isSignatory: u.isSignatory,
    canRoute: u.canRoute,
    designation: u.designation,
    active: u.active,
  };
}

function validate(input: UserInput): UserInput {
  const name = input.name.trim();
  const email = normaliseEmail(input.email);
  const problems: string[] = [];
  if (!name) problems.push("Enter the person's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    problems.push("Enter a valid email address.");
  const unitProblem = roleUnitError(input.role, input.unitId);
  if (unitProblem) problems.push(unitProblem);
  if (problems.length) throw new ValidationError(problems);
  // Pick fields explicitly: callers pass extras (temporaryPassword, active).
  return {
    name,
    email,
    role: input.role,
    unitId: input.unitId,
    isSignatory: input.isSignatory,
    canRoute: input.canRoute ?? false,
    designation: input.designation?.trim() || null,
  };
}

function checkPassword(password: string, who: { email: string; name: string }) {
  const problems = passwordProblems(password, who);
  if (problems.length) throw new ValidationError(problems);
}

export async function listUsers(db: Db, actor: Principal) {
  assertCan(actor, "users.manage");
  return db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { unit: { select: { name: true } } },
  });
}

/** Creates the user with a temporary password they must change at first sign-in. */
export async function createUser(
  db: Db,
  actor: Principal,
  input: UserInput & { temporaryPassword: string },
  now: Date,
): Promise<User> {
  assertCan(actor, "users.manage");
  const data = validate(input);
  checkPassword(input.temporaryPassword, data);
  if (await db.user.findUnique({ where: { email: data.email } }))
    throw new ValidationError([`${data.email} already has an account.`]);
  const passwordHash = await hashPassword(input.temporaryPassword);

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { ...data, emailVerified: true, mustChangePassword: true },
    });
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: CREDENTIAL,
        password: passwordHash,
      },
    });
    await audit(
      tx,
      {
        userId: actor.id,
        action: "user-create",
        entityType: "User",
        entityId: user.id,
        after: publicFields(user),
        note: "temporary password set",
      },
      now,
    );
    return user;
  });
}

export async function updateUser(
  db: Db,
  actor: Principal,
  id: string,
  patch: UserInput & { active: boolean },
  now: Date,
): Promise<User> {
  assertCan(actor, "users.manage");
  const data = { ...validate(patch), active: patch.active };
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id } });
    if (
      data.email !== before.email &&
      (await tx.user.findUnique({ where: { email: data.email } }))
    )
      throw new ValidationError([`${data.email} already has an account.`]);
    await keepAnAdmin(tx, id, data.role, data.active);
    const after = await tx.user.update({ where: { id }, data });
    // A deactivated or re-roled user starts again from the login page.
    if (
      !after.active ||
      after.role !== before.role ||
      after.unitId !== before.unitId
    )
      await tx.session.deleteMany({ where: { userId: id } });
    const diff = changedFields(publicFields(before), publicFields(after));
    await audit(
      tx,
      {
        userId: actor.id,
        action: "user-update",
        entityType: "User",
        entityId: id,
        ...diff,
      },
      now,
    );
    return after;
  });
}

/** Never leave the system without an active admin. */
async function keepAnAdmin(tx: Tx, id: string, role: Role, active: boolean) {
  if (role === "ADMIN" && active) return;
  const others = await tx.user.count({
    where: { role: "ADMIN", active: true, id: { not: id } },
  });
  const isAdminNow = await tx.user.count({
    where: { id, role: "ADMIN", active: true },
  });
  if (isAdminNow && others === 0)
    throw new ValidationError([
      "This is the only active admin. Make someone else an admin first.",
    ]);
}

/** Admin reset: a new temporary password, sessions ended, lockout cleared. */
export async function setTemporaryPassword(
  db: Db,
  actor: Principal,
  id: string,
  temporaryPassword: string,
  now: Date,
): Promise<void> {
  assertCan(actor, "users.manage");
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  checkPassword(temporaryPassword, user);
  const passwordHash = await hashPassword(temporaryPassword);
  await db.$transaction(async (tx) => {
    await setCredential(tx, id, passwordHash);
    await tx.user.update({
      where: { id },
      data: { mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(
      tx,
      {
        userId: actor.id,
        action: "user-password-reset",
        entityType: "User",
        entityId: id,
      },
      now,
    );
  });
}

export async function unlockUser(
  db: Db,
  actor: Principal,
  id: string,
  now: Date,
) {
  assertCan(actor, "users.manage");
  await db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id } });
    await tx.user.update({
      where: { id },
      data: { failedLogins: 0, lockedUntil: null },
    });
    await audit(
      tx,
      {
        userId: actor.id,
        action: "user-unlock",
        entityType: "User",
        entityId: id,
        before: {
          lockedUntil: before.lockedUntil,
          failedLogins: before.failedLogins,
        },
        after: { lockedUntil: null, failedLogins: 0 },
      },
      now,
    );
  });
}

/** Any signed-in user changing their own password; other sessions are ended. */
export async function changeOwnPassword(
  db: Db,
  user: Principal,
  input: { current: string; next: string; keepSessionToken?: string },
  now: Date,
): Promise<void> {
  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { accounts: { where: { providerId: CREDENTIAL } } },
  });
  const hash = row.accounts[0]?.password;
  if (!hash || !(await verifyPassword({ hash, password: input.current })))
    throw new ValidationError(["Your current password is not correct."]);
  if (input.next === input.current)
    throw new ValidationError(["Choose a password you haven't used just now."]);
  checkPassword(input.next, row);
  const passwordHash = await hashPassword(input.next);
  await db.$transaction(async (tx) => {
    await setCredential(tx, user.id, passwordHash);
    await tx.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
    await tx.session.deleteMany({
      where: { userId: user.id, token: { not: input.keepSessionToken ?? "" } },
    });
    await audit(
      tx,
      {
        userId: user.id,
        action: "password-change",
        entityType: "User",
        entityId: user.id,
      },
      now,
    );
  });
}

async function setCredential(tx: Tx, userId: string, passwordHash: string) {
  await tx.account.upsert({
    where: {
      providerId_accountId: { providerId: CREDENTIAL, accountId: userId },
    },
    update: { password: passwordHash },
    create: {
      userId,
      accountId: userId,
      providerId: CREDENTIAL,
      password: passwordHash,
    },
  });
}
