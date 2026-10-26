// Date-order rules the workbook never checked (SPEC §9 R10). Each returns
// every problem, worded for the screen; an empty list means the dates are fine.
import { compareDates, type IsoDate } from "./calendar";

const before = (a: IsoDate, b: IsoDate) => compareDates(a, b) < 0;
const after = (a: IsoDate, b: IsoDate) => compareDates(a, b) > 0;

export function inwardDateProblems(
  d: {
    receiptDate: IsoDate;
    receivedAtInFuture: boolean;
    documentDate?: IsoDate | null;
    dateForwarded?: IsoDate | null;
    dateClosedManual?: IsoDate | null;
  },
  today: IsoDate,
): string[] {
  const p: string[] = [];
  if (d.receivedAtInFuture)
    p.push("Date & time received can't be in the future.");
  if (d.documentDate && after(d.documentDate, today))
    p.push("Date of the letter can't be in the future.");
  if (d.dateForwarded) {
    if (before(d.dateForwarded, d.receiptDate))
      p.push("Date forwarded can't be before the date received.");
    if (after(d.dateForwarded, today))
      p.push("Date forwarded can't be in the future.");
  }
  if (d.dateClosedManual) {
    if (before(d.dateClosedManual, d.receiptDate))
      p.push("Date closed can't be before the date received.");
    if (after(d.dateClosedManual, today))
      p.push("Date closed can't be in the future.");
  }
  return p;
}

export function outwardDateProblems(
  d: {
    documentDate: IsoDate;
    dateDispatched?: IsoDate | null;
    dateDelivered?: IsoDate | null;
    deliveryConfirmed?: boolean | null;
  },
  today: IsoDate,
): string[] {
  const p: string[] = [];
  if (d.dateDispatched) {
    if (before(d.dateDispatched, d.documentDate))
      p.push("Date dispatched can't be before the date of the document.");
    if (after(d.dateDispatched, today))
      p.push("Date dispatched can't be in the future.");
  }
  if (d.dateDelivered || d.deliveryConfirmed) {
    if (!d.dateDispatched)
      p.push("Record the dispatch first (DISPATCHED TODAY).");
    else if (d.dateDelivered && before(d.dateDelivered, d.dateDispatched))
      p.push("Date delivered can't be before the date dispatched.");
  }
  if (d.dateDelivered && after(d.dateDelivered, today))
    p.push("Date delivered can't be in the future.");
  return p;
}

/** "Please complete:" list, in form order (TEMPLATES §4). */
export function missingFields(
  fields: readonly { label: string; value: unknown }[],
): string[] {
  return fields
    .filter(
      ({ value }) =>
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === ""),
    )
    .map(({ label }) => label);
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Nigerian and international numbers: digits, spaces, +, -, (), 7–20 digits. */
export function isPhone(s: string): boolean {
  if (!/^[+\d\s()-]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 20;
}

/** File Index dates (SPEC §6.1). */
export function fileDateProblems(
  d: { dateOpened: IsoDate; dateClosedOrArchived?: IsoDate | null },
  today: IsoDate,
): string[] {
  const p: string[] = [];
  if (after(d.dateOpened, today)) p.push("Date opened can't be in the future.");
  if (d.dateClosedOrArchived) {
    if (before(d.dateClosedOrArchived, d.dateOpened))
      p.push("Date closed / archived can't be before the date opened.");
    if (after(d.dateClosedOrArchived, today))
      p.push("Date closed / archived can't be in the future.");
  }
  return p;
}

/** A file can't come back before it went out, or in the future (R10). */
export function fileReturnProblems(
  d: { outDate: IsoDate; dateReturned: IsoDate },
  today: IsoDate,
): string[] {
  const p: string[] = [];
  if (before(d.dateReturned, d.outDate))
    p.push("Date returned can't be before the date the file went out.");
  if (after(d.dateReturned, today))
    p.push("Date returned can't be in the future.");
  return p;
}
