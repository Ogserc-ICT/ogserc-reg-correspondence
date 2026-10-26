import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appNow, assertClockSafe } from "@/server/clock";

describe("app clock (STACK rule 16)", () => {
  it("uses APP_NOW, and a clock file over it when present", () => {
    const env = { APP_NOW: "2026-12-10T09:00" } as unknown as NodeJS.ProcessEnv;
    expect(appNow(env).toISOString()).toBe("2026-12-10T08:00:00.000Z");
    const file = path.join(mkdtempSync(path.join(tmpdir(), "clock-")), "now");
    writeFileSync(file, "2026-11-20T14:00\n");
    expect(appNow({ ...env, APP_NOW_FILE: file }).toISOString()).toBe(
      "2026-11-20T13:00:00.000Z",
    );
    writeFileSync(file, "");
    expect(appNow({ ...env, APP_NOW_FILE: file }).toISOString()).toBe(
      "2026-12-10T08:00:00.000Z",
    );
  });

  it("refuses either in production", () => {
    expect(() =>
      assertClockSafe({
        NODE_ENV: "production",
        APP_NOW_FILE: "x",
      } as NodeJS.ProcessEnv),
    ).toThrow();
    expect(() =>
      assertClockSafe({
        NODE_ENV: "production",
        APP_NOW: "2026-12-10T09:00",
      } as NodeJS.ProcessEnv),
    ).toThrow();
    expect(() =>
      assertClockSafe({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
