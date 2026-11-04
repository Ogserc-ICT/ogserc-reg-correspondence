// Scheduled jobs (STACK: cron calling a protected route, plus "Run now").
// Every run is recorded in JobRun with its outcome.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { addDays, type IsoDate } from "@/domain/calendar";
import type { JobRun, Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate } from "./dates";
import { retryEmails } from "./email/ack";
import type { Db } from "./db";
import { refreshInward, refreshOutward } from "./registers";
import { loadRuleContext } from "./rules";

type Outcome = { summary: string; result: Prisma.InputJsonValue };

/** Holidays still marked Estimated or Provisional in the next 30 days (Phase 8 warning). */
export async function upcomingUnconfirmedHolidays(
  db: Db,
  today: IsoDate,
  days = 30,
) {
  const rows = await db.publicHoliday.findMany({
    where: {
      status: { in: ["ESTIMATED", "PROVISIONAL"] },
      date: { gte: toDbDate(today), lte: toDbDate(addDays(today, days)) },
    },
    orderBy: { date: "asc" },
  });
  return rows.map((h) => ({
    date: fromDbDate(h.date),
    name: h.name,
    status: h.status,
    note: h.note,
  }));
}

/** Recomputes every item's cached status and routing (SPEC §9 R6). */
async function refreshStatus(db: Db, now: Date): Promise<Outcome> {
  const ctx = await loadRuleContext(db, now);
  const before = new Map<string, string | null>();
  const inward = await db.inwardItem.findMany({
    select: { id: true, statusCache: true },
  });
  const outward = await db.outwardItem.findMany({
    select: { id: true, statusCache: true },
  });
  for (const r of [...inward, ...outward]) before.set(r.id, r.statusCache);

  const chunk = <T>(xs: T[], n: number) =>
    Array.from({ length: Math.ceil(xs.length / n) }, (_, i) =>
      xs.slice(i * n, i * n + n),
    );
  for (const ids of chunk(
    inward.map((r) => r.id),
    200,
  ))
    await db.$transaction(async (tx) => {
      for (const id of ids) await refreshInward(tx, id, ctx);
    });
  for (const ids of chunk(
    outward.map((r) => r.id),
    200,
  ))
    await db.$transaction(async (tx) => {
      for (const id of ids) await refreshOutward(tx, id, ctx);
    });

  const after = [
    ...(await db.inwardItem.findMany({
      select: { id: true, statusCache: true },
    })),
    ...(await db.outwardItem.findMany({
      select: { id: true, statusCache: true },
    })),
  ];
  const changed = after.filter(
    (r) => before.get(r.id) !== r.statusCache,
  ).length;
  return {
    summary: `${inward.length} inward and ${outward.length} outward items checked; ${changed} changed status.`,
    result: {
      inward: inward.length,
      outward: outward.length,
      changed,
      today: ctx.today,
    },
  };
}

async function holidayCheck(db: Db, now: Date): Promise<Outcome> {
  const { today } = await loadRuleContext(db, now);
  const list = await upcomingUnconfirmedHolidays(db, today);
  return {
    summary: list.length
      ? `${list.length} holiday(s) in the next 30 days still need confirming: ${list
          .map((h) => `${h.name} (${h.date})`)
          .join(", ")}.`
      : "No unconfirmed holidays in the next 30 days.",
    result: { today, holidays: list },
  };
}

/** A backup older than this fails the check (one nightly run plus slack). */
export const BACKUP_MAX_AGE_HOURS = 26;

/**
 * Checks the newest database backup in BACKUP_DIR (written by
 * scripts/backup-db.sh) is recent. Fails when backups are not set up, so a
 * missing backup is never silent.
 */
export async function backupCheck(
  _db: Db,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Outcome> {
  const dir = env.BACKUP_DIR?.trim();
  if (!dir)
    throw new Error(
      "BACKUP_DIR is not set, so backups cannot be checked. See docs/OPERATIONS.md.",
    );
  let files: { name: string; at: Date; bytes: number }[];
  try {
    files = readdirSync(dir)
      .filter((f) => /\.(dump|sql|sql\.gz)$/.test(f))
      .map((name) => {
        const st = statSync(path.join(dir, name));
        return { name, at: st.mtime, bytes: st.size };
      });
  } catch {
    throw new Error(`Cannot read BACKUP_DIR (${dir}).`);
  }
  const newest = files.sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (!newest) throw new Error(`No backups in ${dir}.`);
  const hours = (now.getTime() - newest.at.getTime()) / 3_600_000;
  if (newest.bytes === 0)
    throw new Error(`The newest backup, ${newest.name}, is empty.`);
  if (hours > BACKUP_MAX_AGE_HOURS)
    throw new Error(
      `The newest backup, ${newest.name}, is ${Math.floor(hours)} hours old.`,
    );
  return {
    summary: `Newest backup ${newest.name} (${Math.round(newest.bytes / 1024)} KB, ${Math.floor(hours)} h old); ${files.length} kept.`,
    result: {
      newest: newest.name,
      hours: Math.floor(hours),
      count: files.length,
    },
  };
}

export const JOBS = {
  "refresh-status": {
    title: "Refresh statuses",
    description:
      "Recalculates every item's status from today's date, so filters on the cached status stay right. Run nightly after midnight (Lagos).",
    run: refreshStatus,
  },
  "backup-check": {
    title: "Backup check",
    description: `Checks the newest database backup in BACKUP_DIR is less than ${BACKUP_MAX_AGE_HOURS} hours old and not empty. Run each morning, after the nightly backup.`,
    run: (db: Db, now: Date) => backupCheck(db, now),
  },
  "email-retry": {
    title: "Send queued emails",
    description:
      "Sends acknowledgement emails that could not be sent when the item was saved or routed (up to 5 tries each). Runs daily; use Run now after fixing the email provider.",
    run: retryEmails,
  },
  "holiday-check": {
    title: "Holiday check",
    description:
      "Lists estimated or provisional public holidays in the next 30 days, so they can be confirmed before they move any deadline.",
    run: holidayCheck,
  },
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(JOBS, name);
}

/** Runs a job and records the run; errors are recorded, not thrown. */
export async function runJob(
  db: Db,
  job: JobName,
  now: Date,
  triggeredById: string | null,
): Promise<JobRun> {
  const run = await db.jobRun.create({
    data: { job, startedAt: new Date(), triggeredById },
  });
  try {
    const { summary, result } = await JOBS[job].run(db, now);
    return await db.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, summary, result },
    });
  } catch (err) {
    return await db.jobRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        summary: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export async function recentRuns(db: Db, take = 20) {
  return db.jobRun.findMany({
    orderBy: { startedAt: "desc" },
    take,
    include: { triggeredBy: { select: { name: true } } },
  });
}
