// A fresh e2e database: reference data, one dev login per role and the two
// example files, with empty registers so the §12.2 scenario can be entered
// through the UI. The app under test (playwright.config webServer) uses it.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { freshDatabase } from "../scripts/fresh-db";
import { E2E_DATABASE_URL, E2E_MAIL_DIR, setClock } from "./env";

export default async function globalSetup() {
  setClock();
  rmSync(E2E_MAIL_DIR, { recursive: true, force: true });
  const db = await freshDatabase("e2e", E2E_DATABASE_URL);
  execSync("npx tsx prisma/seed.ts --logins --files", {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, APP_NOW: "" },
    stdio: "pipe",
  });
  return db.stop;
}
