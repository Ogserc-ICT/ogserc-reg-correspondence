// Scheduled jobs (refresh statuses, holiday check), the cron route's
// secret, and the audit log viewer.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { instantIn } from "@/domain/clock";
import { ForbiddenError } from "@/server/errors";
import { recentRuns, runJob, upcomingUnconfirmedHolidays } from "@/server/jobs";
import { auditLog, parseAuditFilters } from "@/server/read/audit";
import { loadPrincipal } from "@/server/session";
import { connectTestDb, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
});

describe("refresh-status job", () => {
  it("moves I2 to Overdue on 16 Dec without anyone opening it", async () => {
    const i2 = () => db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect((await i2()).statusCache).toBe("AWAITING_FORWARDING");
    const run = await runJob(
      db,
      "refresh-status",
      instantIn("2026-12-16", "00:30"),
      null,
    );
    expect(run.ok).toBe(true);
    expect(run.summary).toBe(
      "3 inward and 2 outward items checked; 1 changed status.",
    );
    expect((await i2()).statusCache).toBe("OVERDUE");
    // Only I2 changes; the outward items are unaffected by the date.
    const o1 = await db.outwardItem.findUniqueOrThrow({
      where: { id: ids.O1 },
    });
    expect(o1.statusCache).toBe("RESPONSE_RECEIVED");
  });

  it("records the run and who started it", async () => {
    await runJob(
      db,
      "holiday-check",
      instantIn("2026-12-10", "09:00"),
      ids.users.head,
    );
    const [last] = await recentRuns(db);
    expect(last).toMatchObject({
      job: "holiday-check",
      ok: true,
      triggeredById: ids.users.head,
    });
  });
});

describe("holiday check", () => {
  it("lists estimated or provisional holidays in the next 30 days", async () => {
    // 28 Dec 2026 is a provisional substitute holiday in the seed.
    const list = await upcomingUnconfirmedHolidays(db, "2026-12-10");
    expect(list.map((h) => [h.date, h.status])).toEqual([
      ["2026-12-28", "PROVISIONAL"],
    ]);
    expect(await upcomingUnconfirmedHolidays(db, "2026-11-01")).toEqual([]);
    const run = await runJob(
      db,
      "holiday-check",
      instantIn("2026-12-10", "09:00"),
      null,
    );
    expect(run.summary).toContain(
      "Boxing Day holiday (substitute) (2026-12-28)",
    );
  });
});

describe("cron route", () => {
  const saved = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = saved;
  });
  const call = async (auth?: string) => {
    const { POST } = await import("@/app/api/jobs/[job]/route");
    const req = new NextRequest("http://localhost/api/jobs/holiday-check", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    });
    return POST(req, { params: Promise.resolve({ job: "holiday-check" }) });
  };

  it("refuses without the secret, and when no secret is configured", async () => {
    process.env.CRON_SECRET = "s3cret-value-for-tests";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    process.env.CRON_SECRET = "";
    expect((await call("Bearer s3cret-value-for-tests")).status).toBe(503);
  });
});

describe("audit log viewer", () => {
  it("is for the Head of Registry and Admin only", async () => {
    const officer = await loadPrincipal(db, ids.users.officer);
    await expect(
      auditLog(db, officer, parseAuditFilters({})),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("filters by number and action, newest first, with readable targets", async () => {
    const head = await loadPrincipal(db, ids.users.head);
    const byNumber = await auditLog(
      db,
      head,
      parseAuditFilters({ q: "ogserc/ack/2026/00001" }),
    );
    expect(byNumber.rows.map((r) => [r.action, r.target.text])).toEqual([
      ["create", "OGSERC/ACK/2026/00001"],
    ]);
    expect(byNumber.rows[0].target.href).toBe(`/inward/${ids.I1}`);
    const issues = await auditLog(
      db,
      head,
      parseAuditFilters({ action: "issue" }),
    );
    expect(issues.total).toBe(2);
    expect(issues.facets.types).toContain("InwardItem");
  });
});
