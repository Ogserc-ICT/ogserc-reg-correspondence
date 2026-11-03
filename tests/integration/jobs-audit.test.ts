// Scheduled jobs (refresh statuses, holiday check), the cron route's
// secret, and the audit log viewer.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedExample, type ExampleIds } from "../../prisma/seed/example";
import { instantIn } from "@/domain/clock";
import { ForbiddenError } from "@/server/errors";
import { recentRuns, runJob, upcomingUnconfirmedHolidays } from "@/server/jobs";
import { auditLog, parseAuditFilters } from "@/server/read/audit";
import { loadPrincipal } from "@/server/session";
import { connectTestDb, resetDb } from "./helpers";

const db = connectTestDb();
let ids: ExampleIds;

// The cron route uses the app's client; point it at the test database.
vi.mock("@/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db")>()),
  getDb: () => db,
}));

beforeEach(async () => {
  await resetDb(db);
  ids = (await seedExample(db))!;
});

describe("refresh-status job", () => {
  it("moves I2 to Overdue on 16 Dec without anyone opening it", async () => {
    const i2 = () => db.inwardItem.findUniqueOrThrow({ where: { id: ids.I2 } });
    expect((await i2()).statusCache).toBe("AWAITING_ROUTING");
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

  it("runs a job for Vercel Cron's GET with the bearer secret", async () => {
    process.env.CRON_SECRET = "s3cret-value-for-tests";
    const { GET } = await import("@/app/api/jobs/[job]/route");
    const req = new NextRequest("http://localhost/api/jobs/holiday-check", {
      headers: { authorization: "Bearer s3cret-value-for-tests" },
    });
    const res = await GET(req, {
      params: Promise.resolve({ job: "holiday-check" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ job: "holiday-check", ok: true });
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

describe("backup check", () => {
  it("fails when backups are missing, empty or stale, and passes when recent", async () => {
    const { mkdtempSync, writeFileSync, utimesSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { backupCheck } = await import("@/server/jobs");
    const now = new Date("2026-12-10T06:00:00Z");
    await expect(backupCheck(db, now, {} as NodeJS.ProcessEnv)).rejects.toThrow(
      "BACKUP_DIR is not set",
    );

    const dir = mkdtempSync(path.join(tmpdir(), "backups-"));
    const env = { BACKUP_DIR: dir } as unknown as NodeJS.ProcessEnv;
    await expect(backupCheck(db, now, env)).rejects.toThrow("No backups");

    const file = path.join(dir, "registry-20261209T2330Z.dump");
    writeFileSync(file, "");
    utimesSync(file, now, new Date("2026-12-09T23:30:00Z"));
    await expect(backupCheck(db, now, env)).rejects.toThrow("is empty");

    writeFileSync(file, "PGDMP backup bytes");
    utimesSync(file, now, new Date("2026-12-09T23:30:00Z"));
    expect((await backupCheck(db, now, env)).summary).toContain("6 h old");

    utimesSync(file, now, new Date("2026-12-08T01:00:00Z"));
    await expect(backupCheck(db, now, env)).rejects.toThrow("53 hours old");
  });
});
