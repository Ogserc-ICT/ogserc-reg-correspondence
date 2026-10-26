// Parallel run (CLAUDE.md Phase 8 done-when): compare the daily counts in the
// workbook with the app. Both systems number items separately during the run,
// so days are compared by count, and a day that differs lists both sides'
// items so the gap can be found.
import ExcelJS from "exceljs";
import { addDays, compareDates, type IsoDate } from "@/domain/calendar";
import { dateIn, instantIn } from "@/domain/clock";
import { formatTime } from "@/domain/format";
import { fromDbDate, toDbDate } from "../dates";
import type { Db } from "../db";
import {
  COLS,
  date,
  instant,
  isExample,
  readSheet,
  SHEETS,
  text,
} from "./workbook";

export type DayLine = { time?: string; who: string; subject: string };

export type DayComparison = {
  date: IsoDate;
  received: { workbook: number; app: number };
  dispatched: { workbook: number; app: number };
  matches: boolean;
  /** Only for days that differ. */
  detail?: {
    workbookReceived: DayLine[];
    appReceived: DayLine[];
    workbookDispatched: DayLine[];
    appDispatched: DayLine[];
  };
};

function days(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

export async function compareDailyCounts(
  db: Db,
  input: {
    file: string | Buffer;
    from: IsoDate;
    to: IsoDate;
    includeExamples?: boolean;
  },
): Promise<DayComparison[]> {
  if (compareDates(input.from, input.to) > 0)
    throw new Error("--from is after --to.");
  if (days(input.from, input.to).length > 92)
    throw new Error("Compare at most 92 days at a time.");
  const wb = new ExcelJS.Workbook();
  if (typeof input.file === "string") await wb.xlsx.readFile(input.file);
  else await wb.xlsx.load(input.file as unknown as ArrayBuffer);

  const I = COLS.inward;
  const O = COLS.outward;
  const keep = (who: string | null) =>
    !!who && (input.includeExamples || !isExample(who));
  const wbIn = readSheet(wb, SHEETS.inward, [I.receivedAt, I.sender, I.subject])
    .map((r) => ({
      at: instant(r.get(I.receivedAt)),
      who: text(r.get(I.sender)),
      subject: text(r.get(I.subject)) ?? "",
    }))
    .filter((r) => r.at && keep(r.who));
  const wbOut = readSheet(wb, SHEETS.outward, [
    O.dateDispatched,
    O.addressee,
    O.subject,
  ])
    .map((r) => ({
      day: date(r.get(O.dateDispatched)),
      who: text(r.get(O.addressee)),
      subject: text(r.get(O.subject)) ?? "",
    }))
    .filter((r) => r.day && keep(r.who));

  // The app, as on the Daily Register: actual receipt day in Lagos, no voids.
  const appIn = await db.inwardItem.findMany({
    where: {
      voidedAt: null,
      receivedAt: {
        gte: instantIn(input.from, "00:00"),
        lt: instantIn(addDays(input.to, 1), "00:00"),
      },
    },
    select: { receivedAt: true, sender: true, subject: true },
    orderBy: { receivedAt: "asc" },
  });
  const appOut = await db.outwardItem.findMany({
    where: {
      voidedAt: null,
      dateDispatched: { gte: toDbDate(input.from), lte: toDbDate(input.to) },
    },
    select: { dateDispatched: true, addressee: true, subject: true },
  });

  return days(input.from, input.to).map((d) => {
    const wr = wbIn.filter((r) => dateIn(r.at!) === d);
    const ar = appIn.filter((r) => dateIn(r.receivedAt) === d);
    const wd = wbOut.filter((r) => r.day === d);
    const ad = appOut.filter((r) => fromDbDate(r.dateDispatched) === d);
    const matches = wr.length === ar.length && wd.length === ad.length;
    return {
      date: d,
      received: { workbook: wr.length, app: ar.length },
      dispatched: { workbook: wd.length, app: ad.length },
      matches,
      ...(matches
        ? {}
        : {
            detail: {
              workbookReceived: wr.map((r) => ({
                time: formatTime(r.at!),
                who: r.who!,
                subject: r.subject,
              })),
              appReceived: ar.map((r) => ({
                time: formatTime(r.receivedAt),
                who: r.sender,
                subject: r.subject,
              })),
              workbookDispatched: wd.map((r) => ({
                who: r.who!,
                subject: r.subject,
              })),
              appDispatched: ad.map((r) => ({
                who: r.addressee,
                subject: r.subject,
              })),
            },
          }),
    };
  });
}
