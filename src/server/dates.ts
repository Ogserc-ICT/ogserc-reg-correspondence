// @db.Date columns arrive as UTC-midnight Dates; the domain uses "YYYY-MM-DD".
import { isIsoDate, type IsoDate } from "@/domain/calendar";

export function toDbDate(d: IsoDate): Date;
export function toDbDate(d: IsoDate | null | undefined): Date | null;
export function toDbDate(d: IsoDate | null | undefined): Date | null {
  if (!d) return null;
  if (!isIsoDate(d)) throw new Error(`Not a YYYY-MM-DD date: ${d}`);
  return new Date(`${d}T00:00:00Z`);
}

export function fromDbDate(d: Date): IsoDate;
export function fromDbDate(d: Date | null): IsoDate | null;
export function fromDbDate(d: Date | null): IsoDate | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
