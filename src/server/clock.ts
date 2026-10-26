// The one place the app reads the clock (STACK rule 16). Everything else takes `now`.
//
// Dev/test only:
// - APP_NOW="2026-12-10T09:00" fixes the clock (Lagos time).
// - APP_NOW_FILE=<path> reads that value from a file on every call, so an
//   end-to-end test can move the clock between steps (e.g. issue a file on
//   20 Nov, return it on 25 Nov). The file wins over APP_NOW when present.
// The app refuses to start in production with either set.
import { readFileSync } from "node:fs";
import { instantIn } from "@/domain/clock";

/** "2026-12-10T09:00" (Lagos local time) → that instant. */
export function parseAppNow(value: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value.trim());
  if (!m)
    throw new Error(`APP_NOW must look like 2026-12-10T09:00, got "${value}"`);
  return instantIn(m[1], m[2]);
}

/** Throws in production if a test clock is set; call at startup. */
export function assertClockSafe(env: NodeJS.ProcessEnv = process.env): void {
  if (
    env.NODE_ENV === "production" &&
    (env.APP_NOW?.trim() || env.APP_NOW_FILE?.trim())
  )
    throw new Error(
      "APP_NOW or APP_NOW_FILE is set in production. Remove it before starting.",
    );
}

function fromFile(file: string): string | null {
  try {
    return readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

export function appNow(env: NodeJS.ProcessEnv = process.env): Date {
  assertClockSafe(env);
  const file = env.APP_NOW_FILE?.trim();
  const fixed = (file && fromFile(file)) || env.APP_NOW?.trim();
  return fixed ? parseAppNow(fixed) : new Date();
}
