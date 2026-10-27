// Vercel hosting: public address without a custom domain, and migrations
// only on production builds.
import { describe, expect, it } from "vitest";
import { hasDatabaseUrl, shouldMigrate } from "../scripts/vercel-build.mjs";
import { appBaseURL } from "@/server/auth";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("Vercel hosting", () => {
  it("uses the production vercel.app address unless BETTER_AUTH_URL is set", () => {
    expect(
      appBaseURL(
        env({ VERCEL_PROJECT_PRODUCTION_URL: "ogserc-registry.vercel.app" }),
      ),
    ).toBe("https://ogserc-registry.vercel.app");
    expect(
      appBaseURL(
        env({
          BETTER_AUTH_URL: "https://registry.example.org",
          VERCEL_PROJECT_PRODUCTION_URL: "ogserc-registry.vercel.app",
        }),
      ),
    ).toBe("https://registry.example.org");
    expect(appBaseURL(env({}))).toBeUndefined();
  });

  it("migrates the database only for production builds", () => {
    expect(shouldMigrate({ VERCEL_ENV: "production" })).toBe(true);
    expect(shouldMigrate({ VERCEL_ENV: "preview" })).toBe(false);
    expect(
      shouldMigrate({ VERCEL_ENV: "preview", MIGRATE_ON_BUILD: "1" }),
    ).toBe(true);
  });

  it("knows when the deployment has no database to migrate", () => {
    expect(hasDatabaseUrl({})).toBe(false);
    expect(hasDatabaseUrl({ DATABASE_URL: " " })).toBe(false);
    expect(hasDatabaseUrl({ DATABASE_URL: "postgresql://x" })).toBe(true);
    expect(hasDatabaseUrl({ DATABASE_URL_UNPOOLED: "postgresql://x" })).toBe(
      true,
    );
  });
});
