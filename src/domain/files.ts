// Registry files and file movements: derived fields, status and flags (SPEC §6).
import {
  addWorkingDays,
  compareDates,
  maxDate,
  workingDaysBetween,
  type IsoDate,
} from "./calendar";
import { dateIn } from "./clock";
import type { FileStatusKey, RuleContext } from "./rules";

export type MovementFacts = {
  id: string;
  outAt: Date;
  issuedTo: string;
  /** Unit name, for "currently with". */
  unitName: string | null;
  returnByOverride: IsoDate | null;
  dateReturned: IsoDate | null;
  /** Issued after confirming the file was still out (SPEC §6.2). */
  issuedWhileOut: boolean;
};

export type MovementStatus = "Returned" | "Overdue" | "Out";

export const MOVEMENT_FLAGS = {
  earlierNotReturned: "Earlier movement of this file not returned",
} as const;

export type MovementDerived = {
  outDate: IsoDate;
  returnDue: IsoDate;
  workingDaysOut: number;
  status: MovementStatus;
  holder: string;
  flags: (typeof MOVEMENT_FLAGS)[keyof typeof MOVEMENT_FLAGS][];
};

export function deriveMovement(
  m: MovementFacts,
  ctx: RuleContext,
): MovementDerived {
  const { rules, holidays, today } = ctx;
  const outDate = dateIn(m.outAt, rules.timezone);
  const returnDue =
    m.returnByOverride ??
    addWorkingDays(outDate, rules.fileReturnTargetDays, holidays);
  const status: MovementStatus = m.dateReturned
    ? "Returned"
    : compareDates(today, returnDue) > 0
      ? "Overdue"
      : "Out";
  return {
    outDate,
    returnDue,
    workingDaysOut: workingDaysBetween(
      outDate,
      m.dateReturned ?? today,
      holidays,
    ),
    status,
    holder: holderLabel(m),
    flags: m.issuedWhileOut ? [MOVEMENT_FLAGS.earlierNotReturned] : [],
  };
}

/** "{issuedTo} ({unit})", or the name alone when no unit was recorded. */
export function holderLabel(
  m: Pick<MovementFacts, "issuedTo" | "unitName">,
): string {
  return m.unitName ? `${m.issuedTo} (${m.unitName})` : m.issuedTo;
}

/** The latest movement by time out, or null. */
export function latestMovement<T extends Pick<MovementFacts, "outAt">>(
  movements: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const m of movements)
    if (!latest || m.outAt.getTime() > latest.outAt.getTime()) latest = m;
  return latest;
}

/** The latest unreturned movement: what "Record return" acts on, and what "Issue" warns about. */
export function unreturnedMovement<
  T extends Pick<MovementFacts, "outAt" | "dateReturned">,
>(movements: readonly T[]): T | null {
  return latestMovement(movements.filter((m) => !m.dateReturned));
}

export type FileFacts = {
  reference: string;
  fileStatus: FileStatusKey;
  dateClosedOrArchived: IsoDate | null;
  inward: readonly { deemedReceiptDate: IsoDate; voided: boolean }[];
  outward: readonly { documentDate: IsoDate; voided: boolean }[];
  movements: readonly MovementFacts[];
};

export const REGISTRY = "Registry";

export const FILE_FLAGS = {
  outBeyondReturn: "Out beyond return date",
  correspondenceAfterClose: "Correspondence after file closed",
} as const;

export type FileFlag = (typeof FILE_FLAGS)[keyof typeof FILE_FLAGS];

export type FileDerived = {
  inwardCount: number;
  outwardCount: number;
  lastCorrespondence: IsoDate | null;
  /** `Registry`, or the holder of the latest movement if it is not back. */
  currentlyWith: string;
  isOut: boolean;
  outSince: IsoDate | null;
  workingDaysOut: number | null;
  latestMovementStatus: MovementStatus | null;
  flags: FileFlag[];
};

export function deriveFile(f: FileFacts, ctx: RuleContext): FileDerived {
  const inward = f.inward.filter((i) => !i.voided);
  const outward = f.outward.filter((o) => !o.voided);
  const lastCorrespondence = maxDate(
    ...inward.map((i) => i.deemedReceiptDate),
    ...outward.map((o) => o.documentDate),
  );

  const latest = latestMovement(f.movements);
  const latestDerived = latest ? deriveMovement(latest, ctx) : null;
  const out =
    latest && latestDerived && !latest.dateReturned ? latestDerived : null;

  const flags: FileFlag[] = [];
  if (latestDerived?.status === "Overdue")
    flags.push(FILE_FLAGS.outBeyondReturn);
  if (
    f.fileStatus !== "OPEN" &&
    f.dateClosedOrArchived &&
    lastCorrespondence &&
    compareDates(lastCorrespondence, f.dateClosedOrArchived) > 0
  )
    flags.push(FILE_FLAGS.correspondenceAfterClose);

  return {
    inwardCount: inward.length,
    outwardCount: outward.length,
    lastCorrespondence,
    currentlyWith: out ? out.holder : REGISTRY,
    isOut: out !== null,
    outSince: out?.outDate ?? null,
    workingDaysOut: out?.workingDaysOut ?? null,
    latestMovementStatus: latestDerived?.status ?? null,
    flags,
  };
}
