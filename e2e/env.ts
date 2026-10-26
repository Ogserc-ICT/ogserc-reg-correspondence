import "dotenv/config";
import { localUrl } from "../scripts/pg-cluster";

export const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E || localUrl("e2e");

/** Same default as prisma/seed/example.ts (DEV_PASSWORD). */
export const DEV_PASSWORD =
  process.env.DEV_SEED_PASSWORD || "Dev only pass 2026!";
