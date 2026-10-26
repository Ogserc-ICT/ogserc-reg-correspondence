// The one place the app reads the clock (STACK rule 16). Everything else takes `now`.
import { instantIn } from "@/domain/clock";

/** "2026-12-10T09:00" (Lagos local time) → that instant. */
export function parseAppNow(value: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value.trim());
  if (!m)
    throw new Error(`APP_NOW must look like 2026-12-10T09:00, got "${value}"`);
  return instantIn(m[1], m[2]);
}

/** Throws in production if APP_NOW is set; call at startup. */
export function assertClockSafe(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && env.APP_NOW?.trim())
    throw new Error("APP_NOW is set in production. Remove it before starting.");
}

export function appNow(env: NodeJS.ProcessEnv = process.env): Date {
  assertClockSafe(env);
  const fixed = env.APP_NOW?.trim();
  return fixed ? parseAppNow(fixed) : new Date();
}
