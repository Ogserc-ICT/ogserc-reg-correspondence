// Phase 5 acceptance: slips for I1–I3 (heading and footer variants), Daily
// Registers for 20 Nov and 2 Dec 2026, and Pending Actions.
import { beforeAll, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { instantIn } from "@/domain/clock";
import type { Principal } from "@/domain/permissions";
import { HEADING_GENERAL, HEADING_PARA103 } from "@/domain/slip";
import { ForbiddenError } from "@/server/errors";
import { dailyRegisterPdf, pendingActionsPdf } from "@/server/pdf/reports";
import { slipPdf } from "@/server/pdf/slip";
import {
  dailyRegister,
  inwardIdByNumber,
  latestInwardNumber,
  pendingActions,
  slipFor,
} from "@/server/read/reports";
import { loadPrincipal } from "@/server/session";
import { pdfPages } from "../pdf-text";
import { connectTestDb, DEC_10, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;
let officer: Principal;

beforeAll(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
  officer = await loadPrincipal(db, ids.users.officer);
  await db.registrySettings.update({
    where: { id: 1 },
    data: { secretaryName: "A. B. Secretary" },
  });
});

const REGISTRATION = "It is not a registration, licence or permit";
const SHORT_PARA103 = "Quote the acknowledgement number on all correspondence.";
const GENERAL =
  "Please quote the acknowledgement number on all further correspondence";

async function slipText(id: string) {
  const c = await slipFor(db, officer, id);
  if (!c) throw new Error("no slip");
  const pages = await pdfPages(await slipPdf(c));
  expect(pages).toHaveLength(1);
  return pages[0];
}

describe("acknowledgement slips", () => {
  it("I1 (REG-01): para 10(3) heading, registration footer, two copies", async () => {
    const t = await slipText(ids.I1);
    expect(t).toContain(HEADING_PARA103);
    expect(t).toContain(REGISTRATION);
    expect(t).toContain("after 5:00 p.m.");
    expect(t.match(/OGSERC\/ACK\/2026\/00001/g)).toHaveLength(2);
    expect(t).toContain("REGISTRANT'S / SENDER'S COPY");
    expect(t).toContain("REGISTRY COPY");
    expect(t).toContain("✂");
    expect(t).toContain("₦250,000");
    expect(t).toContain("20-Nov-2026 10:15");
    expect(t).toContain(
      "For the Secretary to the Commission (A. B. Secretary)",
    );
  });

  it("I2 (Deficiency response): para 10(3) heading and registration footer (Q4 list)", async () => {
    const t = await slipText(ids.I2);
    expect(t).toContain(HEADING_PARA103);
    expect(t).toContain(REGISTRATION);
    expect(t).toContain("30-Nov-2026 18:40");
    expect(t).toContain("01-Dec-2026"); // deemed
  });

  it("I3 (NERC letter): general heading and general footer", async () => {
    const t = await slipText(ids.I3);
    expect(t).toContain(HEADING_GENERAL);
    expect(t).not.toContain(HEADING_PARA103);
    expect(t).toContain(GENERAL);
    expect(t).not.toContain(REGISTRATION);
    expect(t).not.toContain(SHORT_PARA103);
    expect(t).toContain(
      "Office of the General Counsel and Secretary (Registry)",
    );
  });

  it("finds a slip by number and defaults to the latest item", async () => {
    expect(await inwardIdByNumber(db, officer, " ogserc/ack/2026/00002 ")).toBe(
      ids.I2,
    );
    expect(await latestInwardNumber(db, officer)).toBe("OGSERC/ACK/2026/00003");
  });

  it("is refused to roles without reports", async () => {
    const admin = await db.user.create({
      data: { name: "Admin", email: "admin.r@example.invalid", role: "ADMIN" },
    });
    await expect(
      slipFor(db, await loadPrincipal(db, admin.id), ids.I1),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Daily Register", () => {
  const numbers = async (date: string) => {
    const d = await dailyRegister(db, officer, date);
    return {
      received: d.received.map((r) => r.number),
      dispatched: d.dispatched.map((r) => r.number),
    };
  };

  it("20 Nov 2026: I1 received, nothing dispatched", async () => {
    expect(await numbers("2026-11-20")).toEqual({
      received: ["OGSERC/ACK/2026/00001"],
      dispatched: [],
    });
    const pages = await pdfPages(
      await dailyRegisterPdf(await dailyRegister(db, officer, "2026-11-20")),
    );
    const t = pages.join(" ");
    expect(t).toContain("Date: 20-Nov-2026");
    expect(t).toContain("Items received: 1");
    expect(t).toContain("Items dispatched: 0");
    expect(t).toContain("OGSERC/ACK/2026/00001");
    expect(t).toContain("10:15");
    expect(t).toContain("Head of Registry:");
    expect(t).toContain(
      "For the Secretary to the Commission (A. B. Secretary)",
    );
  });

  it("2 Dec 2026: I3 received; O2 (C13.1: dated 7 Dec) is dispatched 8 Dec", async () => {
    expect(await numbers("2026-12-02")).toEqual({
      received: ["OGSERC/ACK/2026/00003"],
      dispatched: [],
    });
    expect(await numbers("2026-12-07")).toEqual({
      received: [],
      dispatched: [],
    });
    expect(await numbers("2026-12-08")).toEqual({
      received: [],
      dispatched: ["OGSERC/OUT/2026/00002"],
    });
  });

  it("lists I2 on the day it arrived (30 Nov), not its deemed day (1 Dec)", async () => {
    expect((await numbers("2026-11-30")).received).toEqual([
      "OGSERC/ACK/2026/00002",
    ]);
    expect((await numbers("2026-12-01")).received).toEqual([]);
    expect((await numbers("2026-11-25")).dispatched).toEqual([
      "OGSERC/OUT/2026/00001",
    ]);
  });

  it("uses Lagos days: 23:30 UTC on 1 Dec belongs to 2 Dec", async () => {
    const i1 = await db.inwardItem.findUniqueOrThrow({ where: { id: ids.I1 } });
    const { createInward } = await import("@/server/registers");
    await db.$transaction((tx) =>
      createInward(
        tx,
        {
          receivedAt: new Date("2026-12-01T23:30:00Z"),
          modeId: i1.modeId,
          typeId: i1.typeId,
          sender: "Late courier",
          senderCategoryId: i1.senderCategoryId,
          subject: "Night delivery",
          receivedById: i1.receivedById,
          ackIssuedViaId: i1.ackIssuedViaId,
          actionRequiredId: i1.actionRequiredId,
        },
        { user: officer, now: instantIn("2026-12-02", "08:00") },
      ),
    );
    expect((await numbers("2026-12-02")).received).toEqual([
      "OGSERC/ACK/2026/00004",
      "OGSERC/ACK/2026/00003",
    ]);
    expect((await numbers("2026-12-01")).received).toEqual([]);
  });
});

describe("Pending Actions", () => {
  it("lists I2 on 10 Dec, Awaiting routing, with counters (C5.3)", async () => {
    const p = await pendingActions(db, officer, undefined, DEC_10);
    expect(p.rows.map((r) => r.number)).toContain("OGSERC/ACK/2026/00002");
    expect(p.counts).toMatchObject({ overdue: 0 });
    expect(p.counts.awaitingRoutingOrForwarding).toBe(p.counts.pending);
    const t = (await pdfPages(await pendingActionsPdf(p))).join(" ");
    expect(t).toContain("Unit: All units");
    expect(t).toContain("Printed: 10-Dec-2026 09:00");
    expect(t).toContain(`Pending: ${p.counts.pending}`);
    expect(t).toContain("OGSERC/ACK/2026/00002");
    expect(t).toContain(
      `Awaiting routing / fwd: ${p.counts.awaitingRoutingOrForwarding}`,
    );
    expect(t).toContain("Awaiting routing");
  });

  it("filters by unit and shows I2 overdue on 16 Dec", async () => {
    const chairman = await db.unit.findUniqueOrThrow({
      where: { name: "Office of the General Counsel and Secretary (Registry)" },
    });
    expect(
      (await pendingActions(db, officer, chairman.id, DEC_10)).rows,
    ).toEqual([]);
    const p = await pendingActions(
      db,
      officer,
      undefined,
      instantIn("2026-12-16", "09:00"),
    );
    const i2 = p.rows.find((r) => r.number === "OGSERC/ACK/2026/00002");
    expect(i2?.derived.status).toBe("Overdue");
    expect(p.counts.overdue).toBeGreaterThanOrEqual(1);
  });
});
