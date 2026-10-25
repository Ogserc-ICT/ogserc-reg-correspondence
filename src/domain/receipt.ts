// Deemed receipt date (para 10(3), SPEC §2.1) and registration deadline (§2.2).
import {
  addDays,
  addWorkingDays,
  isWorkingDay,
  type Holidays,
  type IsoDate,
} from "./calendar";
import { dateIn, parseTimeOfDay, secondsOfDayIn } from "./clock";
import type { RegistryRules } from "./rules";

export function deemedReceiptDate(
  receivedAt: Date,
  modeId: string,
  rules: Pick<
    RegistryRules,
    "timezone" | "officeClosingTime" | "afterHoursModes"
  >,
  hols: Holidays,
): IsoDate {
  const d = dateIn(receivedAt, rules.timezone);
  if (!isWorkingDay(d, hols)) return addWorkingDays(d, 1, hols);
  const afterHours =
    rules.afterHoursModes.includes(modeId) &&
    secondsOfDayIn(receivedAt, rules.timezone) >=
      parseTimeOfDay(rules.officeClosingTime);
  return afterHours ? addWorkingDays(d, 1, hols) : d;
}

/** Effective Date + 60 calendar days, rolled forward only if the setting says so (Q1). */
export function registrationDeadline(
  rules: Pick<
    RegistryRules,
    | "effectiveDate"
    | "registrationDeadlineDays"
    | "deadlineRollsToNextWorkingDay"
  >,
  hols: Holidays,
): IsoDate {
  const d = addDays(rules.effectiveDate, rules.registrationDeadlineDays);
  if (rules.deadlineRollsToNextWorkingDay && !isWorkingDay(d, hols))
    return addWorkingDays(d, 1, hols);
  return d;
}
