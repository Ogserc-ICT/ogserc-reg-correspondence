// Registers, item detail, pickers and Desk counts against the §12.2 example
// on 10 Dec 2026.
import { beforeAll, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import type { Principal } from "@/domain/permissions";
import { loadDashboard } from "@/server/dashboard";
import { listFiles } from "@/server/queries";
import {
  inwardDetail,
  outwardDetail,
  searchFiles,
  searchInward,
  searchOutward,
} from "@/server/read/items";
import {
  inwardRegister,
  outwardRegister,
  parseFilters,
} from "@/server/read/registers";
import { loadPrincipal } from "@/server/session";
import { connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let officer: Principal;
let unitOfficer: Principal;

beforeAll(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  officer = await loadPrincipal(db, ids.users.officer);
  const unit = await db.unit.findUniqueOrThrow({
    where: { name: "Office of the General Counsel and Secretary (Registry)" },
  });
  const u = await db.user.create({
    data: {
      name: "PA",
      email: "pa@example.invalid",
      role: "UNIT_OFFICER",
      unitId: unit.id,
    },
  });
  unitOfficer = await loadPrincipal(db, u.id);
});

describe("inward register", () => {
  it("lists newest first with today's status and flags", async () => {
    const r = await inwardRegister(db, officer, {}, DEC_10);
    expect(
      r.rows.map((x) => [x.number, x.derived.status, x.derived.flags]),
    ).toEqual([
      ["OGSERC/ACK/2026/00003", "Closed", []],
      [
        "OGSERC/ACK/2026/00002",
        "Awaiting routing",
        ["Not forwarded within target"],
      ],
      ["OGSERC/ACK/2026/00001", "Closed", []],
    ]);
    expect(r).toMatchObject({
      total: 3,
      page: 1,
      pages: 1,
      today: "2026-12-10",
    });
  });

  it("filters by status, pending, flags, search, date range and sorts", async () => {
    const numbers = async (sp: Record<string, string>) =>
      (await inwardRegister(db, officer, parseFilters(sp), DEC_10)).rows.map(
        (r) => r.number,
      );
    expect(
      await numbers({ status: "Closed", sort: "number", dir: "asc" }),
    ).toEqual(["OGSERC/ACK/2026/00001", "OGSERC/ACK/2026/00003"]);
    expect(await numbers({ status: "Pending" })).toEqual([
      "OGSERC/ACK/2026/00002",
    ]);
    expect(await numbers({ flagged: "1" })).toEqual(["OGSERC/ACK/2026/00002"]);
    expect(await numbers({ q: "mini-grid" })).toEqual([
      "OGSERC/ACK/2026/00002",
      "OGSERC/ACK/2026/00001",
    ]);
    expect(await numbers({ q: "RC0000000" })).toEqual([
      "OGSERC/ACK/2026/00001",
    ]);
    expect(await numbers({ from: "2026-12-01", to: "2026-12-01" })).toEqual([
      "OGSERC/ACK/2026/00002",
    ]);
    expect(await numbers({ sort: "sender", dir: "asc" })).toEqual([
      "OGSERC/ACK/2026/00003",
      "OGSERC/ACK/2026/00001",
      "OGSERC/ACK/2026/00002",
    ]);
  });

  it("is overdue on 16 Dec without anything being saved", async () => {
    const r = await inwardRegister(
      db,
      officer,
      { status: "Overdue" },
      new Date("2026-12-16T08:00:00Z"),
    );
    expect(r.rows.map((x) => x.number)).toEqual(["OGSERC/ACK/2026/00002"]);
  });

  it("shows a unit officer only their unit", async () => {
    const r = await inwardRegister(db, unitOfficer, {}, DEC_10);
    expect(r.rows.map((x) => x.number)).toEqual(["OGSERC/ACK/2026/00003"]);
    const o = await outwardRegister(db, unitOfficer, {}, DEC_10);
    expect(o.rows.map((x) => x.number)).toEqual(["OGSERC/OUT/2026/00002"]);
  });

  it("ignores malformed filters", () => {
    expect(
      parseFilters({ unit: "x", from: "2026-13-01", page: "-3", dir: "up" }),
    ).toMatchObject({
      unitId: undefined,
      from: undefined,
      page: 1,
      dir: undefined,
    });
  });
});

describe("outward register", () => {
  it("derives status and the delivery chase on 16 Dec (C13.1: O2 dispatched 8 Dec)", async () => {
    const on15 = await outwardRegister(
      db,
      officer,
      {},
      new Date("2026-12-15T08:00:00Z"),
    );
    expect(on15.rows[0].derived.flags).toEqual([]);
    const r = await outwardRegister(
      db,
      officer,
      {},
      new Date("2026-12-16T08:00:00Z"),
    );
    expect(
      r.rows.map((x) => [x.number, x.derived.status, x.derived.flags]),
    ).toEqual([
      ["OGSERC/OUT/2026/00002", "Dispatched", ["Delivery not confirmed"]],
      ["OGSERC/OUT/2026/00001", "Response received", []],
    ]);
  });
});

describe("item detail", () => {
  it("shows I1 with its reply, file and history", async () => {
    const d = await inwardDetail(db, officer, ids.I1, DEC_10);
    expect(d?.derived).toMatchObject({
      status: "Closed",
      responseDue: "2026-12-18",
    });
    expect(d?.replies.map((r) => [r.number, r.status])).toEqual([
      ["OGSERC/OUT/2026/00001", "Response received"],
    ]);
    // F1 is Restricted, not Confidential: an officer may see it.
    expect(d?.file?.reference).toBe("OGSERC/RL/001");
    expect(d?.history.map((h) => [h.action, h.user?.name])).toEqual([
      ["create", "Registry Officer 1"],
    ]);
  });

  it("shows O1 with every response and the item it answers", async () => {
    const d = await outwardDetail(db, officer, ids.O1, DEC_10);
    expect(d?.inReplyTo?.number).toBe("OGSERC/ACK/2026/00001");
    expect(d?.responses.map((r) => r.number)).toEqual([
      "OGSERC/ACK/2026/00002",
    ]);
  });

  it("hides other units' items and bad ids", async () => {
    expect(await inwardDetail(db, unitOfficer, ids.I1, DEC_10)).toBeNull();
    expect(await inwardDetail(db, officer, "not-a-uuid", DEC_10)).toBeNull();
    // The unit officer sees O2 but not the file it sits on (no File Desk access).
    const o2 = await outwardDetail(db, unitOfficer, ids.O2, DEC_10);
    expect(o2?.file).toBeNull();
    expect(o2?.inReplyTo?.number).toBe("OGSERC/ACK/2026/00003");
  });
});

describe("file scope (SPEC §10)", () => {
  it("shows officers ordinary files but not Confidential or Personnel ones", async () => {
    const list = (l: string, label: string) =>
      db.listItem.findFirstOrThrow({ where: { list: l as never, label } });
    const base = {
      dateOpened: new Date("2026-11-02T00:00:00Z"),
      fileStatusId: (await list("FILE_STATUS", "Open")).id,
      createdById: ids.users.officer,
    };
    await db.registryFile.create({
      data: {
        ...base,
        reference: "OGSERC/HR/001",
        title: "Staff file",
        fileClassId: (await list("FILE_CLASS", "Personnel (confidential)")).id,
        securityId: (await list("FILE_SECURITY", "Restricted")).id,
      },
    });
    await db.registryFile.create({
      data: {
        ...base,
        reference: "OGSERC/LEG/001",
        title: "Litigation",
        securityId: (await list("FILE_SECURITY", "Confidential")).id,
      },
    });
    const refs = async (u: Principal) =>
      (await listFiles(db, u)).map((f) => f.reference);
    expect(await refs(officer)).toEqual(["OGSERC/GOV/001", "OGSERC/RL/001"]);
    const head = await loadPrincipal(db, ids.users.head);
    expect(await refs(head)).toEqual([
      "OGSERC/GOV/001",
      "OGSERC/HR/001",
      "OGSERC/LEG/001",
      "OGSERC/RL/001",
    ]);
    await db.registryFile.deleteMany({
      where: { reference: { in: ["OGSERC/HR/001", "OGSERC/LEG/001"] } },
    });
  });
});

describe("pickers and Desk counts", () => {
  it("searches by number, name or subject within scope", async () => {
    expect(
      (await searchInward(db, officer, "00002")).map((r) => r.number),
    ).toEqual(["OGSERC/ACK/2026/00002"]);
    expect(
      (await searchOutward(db, officer, "nigerian")).map((r) => r.number),
    ).toEqual(["OGSERC/OUT/2026/00002"]);
    expect(
      (await searchFiles(db, officer, "RL/")).map((r) => r.reference),
    ).toEqual(["OGSERC/RL/001"]);
    expect(await searchInward(db, unitOfficer, "mini-grid")).toEqual([]);
    expect(await searchInward(db, officer, "x")).toEqual([]);
  });

  it("counts the Desk tiles within the user's scope", async () => {
    const all = await loadDashboard(db, DEC_10, officer);
    expect(all.incoming).toMatchObject({
      awaitingRouting: 1,
      awaitingRoutingOrForwarding: 1,
      responseOverdue: 0,
    });
    expect(all.files.outWithOfficers).toBe(1);
    const unit = await loadDashboard(db, DEC_10, unitOfficer);
    expect(unit.incoming.logged).toBe(1);
    expect(unit.files.inIndex).toBe(0);
  });
});
