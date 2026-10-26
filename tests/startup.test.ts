// Production start-up checks: dev data and dev settings never reach production.
import { describe, expect, it } from "vitest";
import { productionProblems } from "@/server/startup";

const good = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "x".repeat(44),
  DATABASE_URL: "postgresql://registry@db/registry",
} as unknown as NodeJS.ProcessEnv;
const db = (devUsers: number) => ({ countDevUsers: async () => devUsers });

describe("production start-up checks", () => {
  it("passes a clean production setup", async () => {
    expect(await productionProblems(good, db(0))).toEqual([]);
  });

  it("does nothing outside production", async () => {
    const dev = {
      ...good,
      NODE_ENV: "development",
      APP_NOW: "2026-12-10T09:00",
    };
    expect(await productionProblems(dev as NodeJS.ProcessEnv, db(6))).toEqual(
      [],
    );
  });

  it("refuses dev accounts, a test clock, a short secret and a dev password", async () => {
    const env = {
      ...good,
      APP_NOW_FILE: "/tmp/clock",
      BETTER_AUTH_SECRET: "short",
      DEV_SEED_PASSWORD: "x",
    } as NodeJS.ProcessEnv;
    expect(await productionProblems(env, db(6))).toEqual([
      "APP_NOW / APP_NOW_FILE is set. Remove the test clock.",
      "BETTER_AUTH_SECRET must be set to at least 32 random characters.",
      "DEV_SEED_PASSWORD is set. Remove it.",
      "The database has 6 dev account(s) (@example.invalid): this looks like a dev or test database. Use a fresh database for production.",
    ]);
  });
});
