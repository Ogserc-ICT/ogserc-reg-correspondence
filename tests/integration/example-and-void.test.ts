// The §12.2 example seeded through the real create functions, N4 (void), and
// the database-level protections (STACK rule 9).
import { beforeEach, describe, expect, it } from "vitest";
import {
  assertNotProduction,
  seedExample,
  type ExampleIds,
} from "../../prisma/seed/example";
import { seedReference } from "../../prisma/seed/reference";
import { instantIn } from "@/domain/clock";
import { loadDashboard } from "@/server/dashboard";
import { createInward, voidItem } from "@/server/registers";
import { actorFor, connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;

beforeEach(async () => {
  await resetDb(db);
  const seeded = await seedExample(db);
  if (!seeded) throw new Error("example not seeded");
  ids = seeded;
});

describe("§12.2 example in the database", () => {
  it("numbers the items in order and caches their status", async () => {
    const inward = await db.inwardItem.findMany({ orderBy: { serial: "asc" } });
    expect(inward.map((i) => [i.number, i.statusCache])).toEqual([
      ["OGSERC/ACK/2026/00001", "CLOSED"],
      ["OGSERC/ACK/2026/00002", "AWAITING_ROUTING"],
      ["OGSERC/ACK/2026/00003", "CLOSED"],
    ]);
    const outward = await db.outwardItem.findMany({
      orderBy: { serial: "asc" },
    });
    expect(
      outward.map((o) => [o.number, o.statusCache, o.dispatchedById !== null]),
    ).toEqual([
      ["OGSERC/OUT/2026/00001", "RESPONSE_RECEIVED", true],
      ["OGSERC/OUT/2026/00002", "DISPATCHED", true],
    ]);
    const i3 = await db.inwardItem.findUniqueOrThrow({
      where: { id: ids.I3 },
      include: { routedUnit: true },
    });
    expect(i3.routedUnit.name).toBe(
      "Office of the General Counsel and Secretary (Registry)",
    );
    // C13.1: only I3 was routed, by the Secretary; one routing event.
    expect(inward.map((i) => i.routedById !== null)).toEqual([
      false,
      false,
      true,
    ]);
    expect(
      await db.routingEvent.count({ where: { inwardItemId: ids.I3 } }),
    ).toBe(1);
  });

  it("matches the dashboard on 10 Dec 2026", async () => {
    const { incoming, outgoing, files } = await loadDashboard(db, DEC_10);
    expect(incoming).toMatchObject({
      logged: 3,
      awaitingRouting: 1,
      awaitingForwarding: 0,
      awaitingRoutingOrForwarding: 1,
      atFrontDesk: 0,
      closed: 2,
      closedOnTimePct: 100,
      afterHoursOrNonWorkingDay: 1,
    });
    expect(outgoing).toMatchObject({
      logged: 2,
      responsesReceived: 1,
      repliesToInward: 2,
    });
    expect(files).toMatchObject({
      outWithOfficers: 1,
      overdue: 1,
      movementsLogged: 2,
    });
  });

  it("is skipped when items already exist, and refused in production", async () => {
    expect(await seedExample(db)).toBeNull();
    expect(() => assertNotProduction({ NODE_ENV: "production" })).toThrow();
  });

  it("re-seeding reference data changes nothing an admin edited", async () => {
    await db.unit.update({
      where: { name: "Compliance/Legal Services unit: Legal" },
      data: { name: "Legal Services" },
    });
    const added = await seedReference(db, DEC_10);
    expect(Object.values(added).every((n) => n === 0)).toBe(true);
    expect(
      await db.unit.count({
        where: { name: "Compliance/Legal Services unit: Legal" },
      }),
    ).toBe(0);
  });
});

describe("N4: voiding I2", () => {
  const head = () =>
    db.user.findUniqueOrThrow({
      where: { email: "head.registry@example.invalid" },
    });

  it("keeps the number, drops it from counts, and never reissues it", async () => {
    const actor = await actorFor(db, (await head()).id);
    await db.$transaction((tx) =>
      voidItem(tx, "inward", ids.I2, "Logged twice", actor),
    );

    const i2 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect(i2).toMatchObject({
      number: "OGSERC/ACK/2026/00002",
      statusCache: "VOID",
      voidReason: "Logged twice",
    });

    const { incoming } = await loadDashboard(db, DEC_10);
    expect(incoming).toMatchObject({
      logged: 2,
      voided: 1,
      awaitingForwarding: 0,
    });

    // O1's only response is gone, so it is overdue again (due 9 Dec).
    const o1 = await db.outwardItem.findUniqueOrThrow({
      where: { id: ids.O1 },
    });
    expect(o1.statusCache).toBe("RESPONSE_OVERDUE");

    const i1 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I1 } });
    const officerActor = await actorFor(db, i1.receivedById);
    const next = await db.$transaction((tx) =>
      createInward(
        tx,
        {
          receivedAt: instantIn("2026-12-10", "10:00"),
          modeId: i1.modeId,
          typeId: i1.typeId,
          sender: "New sender",
          senderCategoryId: i1.senderCategoryId,
          subject: "New item",
          receivedById: i1.receivedById,
          ackIssuedViaId: i1.ackIssuedViaId,
          actionRequiredId: i1.actionRequiredId,
        },
        officerActor,
      ),
    );
    expect(next.number).toBe("OGSERC/ACK/2026/00004");

    const log = await db.auditLog.findMany({
      where: { entityId: ids.I2, action: "void" },
    });
    expect(log).toHaveLength(1);
    expect(log[0].after).toMatchObject({ voidReason: "Logged twice" });
  });

  it("needs a reason and cannot void twice", async () => {
    const actor = await actorFor(db, (await head()).id);
    await expect(
      db.$transaction((tx) => voidItem(tx, "inward", ids.I2, "  ", actor)),
    ).rejects.toThrow("reason");
    await db.$transaction((tx) =>
      voidItem(tx, "outward", ids.O2, "Wrong addressee", actor),
    );
    await expect(
      db.$transaction((tx) => voidItem(tx, "outward", ids.O2, "Again", actor)),
    ).rejects.toThrow("already void");
    // I3 loses its closing reply.
    const i3 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I3 } });
    expect(i3.statusCache).toBe("OPEN");
  });
});

describe("database protections", () => {
  it("blocks deleting an item", async () => {
    await expect(
      db.inwardItem.delete({ where: { id: ids.I1 } }),
    ).rejects.toThrow(/cannot be deleted/);
    await expect(db.outwardItem.deleteMany()).rejects.toThrow(
      /cannot be deleted/,
    );
  });

  it("blocks changing a number", async () => {
    await expect(
      db.inwardItem.update({
        where: { id: ids.I1 },
        data: { number: "OGSERC/ACK/2026/09999" },
      }),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      db.outwardItem.update({ where: { id: ids.O1 }, data: { serial: 7 } }),
    ).rejects.toThrow(/cannot be changed/);
  });

  it("blocks undoing a void and a void without a reason", async () => {
    const head = await db.user.findUniqueOrThrow({
      where: { email: "head.registry@example.invalid" },
    });
    await expect(
      db.inwardItem.update({
        where: { id: ids.I1 },
        data: { voidedAt: DEC_10, voidedById: head.id },
      }),
    ).rejects.toThrow(/void_complete/);
    const headActor = await actorFor(db, head.id);
    await db.$transaction((tx) =>
      voidItem(tx, "inward", ids.I1, "Test", headActor),
    );
    await expect(
      db.inwardItem.update({
        where: { id: ids.I1 },
        data: { voidedAt: null, voidedById: null, voidReason: null },
      }),
    ).rejects.toThrow(/cannot be undone/);
  });

  it("keeps the audit log append-only", async () => {
    const entry = await db.auditLog.findFirstOrThrow();
    await expect(
      db.auditLog.update({
        where: { id: entry.id },
        data: { action: "edited" },
      }),
    ).rejects.toThrow(/UPDATE is not allowed/);
    await expect(db.auditLog.deleteMany()).rejects.toThrow(
      /DELETE is not allowed/,
    );
  });

  it("allows one settings row only, never deleted", async () => {
    const s = await db.registrySettings.findUniqueOrThrow({ where: { id: 1 } });
    await expect(
      db.registrySettings.create({ data: { ...s, id: 2 } }),
    ).rejects.toThrow(/single_row/);
    await expect(
      db.registrySettings.delete({ where: { id: 1 } }),
    ).rejects.toThrow(/not allowed/);
  });

  it("never moves a counter back or deletes it", async () => {
    await expect(
      db.numberCounter.update({
        where: { series_year: { series: "ACK", year: 2026 } },
        data: { lastValue: 1 },
      }),
    ).rejects.toThrow(/only move forward/);
    await expect(db.numberCounter.deleteMany()).rejects.toThrow(
      /cannot be deleted/,
    );
  });
});

describe("full dashboard (SPEC §8.4)", () => {
  it("matches the §12.2 counts and breakdowns on 10 Dec 2026", async () => {
    const { loadFullDashboard } = await import("@/server/dashboard");
    const { loadPrincipal } = await import("@/server/session");
    const officer = await loadPrincipal(db, ids.users.officer);
    const d = await loadFullDashboard(db, DEC_10, officer);
    expect(d.summary.incoming).toMatchObject({
      logged: 3,
      awaitingRouting: 1,
      awaitingForwarding: 0,
      awaitingRoutingOrForwarding: 1,
      atFrontDesk: 0,
      closed: 2,
      closedOnTimePct: 100,
      afterHoursOrNonWorkingDay: 1,
    });
    expect(d.summary.outgoing).toMatchObject({
      logged: 2,
      responsesReceived: 1,
      repliesToInward: 2,
    });
    expect(d.summary.files).toMatchObject({ outWithOfficers: 1, overdue: 1 });
    expect(
      d.breakdowns.byUnit.find((u) => u.label === "Licensing unit"),
    ).toMatchObject({
      inwardRouted: 2,
      pending: 1,
      closed: 1,
      outwardOriginated: 1,
    });
    // C13.1: by division of the current unit.
    expect(d.breakdowns.byDivision).toHaveLength(5);
    expect(
      d.breakdowns.byDivision.find(
        (r) => r.label === "Legal, Licensing and Consumer Affairs",
      ),
    ).toMatchObject({ inwardRouted: 2, pending: 1, closed: 1 });
    expect(
      d.breakdowns.byDivision.find((r) => r.label === "Office of the Chairman"),
    ).toMatchObject({ inwardRouted: 1, closed: 1, outwardOriginated: 1 });
    expect(d.breakdowns.byUnit).toHaveLength(30);
    expect(d.breakdowns.byMonth[0]).toEqual({
      month: "2026-11",
      inward: 1,
      outward: 1,
    });
    expect(d.breakdowns.incomingByLga).toEqual([
      { label: "Sagamu", received: 1 },
    ]);
  });
});
