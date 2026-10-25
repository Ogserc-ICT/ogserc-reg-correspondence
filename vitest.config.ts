import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Domain tests must never depend on the machine's time zone (SPEC §9 R7).
    // Running them under UTC catches any accidental use of local dates.
    env: { TZ: "UTC" },
    coverage: { provider: "v8", include: ["src/domain/**", "src/server/**"] },
  },
});
