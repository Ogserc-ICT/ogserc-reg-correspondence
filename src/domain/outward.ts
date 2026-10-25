// Outward items: derived fields, status and flags (SPEC §5.2–§5.4).
import {
  addWorkingDays,
  compareDates,
  workingDaysBetween,
  type IsoDate,
} from "./calendar";
import type { RuleContext } from "./rules";

/** The outgoing type's rules as snapshotted on the item when it was saved (STACK rule 10). */
export type OutgoingTypeSnapshot = {
  name: string;
  responseExpected: boolean;
  responseWindowDays: number;
};

/** An inward item that quotes this outward item as "in response to our ref.". */
export type ResponseLink = {
  id: string;
  number: string;
  deemedReceiptDate: IsoDate;
  voided: boolean;
};

export type OutwardFacts = {
  number: string;
  documentDate: IsoDate;
  type: OutgoingTypeSnapshot;
  dispatchModeId: string;
  dateDispatched: IsoDate | null;
  deliveryConfirmed: boolean | null;
  dateDelivered: IsoDate | null;
  /** Null = use the type default. */
  responseExpectedOverride: boolean | null;
  responseDueOverride: IsoDate | null;
  inReplyToInwardId: string | null;
  voided: boolean;
  responses: readonly ResponseLink[];
};

export type OutwardStatus =
  | "Void"
  | "Not yet dispatched"
  | "Response received"
  | "Response overdue"
  | "Awaiting response"
  | "Delivered"
  | "Dispatched";

export const OUTWARD_FLAGS = {
  notDispatched: "Not dispatched within target",
  deliveryNotConfirmed: "Delivery not confirmed",
  responseOverdue: "Response overdue - follow up",
  dispatchedBeforeDocument: "Dispatched before document date",
} as const;

export type OutwardFlag = (typeof OUTWARD_FLAGS)[keyof typeof OUTWARD_FLAGS];

export type OutwardDerived = {
  responseExpected: boolean;
  responseDue: IsoDate | null;
  /** Every non-void response, earliest deemed receipt first (SPEC §9 R3). */
  responses: ResponseLink[];
  responseInward: ResponseLink | null;
  responseReceivedOn: IsoDate | null;
  workingDaysToDispatch: number;
  /** Null until dispatched. */
  workingDaysSinceDispatch: number | null;
  status: OutwardStatus;
  flags: OutwardFlag[];
};

export function outwardResponseDue(
  f: OutwardFacts,
  ctx: RuleContext,
): IsoDate | null {
  if (!f.dateDispatched) return null;
  if (f.responseDueOverride) return f.responseDueOverride;
  if (!(f.responseExpectedOverride ?? f.type.responseExpected)) return null;
  const window =
    f.type.responseWindowDays > 0
      ? f.type.responseWindowDays
      : ctx.rules.defaultResponseTargetDays;
  return addWorkingDays(f.dateDispatched, window, ctx.holidays);
}

export function deriveOutward(
  f: OutwardFacts,
  ctx: RuleContext,
): OutwardDerived {
  const { rules, holidays, today } = ctx;
  const responseExpected =
    f.responseExpectedOverride ?? f.type.responseExpected;
  const responseDue = outwardResponseDue(f, ctx);

  const responses = f.responses
    .filter((r) => !r.voided)
    .sort((a, b) =>
      a.deemedReceiptDate === b.deemedReceiptDate
        ? a.number.localeCompare(b.number)
        : a.deemedReceiptDate < b.deemedReceiptDate
          ? -1
          : 1,
    );
  const responseInward = responses[0] ?? null;

  const workingDaysToDispatch = workingDaysBetween(
    f.documentDate,
    f.dateDispatched ?? today,
    holidays,
  );
  const workingDaysSinceDispatch = f.dateDispatched
    ? workingDaysBetween(f.dateDispatched, today, holidays)
    : null;
  const overdue = responseDue !== null && compareDates(today, responseDue) > 0;

  const status: OutwardStatus = f.voided
    ? "Void"
    : !f.dateDispatched
      ? "Not yet dispatched"
      : responseInward
        ? "Response received"
        : overdue
          ? "Response overdue"
          : responseDue
            ? "Awaiting response"
            : f.deliveryConfirmed
              ? "Delivered"
              : "Dispatched";

  const flags: OutwardFlag[] = [];
  const F = OUTWARD_FLAGS;
  if (!f.dateDispatched && workingDaysToDispatch > rules.dispatchTargetDays)
    flags.push(F.notDispatched);
  if (
    workingDaysSinceDispatch !== null &&
    !f.deliveryConfirmed &&
    !rules.noDeliveryConfirmationModes.includes(f.dispatchModeId) &&
    workingDaysSinceDispatch > rules.chaseProofOfDeliveryAfterDays
  )
    flags.push(F.deliveryNotConfirmed);
  if (status === "Response overdue") flags.push(F.responseOverdue);
  if (f.dateDispatched && compareDates(f.dateDispatched, f.documentDate) < 0)
    flags.push(F.dispatchedBeforeDocument);

  return {
    responseExpected,
    responseDue,
    responses,
    responseInward,
    responseReceivedOn: responseInward?.deemedReceiptDate ?? null,
    workingDaysToDispatch,
    workingDaysSinceDispatch,
    status,
    flags: f.voided ? [] : flags,
  };
}
