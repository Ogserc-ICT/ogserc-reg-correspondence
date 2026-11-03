// Reference number format (SPEC §3.1, SPEC-v2 C3.1). Assignment lives in the
// number service.
import { yearOf, type IsoDate } from "./calendar";
import { dateIn } from "./clock";

/** ACK inward/acknowledgement, OUT outward, FD front desk intake (C3). */
export type Series = "ACK" | "OUT" | "FD";

const SERIAL_WIDTH = 5;

export function formatNumber(
  prefix: string,
  year: number,
  serial: number,
): string {
  if (!Number.isInteger(serial) || serial < 1)
    throw new Error(`Serial must be a positive whole number: ${serial}`);
  return `${prefix}/${year}/${String(serial).padStart(SERIAL_WIDTH, "0")}`;
}

/** Splits "OGSERC/ACK/2026/00001" into its prefix, year and serial. */
export function parseNumber(
  no: string,
): { prefix: string; year: number; serial: number } | null {
  const m = /^(.+)\/(\d{4})\/(\d{5,})$/.exec(no.trim());
  if (!m) return null;
  return { prefix: m[1], year: Number(m[2]), serial: Number(m[3]) };
}

/** ACK numbers take their year from the deemed receipt date. */
export function inwardNumberYear(deemedReceiptDate: IsoDate): number {
  return yearOf(deemedReceiptDate);
}

/** OUT numbers take their year from the date of the document. */
export function outwardNumberYear(documentDate: IsoDate): number {
  return yearOf(documentDate);
}

/**
 * FD intake numbers take the calendar year of the receipt time in Lagos, not
 * the deemed year (C3.1, V8): an email at 23:00 on 31 Dec is in the 2026 FD
 * series even though it is deemed received in 2027.
 */
export function intakeNumberYear(receivedAt: Date, tz: string): number {
  return yearOf(dateIn(receivedAt, tz));
}

/** "OGSERC/ACK/2026/00001" → "Slip OGSERC-ACK-2026-00001.pdf" (SPEC §7). */
export function slipFileName(no: string): string {
  return `Slip ${no.replaceAll("/", "-")}.pdf`;
}
