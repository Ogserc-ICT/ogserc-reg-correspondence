// Reading instants in Africa/Lagos (SPEC §2, §9 R7). The caller always passes
// `now`; nothing here reads the system clock or the server's time zone.
import { TZDate } from "@date-fns/tz";
import { isoDate, type IsoDate } from "./calendar";

export const LAGOS = "Africa/Lagos";

function inZone(instant: Date, tz: string): TZDate {
  return new TZDate(instant.getTime(), tz);
}

/** The calendar date of `instant` in `tz`. */
export function dateIn(instant: Date, tz: string = LAGOS): IsoDate {
  const z = inZone(instant, tz);
  return isoDate(z.getFullYear(), z.getMonth() + 1, z.getDate());
}

/** "Today" in Lagos for the injected `now`. */
export function todayIn(now: Date, tz: string = LAGOS): IsoDate {
  return dateIn(now, tz);
}

/** Seconds since local midnight in `tz`. */
export function secondsOfDayIn(instant: Date, tz: string = LAGOS): number {
  const z = inZone(instant, tz);
  return z.getHours() * 3600 + z.getMinutes() * 60 + z.getSeconds();
}

/** "HH:mm" → seconds since midnight. */
export function parseTimeOfDay(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m || +m[1] > 23 || +m[2] > 59)
    throw new Error(`Not an HH:mm time: ${hhmm}`);
  return +m[1] * 3600 + +m[2] * 60;
}

/** The instant at local date `d` and time "HH:mm" in `tz`. */
export function instantIn(d: IsoDate, hhmm: string, tz: string = LAGOS): Date {
  const [y, mo, da] = d.split("-").map(Number);
  const secs = parseTimeOfDay(hhmm);
  const z = new TZDate(
    y,
    mo - 1,
    da,
    Math.floor(secs / 3600),
    (secs % 3600) / 60,
    tz,
  );
  return new Date(z.getTime());
}
