// Workbook import (STACK rule 19) using the real reference workbook: dry run
// changes nothing, a commit keeps numbers and links, counters move past the
// imported numbers, and a second run duplicates nothing.
import { beforeEach, describe, expect, it } from "vitest";
import { instantIn } from "@/domain/clock";
import type { Principal } from "@/domain/permissions";
import { ForbiddenError } from "@/server/errors";
import { importWorkbook } from "@/server/import/workbook";
import { nextNumber } from "@/server/numbers";
import { loadPrincipal } from "@/server/session";
import { connectTestDb, resetDb } from "./helpers";

const db = connectTestDb();
const FILE = "reference/OGSERC_Registry_Correspondence_Workbook.xlsm";
const NOW = instantIn("2026-12-10", "09:00");
let head: Principal;

beforeEach(async () => {
  await resetDb(db);
  const u = await db.user.create({
    data: {
      name: "Head of Registry",
      email: "head.i@example.invalid",
      role: "HEAD_OF_REGISTRY",
    },
  });
  head = await loadPrincipal(db, u.id);
});

const run = (commit: boolean, includeExamples = true) =>
  importWorkbook(db, {
    file: FILE,
    as: head,
    now: NOW,
    commit,
    includeExamples,
  });

describe("workbook import", () => {
  it("dry run reports what it would do and saves nothing", async () => {
    const r = await run(false);
    expect(r).toMatchObject({
      committed: false,
      errors: [],
      files: { created: 2 },
      inward: { created: 3 },
      outward: { created: 2 },
      movements: { created: 2 },
    });
    expect(await db.inwardItem.count()).toBe(0);
    expect(await db.registryFile.count()).toBe(0);
    expect(await db.numberCounter.count()).toBe(0);
    // The workbook's "Registry Officer" is a placeholder, not a user.
    expect(
      r.warnings.some((w) => w.includes('"Registry Officer" is not a user')),
    ).toBe(true);
  });

  it("skips the workbook's EXAMPLE rows unless asked", async () => {
    const r = await run(false, false);
    expect(r.inward).toEqual({
      created: 0,
      skippedExisting: 0,
      skippedExamples: 3,
    });
    expect(r.files.skippedExamples).toBe(2);
  });

  it("commits with the original numbers, links and imported marks", async () => {
    const r = await run(true);
    expect(r.committed).toBe(true);
    const inward = await db.inwardItem.findMany({
      orderBy: { serial: "asc" },
      include: { inResponseToOutward: true, file: true },
    });
    expect(inward.map((i) => i.number)).toEqual([
      "OGSERC/ACK/2026/00001",
      "OGSERC/ACK/2026/00002",
      "OGSERC/ACK/2026/00003",
    ]);
    expect(inward.every((i) => i.imported)).toBe(true);
    expect(inward[1].inResponseToOutward?.number).toBe("OGSERC/OUT/2026/00001");
    expect(inward[1].deemedReceiptDate.toISOString().slice(0, 10)).toBe(
      "2026-12-01",
    );
    expect(inward[0].file?.reference).toBe("OGSERC/RL/001");
    expect(inward[0].amountShownKobo).toBe(BigInt(25_000_000));

    const o1 = await db.outwardItem.findFirstOrThrow({
      where: { number: "OGSERC/OUT/2026/00001" },
      include: { inReplyToInward: true },
    });
    expect(o1.inReplyToInward?.number).toBe("OGSERC/ACK/2026/00001");
    expect(o1.statusCache).toBe("RESPONSE_RECEIVED");
    expect(o1.signedByText).toBe("Secretary to the Commission");

    const i1 = inward[0];
    expect(i1.statusCache).toBe("CLOSED");
    expect(i1.remarks).toContain("[Workbook] Received by: Registry Officer");

    // Counters move past the imported numbers: the next items are 00004 / 00003.
    const next = await db.$transaction(async (tx) => [
      (await nextNumber("ACK", 2026, tx)).number,
      (await nextNumber("OUT", 2026, tx)).number,
    ]);
    expect(next).toEqual(["OGSERC/ACK/2026/00004", "OGSERC/OUT/2026/00003"]);

    const movements = await db.fileMovement.findMany({
      include: { file: true },
    });
    expect(movements.map((m) => m.file.reference).sort()).toEqual([
      "OGSERC/GOV/001",
      "OGSERC/RL/001",
    ]);
    const log = await db.auditLog.count({ where: { action: "import" } });
    expect(log).toBeGreaterThanOrEqual(9);
  });

  it("can be run again without duplicating anything", async () => {
    await run(true);
    const again = await run(true);
    expect(again).toMatchObject({
      committed: true,
      files: { created: 0, skippedExisting: 2 },
      inward: { created: 0, skippedExisting: 3 },
      outward: { created: 0, skippedExisting: 2 },
      movements: { created: 0, skippedExisting: 2 },
    });
    expect(await db.inwardItem.count()).toBe(3);
  });

  it("imports the v2 workbook: routing columns read, Front Desk Log never (SPEC-v2, E10)", async () => {
    const r = await importWorkbook(db, {
      file: "reference/OGSERC_Registry_Correspondence_Workbook_New.xlsm",
      as: head,
      now: NOW,
      commit: true,
      includeExamples: true,
    });
    expect(r).toMatchObject({
      committed: true,
      errors: [],
      inward: { created: 3 },
      outward: { created: 2 },
    });
    // E10: the real front desk entry (Verge Power Limited) is never imported.
    expect(await db.frontDeskIntake.count()).toBe(0);
    expect(JSON.stringify(r)).not.toContain("Verge Power");
    // The v2 example rows were not routed: I2 waits for the Routing Desk.
    const i2 = await db.inwardItem.findUniqueOrThrow({
      where: { number: "OGSERC/ACK/2026/00002" },
    });
    expect(i2).toMatchObject({
      routedAt: null,
      statusCache: "AWAITING_ROUTING",
    });
    // No "routed at registration" note: this workbook has a Routing Desk.
    expect(r.warnings.some((w) => w.includes("without a Routing Desk"))).toBe(
      false,
    );
  });

  it("marks v1 items with an action as routed when received", async () => {
    const r = await run(true);
    expect(
      r.warnings.some((w) =>
        w.startsWith("3 inward item(s) from a workbook without a Routing Desk"),
      ),
    ).toBe(true);
    const i2 = await db.inwardItem.findUniqueOrThrow({
      where: { number: "OGSERC/ACK/2026/00002" },
    });
    expect(i2.routedAt).toEqual(i2.receivedAt);
    expect(i2.routedById).toBeNull();
  });

  it("refuses anyone but the Head of Registry", async () => {
    const u = await db.user.create({
      data: {
        name: "Officer",
        email: "o.i@example.invalid",
        role: "REGISTRY_OFFICER",
      },
    });
    await expect(
      importWorkbook(db, {
        file: FILE,
        as: await loadPrincipal(db, u.id),
        now: NOW,
        commit: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

it("treats a movement typed into both places on the same day as one", async () => {
  // The app already has GOV/001 issued to the PA at 11:30; the workbook says 12:00.
  await importWorkbook(db, {
    file: FILE,
    as: head,
    now: NOW,
    commit: true,
    includeExamples: true,
  });
  const m = await db.fileMovement.findFirstOrThrow({
    where: { issuedTo: "PA to Chairman" },
  });
  await db.fileMovement.update({
    where: { id: m.id },
    data: { outAt: instantIn("2026-12-02", "11:30") },
  });
  const again = await importWorkbook(db, {
    file: FILE,
    as: head,
    now: NOW,
    commit: false,
    includeExamples: true,
  });
  expect(again.movements).toMatchObject({ created: 0, skippedExisting: 2 });
});

describe("parallel-run comparison", () => {
  it("matches every day after importing the workbook, and shows a difference", async () => {
    const { compareDailyCounts } = await import("@/server/import/compare");
    await importWorkbook(db, {
      file: FILE,
      as: head,
      now: NOW,
      commit: true,
      includeExamples: true,
    });
    const range = {
      file: FILE,
      from: "2026-11-20",
      to: "2026-12-10",
      includeExamples: true,
    };
    const before = await compareDailyCounts(db, range);
    expect(before.every((d) => d.matches)).toBe(true);
    expect(before.find((d) => d.date === "2026-11-30")?.received).toEqual({
      workbook: 1,
      app: 1,
    });

    // Void one item in the app: that day no longer matches, with both sides listed.
    const i2 = await db.inwardItem.findFirstOrThrow({
      where: { number: "OGSERC/ACK/2026/00002" },
    });
    await db.inwardItem.update({
      where: { id: i2.id },
      data: { voidedAt: NOW, voidedById: head.id, voidReason: "Test" },
    });
    const after = await compareDailyCounts(db, range);
    const day = after.find((d) => d.date === "2026-11-30")!;
    expect(day).toMatchObject({
      matches: false,
      received: { workbook: 1, app: 0 },
    });
    expect(day.detail?.workbookReceived[0]).toMatchObject({ time: "18:40" });
  });
});
