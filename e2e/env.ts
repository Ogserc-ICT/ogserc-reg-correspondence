import "dotenv/config";
import { localUrl } from "../scripts/pg-cluster";

export const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E || localUrl("e2e");

/** Same default as prisma/seed/example.ts (DEV_PASSWORD). */
export const DEV_PASSWORD =
  process.env.DEV_SEED_PASSWORD || "Dev only pass 2026!";

/** The app clock during e2e runs: SPEC §12.2's "today" (Lagos time). */
export const E2E_APP_NOW = "2026-12-10T09:00";
