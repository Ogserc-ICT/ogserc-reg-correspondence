import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Domain tests must never depend on the machine's time zone (SPEC §9 R7).
    // Running them under UTC catches any accidental use of local dates.
    env: { TZ: "UTC" },
    coverage: { provider: "v8", include: ["src/domain/**", "src/server/**"] },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: ["tests/integration/**"],
        },
      },
      {
        // Real PostgreSQL: a fresh local *_test database per run (see global-setup).
        extends: true,
        test: {
          name: "db",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
