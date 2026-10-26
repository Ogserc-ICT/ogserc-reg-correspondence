import { describe, expect, it } from "vitest";
import {
  afterFailedLogin,
  isLocked,
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  passwordProblems,
} from "./passwords";
import {
  can,
  canReadFile,
  canReadInward,
  canReadOutward,
  canVoid,
  readScope,
  roleUnitError,
  type Capability,
  type Principal,
  type Role,
} from "./permissions";

const user = (role: Role, extra: Partial<Principal> = {}): Principal => ({
  id: `u-${role}`,
  role,
  unitId: role === "UNIT_OFFICER" ? "unit-A" : null,
  active: true,
  ...extra,
});

describe("capabilities (SPEC §10)", () => {
  const matrix: [Capability, Role[]][] = [
    ["registers.write", ["REGISTRY_OFFICER", "HEAD_OF_REGISTRY"]],
    ["items.void", ["HEAD_OF_REGISTRY"]],
    ["items.editAny", ["HEAD_OF_REGISTRY"]],
    ["files.write", ["REGISTRY_OFFICER", "HEAD_OF_REGISTRY"]],
    ["files.readConfidential", ["HEAD_OF_REGISTRY", "SECRETARY"]],
    ["reports.print", ["REGISTRY_OFFICER", "HEAD_OF_REGISTRY", "SECRETARY"]],
    ["dashboard.view", ["REGISTRY_OFFICER", "HEAD_OF_REGISTRY", "SECRETARY"]],
    ["reference.manage", ["HEAD_OF_REGISTRY"]],
    ["users.manage", ["ADMIN"]],
    ["settings.manage", ["ADMIN"]],
  ];
  const roles: Role[] = [
    "REGISTRY_OFFICER",
    "HEAD_OF_REGISTRY",
    "UNIT_OFFICER",
    "SECRETARY",
    "ADMIN",
  ];

  it.each(matrix)("%s is granted only to %j", (cap, allowed) => {
    for (const role of roles)
      expect(can(user(role), cap)).toBe(allowed.includes(role));
  });

  it("denies everything to an inactive user and to nobody", () => {
    expect(can(user("ADMIN", { active: false }), "users.manage")).toBe(false);
    expect(can(null, "registers.write")).toBe(false);
    expect(readScope(user("SECRETARY", { active: false }))).toEqual({
      kind: "none",
    });
  });
});

describe("read scope", () => {
  it("gives unit officers their unit only, and admins no registers", () => {
    expect(readScope(user("UNIT_OFFICER"))).toEqual({
      kind: "unit",
      unitId: "unit-A",
    });
    expect(readScope(user("UNIT_OFFICER", { unitId: null }))).toEqual({
      kind: "none",
    });
    expect(readScope(user("ADMIN"))).toEqual({ kind: "none" });
    expect(readScope(user("SECRETARY"))).toEqual({ kind: "all" });
  });

  it("lets a unit officer read non-void items of their own unit only", () => {
    const u = user("UNIT_OFFICER");
    expect(canReadInward(u, { routedUnitId: "unit-A", voided: false })).toBe(
      true,
    );
    expect(canReadInward(u, { routedUnitId: "unit-B", voided: false })).toBe(
      false,
    );
    expect(canReadInward(u, { routedUnitId: "unit-A", voided: true })).toBe(
      false,
    );
    expect(
      canReadOutward(u, { originatingUnitId: "unit-A", voided: false }),
    ).toBe(true);
    expect(
      canReadOutward(u, { originatingUnitId: "unit-B", voided: false }),
    ).toBe(false);
    expect(
      canReadInward(user("ADMIN"), { routedUnitId: "unit-A", voided: false }),
    ).toBe(false);
  });

  it("hides confidential files from registry officers and unit officers", () => {
    expect(canReadFile(user("REGISTRY_OFFICER"), { confidential: false })).toBe(
      true,
    );
    expect(canReadFile(user("REGISTRY_OFFICER"), { confidential: true })).toBe(
      false,
    );
    expect(canReadFile(user("HEAD_OF_REGISTRY"), { confidential: true })).toBe(
      true,
    );
    expect(canReadFile(user("SECRETARY"), { confidential: true })).toBe(true);
    expect(canReadFile(user("UNIT_OFFICER"), { confidential: false })).toBe(
      false,
    );
  });
});

describe("void (STACK rule 7)", () => {
  const head = user("HEAD_OF_REGISTRY");
  it("is Head of Registry only, never twice", () => {
    const item = { createdById: "someone", voided: false };
    expect(canVoid(head, item, false)).toBe(true);
    expect(canVoid(user("REGISTRY_OFFICER"), item, false)).toBe(false);
    expect(canVoid(user("ADMIN"), item, false)).toBe(false);
    expect(canVoid(head, { ...item, voided: true }, false)).toBe(false);
  });

  it("blocks the head's own items unless the setting allows it", () => {
    const own = { createdById: head.id, voided: false };
    expect(canVoid(head, own, false)).toBe(false);
    expect(canVoid(head, own, true)).toBe(true);
  });
});

it("ties units to the unit-officer role", () => {
  expect(roleUnitError("UNIT_OFFICER", null)).toMatch(/needs a unit/);
  expect(roleUnitError("REGISTRY_OFFICER", "unit-A")).toMatch(
    /Only unit officers/,
  );
  expect(roleUnitError("UNIT_OFFICER", "unit-A")).toBeNull();
});

describe("password rules", () => {
  const who = { email: "ada.okafor@ogserc.gov.ng", name: "Ada Okafor" };
  it("accepts a long passphrase", () => {
    expect(passwordProblems("correct horse battery 7", who)).toEqual([]);
  });

  it("lists every problem", () => {
    expect(passwordProblems("short", who)).toEqual([
      "Use at least 12 characters.",
      "Mix letters with numbers, spaces or symbols.",
    ]);
    expect(passwordProblems("Okafor-2026-blue", who)).toEqual([
      "Don't use your name or email address.",
    ]);
    expect(passwordProblems("MyOgserc-Pass-99", who)).toEqual([
      "Avoid common words such as “password” or “ogserc”.",
    ]);
    expect(passwordProblems("111111111111", who)).toContain(
      "Don't repeat one character.",
    );
  });
});

describe("lockout", () => {
  const now = new Date("2026-12-10T08:00:00Z");
  it(`locks for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_LOGINS} failures in a row`, () => {
    expect(afterFailedLogin(MAX_FAILED_LOGINS - 2, now)).toEqual({
      failedLogins: MAX_FAILED_LOGINS - 1,
      lockedUntil: null,
    });
    const locked = afterFailedLogin(MAX_FAILED_LOGINS - 1, now);
    expect(locked.failedLogins).toBe(0);
    expect(locked.lockedUntil?.toISOString()).toBe("2026-12-10T08:15:00.000Z");
    expect(isLocked(locked.lockedUntil, new Date("2026-12-10T08:14:59Z"))).toBe(
      true,
    );
    expect(isLocked(locked.lockedUntil, new Date("2026-12-10T08:15:00Z"))).toBe(
      false,
    );
  });
});
