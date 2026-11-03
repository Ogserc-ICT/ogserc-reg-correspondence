// Inward items: derived fields, status and flags (SPEC §4.2–§4.4, with the
// v2 changes in SPEC-v2-CHANGES C4 and C5: routing, "Awaiting routing").
import {
  addWorkingDays,
  compareDates,
  workingDaysBetween,
  yearOf,
  type IsoDate,
} from "./calendar";
import { dateIn } from "./clock";
import { registrationDeadline } from "./receipt";
import {
  isNoteOnly,
  type AckViaKey,
  type ActionRequiredKey,
  type PriorityKey,
  type RuleContext,
} from "./rules";

/** The incoming type's rules as snapshotted on the item when it was saved (STACK rule 10). */
export type IncomingTypeSnapshot = {
  name: string;
  category: string;
  orderRef: string | null;
  defaultUnitId: string;
  responseTargetDays: number;
  /** REG-01 Registration (new): duplicate CAC, fee, Schedule 2 and deadline checks. */
  isRegistration: boolean;
  /** Update - material change, Annual confirmation, Deficiency response. */
  requiresRelatedOgsercNo: boolean;
};

/** An outward item that quotes this inward item as "in reply to". */
export type ReplyLink = {
  id: string;
  number: string;
  dateDispatched: IsoDate | null;
  /** OutgoingType.closesInwardItem (SPEC §9 R4). */
  closesInwardItem: boolean;
  voided: boolean;
};

/** Stored facts. Nullable fields cover imported rows; the forms require them. */
export type InwardFacts = {
  number: string;
  numberYear: number;
  receivedAt: Date | null;
  modeId: string | null;
  /** Snapshotted at save (§2.1), recalculated only when receivedAt or mode is edited. */
  deemedReceiptDate: IsoDate;
  type: IncomingTypeSnapshot | null;
  sender: string | null;
  senderCategoryId: string | null;
  subject: string | null;
  receivedById: string | null;
  ackIssuedVia: AckViaKey | null;
  actionRequired: ActionRequiredKey | null;
  /** Blank means Normal. */
  priority: PriorityKey | null;
  unitOverrideId: string | null;
  responseDueOverride: IsoDate | null;
  relatedOgsercNo: string | null;
  cacNo: string | null;
  schedule2DocsAttached: number | null;
  feeEvidenceAttached: boolean | null;
  /** SPEC §4.4 optional tick; null when not recorded. */
  multiState: boolean | null;
  /** Para 25 extension for this registrant (SPEC §2.2). */
  registrationDeadlineOverride: IsoDate | null;
  /**
   * Routed by the Secretary to the Commission / Head of Administration on the
   * Routing Desk (C5). Until then routedUnit is the type's suggested unit.
   */
  routed: boolean;
  /** Forwarded after the user confirmed it had not been routed (C5.4, E6). */
  forwardedBeforeRouting: boolean;
  dateForwarded: IsoDate | null;
  dateClosedManual: IsoDate | null;
  voided: boolean;
  replies: readonly ReplyLink[];
  /** Another non-void REG-01 has the same CAC; see `reg01CacDuplicates`. */
  possibleDuplicateCac: boolean;
};

export type InwardStatus =
  | "Void"
  | "Closed"
  | "Overdue"
  | "Awaiting routing"
  | "Awaiting forwarding"
  | "Noted / filed"
  | "Open";

/** Every status, in cascade order (C5.3). */
export const INWARD_STATUSES: readonly InwardStatus[] = [
  "Void",
  "Closed",
  "Overdue",
  "Awaiting routing",
  "Awaiting forwarding",
  "Noted / filed",
  "Open",
];

/**
 * The one definition of "pending" (SPEC §9 R12, C5.3), used by Pending
 * Actions, the unit filter and every dashboard table. C9's by-category "open"
 * without Overdue is treated as a spec error (docs/V2_GAP_REPORT.md C9).
 */
export const PENDING_INWARD: readonly InwardStatus[] = [
  "Open",
  "Overdue",
  "Awaiting forwarding",
  "Awaiting routing",
];

/** Not yet with the unit: the "Awaiting routing / forwarding" figure (C5.3, C9). */
export function isAwaitingRoutingOrForwarding(status: InwardStatus): boolean {
  return status === "Awaiting routing" || status === "Awaiting forwarding";
}

export const INWARD_FLAGS = {
  missingRequired: "Missing required field",
  duplicateCac: "Possible duplicate REG-01 (same CAC)",
  noFee: "No fee evidence with REG-01",
  schedule2Incomplete: "Schedule 2 documents incomplete at receipt",
  schedule2MultiState: "Schedule 2: 13 required for a multi-State licensee",
  relatedNoMissing: "Related OGSERC number missing",
  notForwarded: "Not forwarded within target",
  ackNotIssued: "Acknowledgement not yet issued",
  responseOverdue: "Response overdue",
  closedLate: "Closed after due date",
  forwardedBeforeRouting: "Forwarded before routing",
  numberYearDiffers: "Number year differs from deemed receipt year",
} as const;

export type InwardFlag = (typeof INWARD_FLAGS)[keyof typeof INWARD_FLAGS];

export type InwardDerived = {
  receiptDate: IsoDate | null;
  deemedReceiptDate: IsoDate;
  category: string | null;
  orderRef: string | null;
  routedUnitId: string | null;
  targetDays: number;
  responseDue: IsoDate | null;
  /** Every non-void reply, earliest dispatch first (SPEC §9 R3). */
  replies: ReplyLink[];
  /** The reply that closes the item: earliest dispatched closing reply. */
  replyOutward: ReplyLink | null;
  replyDispatchedOn: IsoDate | null;
  closedOn: IsoDate | null;
  status: InwardStatus;
  pending: boolean;
  workingDaysAtRegistry: number;
  workingDaysOpen: number;
  /** Only for REG-01; null otherwise. */
  filedAfterRegistrationDeadline: boolean | null;
  /** Only when Closed with a due date; null otherwise. */
  closedOnTime: boolean | null;
  /** Deemed receipt differs from the actual receipt date. */
  afterHoursOrNonWorkingDay: boolean;
  flags: InwardFlag[];
};

function byDispatchThenNumber(a: ReplyLink, b: ReplyLink): number {
  const da = a.dateDispatched ?? "9999-12-31";
  const db = b.dateDispatched ?? "9999-12-31";
  return da === db ? a.number.localeCompare(b.number) : da < db ? -1 : 1;
}

export function inwardResponseDue(
  f: InwardFacts,
  ctx: RuleContext,
): IsoDate | null {
  if (f.responseDueOverride) return f.responseDueOverride;
  if (isNoteOnly(f.actionRequired)) return null;
  const { rules, holidays } = ctx;
  if (f.priority === "URGENT")
    return addWorkingDays(
      f.deemedReceiptDate,
      rules.urgentResponseTargetDays,
      holidays,
    );
  const target = f.type?.responseTargetDays ?? rules.defaultResponseTargetDays;
  return target > 0
    ? addWorkingDays(f.deemedReceiptDate, target, holidays)
    : null;
}

export function deriveInward(f: InwardFacts, ctx: RuleContext): InwardDerived {
  const { rules, holidays, today } = ctx;
  const deemed = f.deemedReceiptDate;
  const receiptDate = f.receivedAt
    ? dateIn(f.receivedAt, rules.timezone)
    : null;

  const replies = f.replies.filter((r) => !r.voided).sort(byDispatchThenNumber);
  const replyOutward =
    replies.find((r) => r.closesInwardItem && r.dateDispatched) ?? null;
  const replyDispatchedOn = replyOutward?.dateDispatched ?? null;
  const closedOn = f.dateClosedManual ?? replyDispatchedOn;

  const responseDue = inwardResponseDue(f, ctx);
  const overdue = responseDue !== null && compareDates(today, responseDue) > 0;

  const status: InwardStatus = f.voided
    ? "Void"
    : closedOn
      ? "Closed"
      : overdue
        ? "Overdue"
        : !f.dateForwarded
          ? f.routed
            ? "Awaiting forwarding"
            : "Awaiting routing"
          : isNoteOnly(f.actionRequired)
            ? "Noted / filed"
            : "Open";

  const workingDaysAtRegistry = workingDaysBetween(
    deemed,
    f.dateForwarded ?? today,
    holidays,
  );
  const workingDaysOpen = workingDaysBetween(
    deemed,
    closedOn ?? today,
    holidays,
  );

  const isReg = f.type?.isRegistration ?? false;
  const deadline =
    f.registrationDeadlineOverride ?? registrationDeadline(rules, holidays);
  const filedAfterRegistrationDeadline = isReg
    ? compareDates(deemed, deadline) > 0
    : null;

  const closedLate =
    closedOn !== null &&
    responseDue !== null &&
    compareDates(closedOn, responseDue) > 0;
  const closedOnTime =
    status === "Closed" && responseDue !== null ? !closedLate : null;

  const flags: InwardFlag[] = [];
  const F = INWARD_FLAGS;
  if (isMissingRequired(f)) flags.push(F.missingRequired);
  if (isReg) {
    if (f.possibleDuplicateCac) flags.push(F.duplicateCac);
    if (f.feeEvidenceAttached !== true) flags.push(F.noFee);
    const docs = f.schedule2DocsAttached ?? 0;
    if (docs < rules.schedule2RequiredDocs) flags.push(F.schedule2Incomplete);
    else if (f.multiState && docs < rules.schedule2RequiredDocsMultiState)
      flags.push(F.schedule2MultiState);
  }
  if (f.type?.requiresRelatedOgsercNo && !f.relatedOgsercNo?.trim())
    flags.push(F.relatedNoMissing);
  if (
    !f.dateForwarded &&
    workingDaysAtRegistry > rules.registryForwardingTargetDays
  )
    flags.push(F.notForwarded);
  if (f.ackIssuedVia === "NOT_YET_ISSUED") flags.push(F.ackNotIssued);
  if (status === "Overdue") flags.push(F.responseOverdue);
  if (closedLate) flags.push(F.closedLate);
  if (f.forwardedBeforeRouting) flags.push(F.forwardedBeforeRouting);
  if (f.numberYear !== yearOf(deemed)) flags.push(F.numberYearDiffers);

  return {
    receiptDate,
    deemedReceiptDate: deemed,
    category: f.type?.category ?? null,
    orderRef: f.type?.orderRef ?? null,
    routedUnitId: f.unitOverrideId ?? f.type?.defaultUnitId ?? null,
    targetDays: f.type?.responseTargetDays ?? rules.defaultResponseTargetDays,
    responseDue,
    replies,
    replyOutward,
    replyDispatchedOn,
    closedOn,
    status,
    pending: PENDING_INWARD.includes(status),
    workingDaysAtRegistry,
    workingDaysOpen,
    filedAfterRegistrationDeadline,
    closedOnTime,
    afterHoursOrNonWorkingDay: receiptDate !== null && receiptDate !== deemed,
    flags: f.voided ? [] : flags,
  };
}

/**
 * Fields the New Inward form requires (C4). Action required is set on the
 * Routing Desk, so it is no longer checked here.
 */
function isMissingRequired(f: InwardFacts): boolean {
  const required = [
    f.receivedAt,
    f.modeId,
    f.type,
    f.sender?.trim(),
    f.senderCategoryId,
    f.subject?.trim(),
    f.receivedById,
    f.ackIssuedVia,
  ];
  return required.some((v) => v === null || v === undefined || v === "");
}

/**
 * Ids of non-void REG-01 items whose CAC number another non-void REG-01 also
 * has. CAC numbers match ignoring case and surrounding spaces.
 */
export function reg01CacDuplicates(
  items: readonly {
    id: string;
    isRegistration: boolean;
    cacNo: string | null;
    voided: boolean;
  }[],
): Set<string> {
  const byCac = new Map<string, string[]>();
  for (const it of items) {
    const cac = it.cacNo?.trim().toUpperCase();
    if (!it.isRegistration || it.voided || !cac) continue;
    byCac.set(cac, [...(byCac.get(cac) ?? []), it.id]);
  }
  return new Set([...byCac.values()].filter((ids) => ids.length > 1).flat());
}

/**
 * C4 save message for New Inward; the acknowledgement email line (C6), if
 * any, follows it after a blank line.
 */
export function savedInwardMessage(
  no: string,
  suggestedUnit: string,
  emailLine: string | null = null,
): string {
  const lines = [
    `Saved as ${no}.`,
    `Suggested unit: ${suggestedUnit}`,
    "Routing, file reference and handling will be set by the Secretary / Head of Admin on the Routing Desk.",
  ];
  return emailLine ? `${lines.join("\n")}\n\n${emailLine}` : lines.join("\n");
}
