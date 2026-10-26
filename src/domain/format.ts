// Display formats from TEMPLATES.md: dates dd-MMM-yyyy, date-times
// dd-MMM-yyyy HH:mm (Lagos), money ₦250,000, empty values "—".
import type { IsoDate } from "./calendar";
import { dateIn, LAGOS, secondsOfDayIn } from "./clock";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const BLANK = "—";

/** "2026-11-20" → "20-Nov-2026". */
export function formatDate(d: IsoDate | null | undefined): string {
  if (!d) return BLANK;
  const [y, m, day] = d.split("-");
  return `${day}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** "HH:mm" of an instant in Lagos. */
export function formatTime(instant: Date, tz: string = LAGOS): string {
  const s = secondsOfDayIn(instant, tz);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "20-Nov-2026 10:15" in Lagos. */
export function formatDateTime(
  instant: Date | null | undefined,
  tz: string = LAGOS,
): string {
  if (!instant) return BLANK;
  return `${formatDate(dateIn(instant, tz))} ${formatTime(instant, tz)}`;
}

/** Kobo → "₦250,000" (kobo shown only when not whole naira). */
export function formatNaira(kobo: bigint | number | null | undefined): string {
  if (kobo === null || kobo === undefined) return BLANK;
  const k = BigInt(kobo);
  const naira = k / BigInt(100);
  const rest = k % BigInt(100);
  const whole = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === BigInt(0)
    ? `₦${whole}`
    : `₦${whole}.${rest.toString().padStart(2, "0")}`;
}

/** "250,000.50" / "250000" → kobo; null when blank; NaN-safe. */
export function parseNairaToKobo(text: string): bigint | null | "invalid" {
  const t = text.replace(/[₦,\s]/g, "");
  if (!t) return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return "invalid";
  return BigInt(m[1]) * BigInt(100) + BigInt((m[2] ?? "0").padEnd(2, "0"));
}

/** "17:00" → "5:00 p.m." for the slip footer and messages. */
export function formatClockTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Yes / No / — for optional booleans. */
export function formatYesNo(v: boolean | null | undefined): string {
  return v === null || v === undefined ? BLANK : v ? "Yes" : "No";
}
