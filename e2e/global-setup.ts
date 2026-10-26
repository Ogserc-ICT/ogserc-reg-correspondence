// A fresh e2e database with reference data, the §12.2 example and one dev
// login per role. The app under test (playwright.config webServer) uses it.
import { execSync } from "node:child_process";
import { freshDatabase } from "../scripts/fresh-db";
import { E2E_DATABASE_URL } from "./env";

export default async function globalSetup() {
  const db = await freshDatabase("e2e", E2E_DATABASE_URL);
  execSync("npx tsx prisma/seed.ts --example", {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, APP_NOW: "" },
    stdio: "pipe",
  });
  return db.stop;
}
