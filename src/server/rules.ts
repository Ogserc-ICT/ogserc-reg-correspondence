// Loads the domain's RuleContext (settings, receipt-mode lists, holidays, today).
import { todayIn } from "@/domain/clock";
import type { RegistryRules, RuleContext } from "@/domain/rules";
import type { Db, Tx } from "./db";
import { fromDbDate } from "./dates";

export async function loadRules(db: Db | Tx): Promise<RegistryRules> {
  // Sequential: a transaction client runs one query at a time.
  const s = await db.registrySettings.findUniqueOrThrow({ where: { id: 1 } });
  const modes = await db.listItem.findMany({
    where: {
      list: "RECEIPT_MODE",
      OR: [{ afterHoursCutoff: true }, { noDeliveryConfirmation: true }],
    },
    select: { id: true, afterHoursCutoff: true, noDeliveryConfirmation: true },
  });
  return {
    timezone: s.timezone,
    officeClosingTime: s.officeClosingTime,
    afterHoursModes: modes.filter((m) => m.afterHoursCutoff).map((m) => m.id),
    noDeliveryConfirmationModes: modes
      .filter((m) => m.noDeliveryConfirmation)
      .map((m) => m.id),
    registryForwardingTargetDays: s.registryForwardingTargetDays,
    dispatchTargetDays: s.dispatchTargetDays,
    chaseProofOfDeliveryAfterDays: s.chaseProofOfDeliveryAfterDays,
    urgentResponseTargetDays: s.urgentResponseTargetDays,
    defaultResponseTargetDays: s.defaultResponseTargetDays,
    fileReturnTargetDays: s.fileReturnTargetDays,
    effectiveDate: fromDbDate(s.effectiveDate),
    registrationDeadlineDays: s.registrationDeadlineDays,
    deadlineRollsToNextWorkingDay: s.deadlineRollsToNextWorkingDay,
    schedule2RequiredDocs: s.schedule2RequiredDocs,
    schedule2RequiredDocsMultiState: s.schedule2RequiredDocsMultiState,
  };
}

export async function loadHolidays(db: Db | Tx): Promise<Set<string>> {
  const rows = await db.publicHoliday.findMany({ select: { date: true } });
  return new Set(rows.map((h) => fromDbDate(h.date)));
}

export async function loadRuleContext(
  db: Db | Tx,
  now: Date,
): Promise<RuleContext> {
  const rules = await loadRules(db);
  const holidays = await loadHolidays(db);
  return { rules, holidays, today: todayIn(now, rules.timezone) };
}
