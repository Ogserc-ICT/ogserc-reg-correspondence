// Better Auth: email + password, sessions in the database, no sign-up.
// No Better Auth HTTP routes are mounted. Sign-in, sign-out and password
// changes go through our server actions, so the lockout in login.ts cannot be
// bypassed by calling an endpoint directly.
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/domain/passwords";
import { getDb, type Db } from "./db";

/** A session lasts this long, extended while the user keeps working. */
export const SESSION_HOURS = 12;
const SESSION_REFRESH_HOURS = 1;

export function hashPassword(password: string): Promise<string> {
  return hash(password); // argon2id, library defaults
}

export function verifyPassword(data: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return verify(data.hash, data.password).catch(() => false);
}

/**
 * The app's public address. On Vercel with no custom domain, the production
 * *.vercel.app address is used unless BETTER_AUTH_URL says otherwise.
 */
export function appBaseURL(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.BETTER_AUTH_URL?.trim()) return env.BETTER_AUTH_URL.trim();
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : undefined;
}

export function createAuth(
  db: Db,
  opts: { secret?: string; baseURL?: string; nextCookies?: boolean } = {},
) {
  return betterAuth({
    database: prismaAdapter(db, { provider: "postgresql" }),
    secret: opts.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL: opts.baseURL ?? appBaseURL(),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: {
      expiresIn: SESSION_HOURS * 3600,
      updateAge: SESSION_REFRESH_HOURS * 3600,
    },
    advanced: {
      cookiePrefix: "ogserc-registry",
      database: { generateId: false },
    },
    telemetry: { enabled: false },
    plugins: opts.nextCookies ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { registryAuth?: Auth };

/** The app's instance, wired to Next's cookies. */
export function getAuth(): Auth {
  if (!globalForAuth.registryAuth)
    globalForAuth.registryAuth = createAuth(getDb(), { nextCookies: true });
  return globalForAuth.registryAuth;
}
