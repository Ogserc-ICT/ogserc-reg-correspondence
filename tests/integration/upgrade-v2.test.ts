// V1: scripts/upgrade-reference-v2.ts on a database seeded before v2
// (production today: reference data and accounts, no items).
import { beforeEach, describe, expect, it } from "vitest";
import seedV1 from "../fixtures/seed-data-v1.json";
import { incomingTypeRow, seedReference } from "../../prisma/seed/reference";
import {
  NotConfirmedError,
  UPGRADE_ACTION,
  upgradeReferenceV2,
} from "../../prisma/seed/upgrade-v2";
import { typeUnitProblems } from "@/server/reference";
import { connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();

/** Turns the freshly seeded test database back into a v1-era one. */
async function makeV1Database() {
  await resetDb(db);
  await db.$executeRawUnsafe(
    `TRUNCATE "IncomingType", "Unit", "Division", "Signatory" CASCADE`,
  );
  const units = new Map<string, string>();
  for (const [i, name] of seedV1.units.entries())
    units.set(
      name,
      (await db.unit.create({ data: { name, sortOrder: i } })).id,
    );
  for (const [i, t] of seedV1.incomingTypes.entries())
    await db.incomingType.create({
      data: incomingTypeRow(
        { ...t, defaultUnitValid: true },
        units.get(t.defaultUnit)!,
        i,
      ),
    });
  // Settings and lists as the v1 seed left them (the truncate above cascades
  // through users into settings); v2-only tables empty, file classes uncoded.
  await seedReference(db, DEC_10);
  await db.signatory.deleteMany();
  await db.division.deleteMany();
  await db.listItem.updateMany({
    where: { list: "FILE_CLASS" },
    data: { code: null },
  });
  const unitOfficer = await db.user.create({
    data: {
      name: "Unit Officer",
      email: "unit.officer@ogserc.test",
      role: "UNIT_OFFICER",
      unitId: units.get("Registration & Licensing")!,
    },
  });
  const officer = await db.user.create({
    data: {
      name: "Registry Officer",
      email: "officer@ogserc.test",
      role: "REGISTRY_OFFICER",
    },
  });
  const list = async (l: "FILE_SECURITY" | "FILE_STATUS", label: string) =>
    (
      await db.listItem.findUniqueOrThrow({
        where: { list_label: { list: l, label } },
      })
    ).id;
  const file = await db.registryFile.create({
    data: {
      reference: "OGSERC/LEG/001",
      title: "Legal file",
      owningUnitId: units.get("Legal")!,
      dateOpened: new Date("2026-11-02"),
      securityId: await list("FILE_SECURITY", "Open"),
      fileStatusId: await list("FILE_STATUS", "Open"),
      createdById: officer.id,
    },
  });
  return { unitOfficer, file };
}

const upgradeAudits = () =>
  db.auditLog.count({ where: { action: UPGRADE_ACTION } });

describe("upgrade-reference-v2 on a v1 database", () => {
  let v1: Awaited<ReturnType<typeof makeV1Database>>;
  beforeEach(async () => {
    v1 = await makeV1Database();
  });

  it("dry run reports every change with before/after and saves nothing", async () => {
    const r = await upgradeReferenceV2(db, DEC_10, { commit: false });
    expect(r.committed).toBe(false);
    expect(r.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    const has = (entity: string, change: string, name: string) =>
      r.changes.some(
        (c) => c.entity === entity && c.change === change && c.name === name,
      );
    expect(has("Division", "create", "Office of the Chairman")).toBe(true);
    expect(has("Unit", "create", "Licensing unit")).toBe(true);
    expect(has("Unit", "deactivate", "Registration & Licensing")).toBe(true);
    expect(
      has(
        "IncomingType",
        "rename",
        "Consumer petition / public representation",
      ),
    ).toBe(true);
    expect(has("IncomingType", "create", "Public representation")).toBe(true);
    expect(
      r.changes.find((c) => c.entity === "User" && c.change === "remap"),
    ).toMatchObject({
      before: { unit: "Registration & Licensing" },
      after: { unit: "Licensing unit" },
    });
    // nothing saved
    expect(await db.division.count()).toBe(0);
    expect(await db.unit.count()).toBe(10);
    expect(await db.incomingType.count()).toBe(31);
    expect(await upgradeAudits()).toBe(0);
  });

  it("refuses to commit without the dry run's fingerprint, and saves nothing", async () => {
    await expect(
      upgradeReferenceV2(db, DEC_10, { commit: true }),
    ).rejects.toBeInstanceOf(NotConfirmedError);
    await expect(
      upgradeReferenceV2(db, DEC_10, { commit: true, confirm: "000000000000" }),
    ).rejects.toBeInstanceOf(NotConfirmedError);
    expect(await db.unit.count()).toBe(10);
    expect(await upgradeAudits()).toBe(0);
  });

  it("commits in one go with the fingerprint, applies the C1.1 map, then has nothing left to do", async () => {
    const dry = await upgradeReferenceV2(db, DEC_10, { commit: false });
    const r = await upgradeReferenceV2(db, DEC_10, {
      commit: true,
      confirm: dry.fingerprint,
    });
    expect(r.committed).toBe(true);
    expect(r.changes).toEqual(dry.changes);
    expect(r.warnings).toEqual([]);
    expect(await upgradeAudits()).toBe(r.changes.length);

    // organisation (C1)
    expect(await db.division.count()).toBe(5);
    const active = await db.unit.findMany({ where: { active: true } });
    expect(active).toHaveLength(30);
    expect(active.every((u) => u.divisionId && u.unitGroup)).toBe(true);
    expect(await db.unit.count({ where: { active: false } })).toBe(10);
    expect(
      (await db.unit.findUniqueOrThrow({ where: { name: "ICT unit" } })).emails,
    ).toEqual(["it@ogserc.org.ng"]);

    // users and files follow the C1.1 map
    const officer = await db.user.findUniqueOrThrow({
      where: { id: v1.unitOfficer.id },
      include: { unit: true },
    });
    expect(officer.unit!.name).toBe("Licensing unit");
    const file = await db.registryFile.findUniqueOrThrow({
      where: { id: v1.file.id },
      include: { owningUnit: true },
    });
    expect(file.owningUnit!.name).toBe("Compliance/Legal Services unit: Legal");

    // types (C2): 32, v2 defaults, nothing on an old unit
    const types = await db.incomingType.findMany({
      include: { defaultUnit: true },
    });
    expect(types).toHaveLength(32);
    expect(types.every((t) => t.defaultUnit.active)).toBe(true);
    const unitOf = (n: string) =>
      types.find((t) => t.name === n)!.defaultUnit.name;
    expect(unitOf("Letter from DisCo / GenCo / TCN")).toBe(
      "Networks unit: Transmission and Distribution",
    );
    expect(unitOf("Licensee returns / performance report")).toBe(
      "Performance Monitoring unit",
    );
    expect(unitOf("Consumer petition")).toBe("Customer Complaints");
    expect(unitOf("Public representation")).toBe(
      "Public Affairs and Stakeholder unit: Communication",
    );
    expect(await typeUnitProblems(db)).toEqual([]);

    // file class codes, signatories, email Off
    expect(
      await db.listItem.count({ where: { list: "FILE_CLASS", code: null } }),
    ).toBe(0);
    expect(await db.signatory.count()).toBe(2);
    expect(await db.user.count()).toBe(2); // no accounts created
    expect(
      (await db.registrySettings.findUniqueOrThrow({ where: { id: 1 } }))
        .ackEmailMode,
    ).toBe("OFF");

    // idempotent
    const again = await upgradeReferenceV2(db, DEC_10, { commit: false });
    expect(again.changes).toEqual([]);
  });

  it("keeps an admin's later edit to a v2 type on a second run", async () => {
    const dry = await upgradeReferenceV2(db, DEC_10, { commit: false });
    await upgradeReferenceV2(db, DEC_10, {
      commit: true,
      confirm: dry.fingerprint,
    });
    const ict = await db.unit.findUniqueOrThrow({
      where: { name: "ICT unit" },
    });
    await db.incomingType.update({
      where: { name: "Other correspondence" },
      data: { defaultUnitId: ict.id },
    });
    expect(
      (await upgradeReferenceV2(db, DEC_10, { commit: false })).changes,
    ).toEqual([]);
  });
});

describe("upgrade-reference-v2 on a freshly seeded v2 database", () => {
  it("has nothing to do", async () => {
    await resetDb(db);
    const r = await upgradeReferenceV2(db, DEC_10, { commit: false });
    expect(r.changes).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
