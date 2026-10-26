// Scheduled jobs (STACK: cron calling a protected route, plus "Run now").
// Every run is recorded in JobRun with its outcome.
import { addDays, type IsoDate } from "@/domain/calendar";
import type { JobRun, Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate } from "./dates";
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

export const JOBS = {
  "refresh-status": {
    title: "Refresh statuses",
    description:
      "Recalculates every item's status from today's date, so filters on the cached status stay right. Run nightly after midnight (Lagos).",
    run: refreshStatus,
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
