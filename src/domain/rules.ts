// The settings the domain rules read (SPEC §1 RegistrySettings; seed `settings`),
// and the system keys that mark list values the rules depend on. Admins may
// rename a list value, but its system key never changes.
import type { Holidays, IsoDate } from "./calendar";

export type RegistryRules = {
  timezone: string;
  /** "HH:mm"; receipt at or after this time is after hours (SPEC §2.1). */
  officeClosingTime: string;
  /** Receipt-mode ids the after-hours rule applies to (Q3). */
  afterHoursModes: readonly string[];
  /** Dispatch-mode ids that never need proof of delivery. */
  noDeliveryConfirmationModes: readonly string[];
  registryForwardingTargetDays: number;
  dispatchTargetDays: number;
  chaseProofOfDeliveryAfterDays: number;
  urgentResponseTargetDays: number;
  defaultResponseTargetDays: number;
  fileReturnTargetDays: number;
  effectiveDate: IsoDate;
  registrationDeadlineDays: number;
  /** Q1; Excel behaviour is false. */
  deadlineRollsToNextWorkingDay: boolean;
  /** Schedule 2 documents REG-01 needs at receipt (SPEC §4.4). */
  schedule2RequiredDocs: number;
  /** For a multi-State licensee (SPEC §4.4, Q-E). */
  schedule2RequiredDocsMultiState: number;
};

/** Everything a derivation needs besides the item: rules, holidays and today. */
export type RuleContext = {
  rules: RegistryRules;
  holidays: Holidays;
  /** Today in Lagos; get it from `todayIn(now)`. */
  today: IsoDate;
};

export type ActionRequiredKey =
  "REPLY_REQUIRED" | "ACTION_REQUIRED" | "FOR_INFORMATION" | "FILE_ONLY";
export type PriorityKey = "URGENT" | "HIGH" | "NORMAL" | "LOW";
export type AckViaKey =
  "PRINTED_SLIP" | "EMAIL" | "PORTAL" | "NOT_YET_ISSUED" | "NOT_REQUIRED";
export type FileStatusKey = "OPEN" | "CLOSED" | "ARCHIVED";

/** Action-required values that need no response (SPEC §4.2, §4.3). */
export function isNoteOnly(action: ActionRequiredKey | null): boolean {
  return action === "FOR_INFORMATION" || action === "FILE_ONLY";
}
