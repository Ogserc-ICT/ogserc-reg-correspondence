// Reference number format (SPEC §3.1). Assignment lives in the number service.
import { yearOf, type IsoDate } from "./calendar";

export type Series = "ACK" | "OUT";

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

/** "OGSERC/ACK/2026/00001" → "Slip OGSERC-ACK-2026-00001.pdf" (SPEC §7). */
export function slipFileName(no: string): string {
  return `Slip ${no.replaceAll("/", "-")}.pdf`;
}
