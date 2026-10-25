// Rules and holidays exactly as seeded from seed-data.json (SPEC §12: "Holidays =
// seed publicHolidays. Closing time 17:00."). List ids in tests are the labels.
import seed from "../../seed-data.json";
import type { Holidays } from "@/domain/calendar";
import type { RegistryRules } from "@/domain/rules";

export const seedHolidays: Holidays = new Set(
  seed.publicHolidays.map((h) => h.date),
);

export const seedRules: RegistryRules = {
  timezone: seed.settings.timezone,
  officeClosingTime: seed.settings.officeClosingTime,
  afterHoursModes: seed.settings.afterHoursModes,
  noDeliveryConfirmationModes: seed.settings.noDeliveryConfirmationModes,
  registryForwardingTargetDays: seed.settings.registryForwardingTargetDays,
  dispatchTargetDays: seed.settings.dispatchTargetDays,
  chaseProofOfDeliveryAfterDays: seed.settings.chaseProofOfDeliveryAfterDays,
  urgentResponseTargetDays: seed.settings.urgentResponseTargetDays,
  defaultResponseTargetDays: seed.settings.defaultResponseTargetDays,
  fileReturnTargetDays: seed.settings.fileReturnTargetDays,
  effectiveDate: seed.settings.effectiveDate,
  registrationDeadlineDays: seed.settings.registrationDeadlineDays,
  deadlineRollsToNextWorkingDay: false,
  schedule2RequiredDocs: 12,
  schedule2RequiredDocsMultiState: 13,
};
