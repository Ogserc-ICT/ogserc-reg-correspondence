import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { localUrl } from "../scripts/pg-cluster";

export const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E || localUrl("e2e");

/** Same default as prisma/seed/example.ts (DEV_PASSWORD). */
export const DEV_PASSWORD =
  process.env.DEV_SEED_PASSWORD || "Dev only pass 2026!";

/** The app clock during e2e runs: SPEC §12.2's "today" (Lagos time). */
export const E2E_APP_NOW = "2026-12-10T09:00";

/** Where the e2e server's dev email transport writes (SPEC-v2 C6). */
export const E2E_MAIL_DIR = path.resolve(".data/mail-e2e");

/** The e2e server reads its clock from this file on every request. */
export const E2E_CLOCK_FILE = path.resolve(".e2e-clock");

/** Moves the app clock (Lagos time, "2026-11-20T14:00"). */
export function setClock(value: string = E2E_APP_NOW) {
  writeFileSync(E2E_CLOCK_FILE, value);
}
