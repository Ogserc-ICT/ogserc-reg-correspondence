// Admin › Organisation (SPEC-v2 C1, C7, C8, C12, Q-V2-6): unit and division
// emails, the signatory list with one default, file class codes, who may
// change them, and that every change is audited.
import { beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import type { Role } from "@/generated/prisma/client";
import { ForbiddenError, ValidationError } from "@/server/errors";
import {
  saveDivision,
  saveFileClassCode,
  saveSignatory,
  saveUnit,
} from "@/server/organisation";
import type { Actor } from "@/server/registers";
import { actorFor, connectTestDb, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let admin: Actor;

async function actorWithRole(role: Role, unit?: string) {
  const u = await db.user.create({
    data: {
      name: `${role} user`,
      email: `${role.toLowerCase()}@ogserc.test`,
      role,
      unitId: unit
        ? (await db.unit.findUniqueOrThrow({ where: { name: unit } })).id
        : null,
    },
  });
  return actorFor(db, u.id);
}

const unit = (name: string) => db.unit.findUniqueOrThrow({ where: { name } });

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  admin = await actorWithRole("ADMIN");
});

describe("unit and division emails (C1, Q-V2-6)", () => {
  it("normalises the addresses, refuses bad ones, and audits the change", async () => {
    const lic = await unit("Licensing unit");
    const raw = {
      name: lic.name,
      divisionId: lic.divisionId!,
      unitGroup: lic.unitGroup ?? "",
      sortOrder: String(lic.sortOrder),
      active: "on",
    };
    await expect(
      saveUnit(db, admin, lic.id, { ...raw, emails: "licensing@ogserc" }),
    ).rejects.toThrow(
      "Email addresses: not an email address: licensing@ogserc.",
    );
    await saveUnit(db, admin, lic.id, {
      ...raw,
      emails:
        "Licensing@OGSERC.org.ng; licensing@ogserc.org.ng, lic2@ogserc.org.ng",
    });
    expect((await unit("Licensing unit")).emails).toEqual([
      "licensing@ogserc.org.ng",
      "lic2@ogserc.org.ng",
    ]);
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityType: "Unit", entityId: lic.id },
    });
    expect(log.userId).toBe(admin.user.id);
    expect(log.before).toEqual({ emails: [] });
    expect(log.after).toEqual({
      emails: ["licensing@ogserc.org.ng", "lic2@ogserc.org.ng"],
    });
  });

  it("needs a division for every unit, and keeps divisions with units on", async () => {
    await expect(
      saveUnit(db, admin, null, { name: "New unit", active: "on" }),
    ).rejects.toThrow("Choose the unit's division.");
    const lic = await unit("Licensing unit");
    const division = await db.division.findUniqueOrThrow({
      where: { id: lic.divisionId! },
    });
    await expect(
      saveDivision(db, admin, division.id, {
        name: division.name,
        sortOrder: "1",
      }),
    ).rejects.toThrow("can't be switched off while");
    await saveDivision(db, admin, division.id, {
      name: division.name,
      emails: "llca@ogserc.org.ng",
      active: "on",
    });
    expect(
      (await db.division.findUniqueOrThrow({ where: { id: division.id } }))
        .emails,
    ).toEqual(["llca@ogserc.org.ng"]);
  });
});

describe("signatory list (C7)", () => {
  it("keeps exactly one default", async () => {
    const r = await saveSignatory(db, admin, null, {
      name: "Ade Bello",
      designation: "Ag. Secretary to the Commission",
      active: "on",
      isDefault: "on",
    });
    expect(r.message).toBe("Ade Bello added to the signatory list.");
    const defaults = await db.signatory.findMany({
      where: { isDefault: true },
    });
    expect(defaults.map((d) => d.name)).toEqual(["Ade Bello"]);

    await expect(
      saveSignatory(db, admin, defaults[0].id, {
        name: "Ade Bello",
        designation: "Ag. Secretary to the Commission",
        active: "on",
      }),
    ).rejects.toThrow("Make someone else the default first.");
    await expect(
      saveSignatory(db, admin, defaults[0].id, {
        name: "Ade Bello",
        designation: "Ag. Secretary to the Commission",
        isDefault: "on",
      }),
    ).rejects.toThrow("The default signatory must be in use.");
    await expect(
      saveSignatory(db, admin, null, {
        name: "jide onakoya",
        designation: "Chairman",
        active: "on",
      }),
    ).rejects.toThrow("Jide Onakoya is already on the signatory list.");
  });
});

describe("file class codes (C8)", () => {
  it("upper-cases, keeps codes unique, and allows none", async () => {
    const legal = await db.listItem.findFirstOrThrow({
      where: { list: "FILE_CLASS", label: "Legal" },
    });
    expect(
      (await saveFileClassCode(db, admin, legal.id, { code: "lg" })).message,
    ).toBe("Legal: code LG.");
    await expect(
      saveFileClassCode(db, admin, legal.id, { code: "rl" }),
    ).rejects.toThrow("Licensee file already uses the code RL.");
    await expect(
      saveFileClassCode(db, admin, legal.id, { code: "L/G" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      (await saveFileClassCode(db, admin, legal.id, { code: "" })).message,
    ).toBe("Legal: no code (references are typed).");
  });
});

describe("who may change the organisation (C12)", () => {
  it("Admin and the Head of Registry only", async () => {
    const lic = await unit("Licensing unit");
    const raw = {
      name: lic.name,
      divisionId: lic.divisionId!,
      emails: "x@ogserc.org.ng",
      active: "on",
    };
    const head = await actorFor(db, ids.users.head);
    await saveUnit(db, head, lic.id, raw);
    for (const who of [
      await actorFor(db, ids.users.officer),
      await actorFor(db, ids.users.secretary),
      await actorWithRole("FRONT_DESK_OFFICER"),
      await actorWithRole("UNIT_OFFICER", "Licensing unit"),
    ])
      await expect(saveUnit(db, who, lic.id, raw)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
  });
});
