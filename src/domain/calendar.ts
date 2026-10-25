// Working-day arithmetic with Excel WORKDAY / NETWORKDAYS semantics (SPEC §2).
// Business dates are "YYYY-MM-DD" strings; nothing here knows about time zones.

/** A calendar date, "YYYY-MM-DD". */
export type IsoDate = string;

/** Public holidays, as IsoDates. */
export type Holidays = ReadonlySet<IsoDate>;

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  return toIsoDate(dayNumber(s)) === s;
}

/** Days since 1970-01-01. */
function dayNumber(d: IsoDate): number {
  const m = ISO_DATE.exec(d);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${d}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY;
}

function toIsoDate(n: number): IsoDate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  return toIsoDate(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function yearOf(d: IsoDate): number {
  return Number(d.slice(0, 4));
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return toIsoDate(dayNumber(d) + n);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(d: IsoDate): number {
  return (((dayNumber(d) + 4) % 7) + 7) % 7;
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return dayNumber(a) - dayNumber(b);
}

export function maxDate(...ds: (IsoDate | null | undefined)[]): IsoDate | null {
  let best: IsoDate | null = null;
  for (const d of ds) if (d && (best === null || d > best)) best = d;
  return best;
}

export function isWorkingDay(d: IsoDate, hols: Holidays): boolean {
  const dow = dayOfWeek(d);
  return dow !== 0 && dow !== 6 && !hols.has(d);
}

/**
 * Excel `WORKDAY(d, n, Hols)`: step one day at a time, counting only working
 * days, until `n` have been counted. `d` itself is never counted, so
 * `addWorkingDays(d, 0)` is `d` even on a holiday.
 */
export function addWorkingDays(d: IsoDate, n: number, hols: Holidays): IsoDate {
  if (!Number.isInteger(n)) throw new Error(`Whole days only: ${n}`);
  const step = n < 0 ? -1 : 1;
  let day = dayNumber(d);
  for (let left = Math.abs(n); left > 0;) {
    day += step;
    if (isWorkingDay(toIsoDate(day), hols)) left--;
  }
  return toIsoDate(day);
}

/** Excel `NETWORKDAYS(a, b, Hols)` for a <= b: working days in [a, b]. */
function networkDays(a: IsoDate, b: IsoDate, hols: Holidays): number {
  let count = 0;
  for (let day = dayNumber(a), end = dayNumber(b); day <= end; day++)
    if (isWorkingDay(toIsoDate(day), hols)) count++;
  return count;
}

/**
 * `MAX(0, NETWORKDAYS(a, b, Hols) − 1)`: the one helper for every
 * "working days at registry / open / out / to dispatch / since dispatch".
 */
export function workingDaysBetween(
  a: IsoDate,
  b: IsoDate,
  hols: Holidays,
): number {
  if (compareDates(a, b) > 0) return 0;
  return Math.max(0, networkDays(a, b, hols) - 1);
}
