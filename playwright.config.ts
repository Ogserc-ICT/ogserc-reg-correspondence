import { defineConfig, devices } from "@playwright/test";
import { E2E_APP_NOW, E2E_DATABASE_URL } from "./e2e/env";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Fresh e2e database, seeded with the example and dev logins.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}/login`,
    // Never reuse a server that may be pointing at the dev database.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_NOW: E2E_APP_NOW,
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
