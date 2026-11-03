// Front desk intake (SPEC-v2 C3): documents handed in are logged before the
// Registry registers them. No acknowledgement is issued at this point.
import { workingDaysBetween, type IsoDate } from "./calendar";
import { dateIn } from "./clock";
import type { RuleContext } from "./rules";

export type IntakeStatus = "Awaiting registry" | "Registered";

export type IntakeFacts = {
  intakeNo: string;
  receivedAt: Date;
  /** Set when the Registry registers it (one inward item, never two). */
  inwardItemId: string | null;
  registeredAt: Date | null;
};

export type IntakeDerived = {
  status: IntakeStatus;
  receiptDate: IsoDate;
  /** workingDaysBetween(date(receivedAt), date(registeredAt) ?? today) (C3.1). */
  workingDaysWaiting: number;
};

export function deriveIntake(f: IntakeFacts, ctx: RuleContext): IntakeDerived {
  const tz = ctx.rules.timezone;
  const receiptDate = dateIn(f.receivedAt, tz);
  const until = f.registeredAt ? dateIn(f.registeredAt, tz) : ctx.today;
  return {
    status: f.inwardItemId ? "Registered" : "Awaiting registry",
    receiptDate,
    workingDaysWaiting: workingDaysBetween(receiptDate, until, ctx.holidays),
  };
}

/** C3.2 save message. */
export function intakeLoggedMessage(intakeNo: string): string {
  return `Logged as ${intakeNo}. No acknowledgement has been issued. Pass the document to the Registry - it stays on the 'Awaiting registry' list until the Registry registers it.`;
}

export function intakeAlreadyRegistered(
  intakeNo: string,
  ackNo: string,
): string {
  return `${intakeNo} is already registered as ${ackNo}.`;
}

export const REPLACE_FORM_PROMPT =
  "Replace what is typed on this form with the front desk details?";

/** The intake fields New Inward takes over (C3.2). */
export type IntakeFormValues = {
  receivedAt: Date | null;
  modeId: string | null;
  typeId: string | null;
  sender: string | null;
  subject: string | null;
  phone: string | null;
  deliveredBy: string | null;
  volumes: number | null;
  remarks: string | null;
};

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && !v.trim());

/** Only non-blank intake values are pulled into the form (C3.2). */
export function pullIntakeValues(
  intake: IntakeFormValues,
): Partial<IntakeFormValues> {
  return Object.fromEntries(
    Object.entries(intake).filter(([, v]) => !isBlank(v)),
  ) as Partial<IntakeFormValues>;
}

/**
 * Receipt facts on the form that differ from the intake. Both drive the para
 * 10(3) deemed receipt date, so a change needs a reason and is audited (C3.2,
 * E7; the mode was added on review).
 */
export function receiptChangedFromIntake(
  intake: { receivedAt: Date; modeId: string | null },
  form: { receivedAt: Date; modeId: string | null },
): ("receivedAt" | "modeId")[] {
  const changed: ("receivedAt" | "modeId")[] = [];
  if (intake.receivedAt.getTime() !== form.receivedAt.getTime())
    changed.push("receivedAt");
  if (intake.modeId && intake.modeId !== form.modeId) changed.push("modeId");
  return changed;
}
