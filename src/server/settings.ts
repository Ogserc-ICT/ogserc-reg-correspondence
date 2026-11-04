// The single settings row: read and update (Admin only), every change audited
// with old and new values (STACK rule 13). The time zone is not editable:
// the app always runs on Africa/Lagos (CLAUDE.md rule 1).
import { z } from "zod";
import { isIsoDate } from "@/domain/calendar";
import type { Principal } from "@/domain/permissions";
import type { RegistrySettings } from "@/generated/prisma/client";
import { audit, changedFields } from "./audit";
import { fromDbDate, toDbDate } from "./dates";
import type { Db } from "./db";
import { normaliseEmails } from "@/domain/emails";
import { mailTransport } from "./email/transport";
import { assertCan, ValidationError } from "./errors";

const days = (label: string, max = 365) =>
  z.coerce
    .number({ error: `${label}: enter a number.` })
    .int(`${label}: whole days only.`)
    .min(0, `${label}: can't be negative.`)
    .max(max, `${label}: at most ${max}.`);

const isoDate = (label: string) =>
  z.string().refine(isIsoDate, `${label}: enter a date as YYYY-MM-DD.`);

const text = (label: string, max = 2000) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

const prefix = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      /^[A-Z0-9]+(\/[A-Z0-9]+)*$/,
      `${label}: capital letters and digits separated by "/", e.g. OGSERC/ACK.`,
    );

export const settingsSchema = z.object({
  ackPrefix: prefix("Inward prefix"),
  outPrefix: prefix("Outward prefix"),
  officeClosingTime: z
    .string()
    .regex(
      /^([01]\d|2[0-3]):[0-5]\d$/,
      "Office closing time: use HH:mm, e.g. 17:00.",
    ),
  registryForwardingTargetDays: days("Forwarding target"),
  dispatchTargetDays: days("Dispatch target"),
  chaseProofOfDeliveryAfterDays: days("Chase proof of delivery after"),
  urgentResponseTargetDays: days("Urgent response target"),
  defaultResponseTargetDays: days("Default response target"),
  fileReturnTargetDays: days("File return target"),
  effectiveDate: isoDate("Effective Date"),
  effectiveDateIsPlaceholder: z.boolean(),
  registrationDeadlineDays: days("Registration deadline", 3650),
  deadlineRollsToNextWorkingDay: z.boolean(),
  dashboardFirstMonth: isoDate("Dashboard first month").refine(
    (d) => d.endsWith("-01"),
    "Dashboard first month: use the first day of a month.",
  ),
  registryAddress: text("Registry address", 300),
  schedule2RequiredDocs: days("Schedule 2 documents", 100),
  schedule2RequiredDocsMultiState: days(
    "Schedule 2 documents (multi-State)",
    100,
  ),
  slipFooterRegistration: text("Registration slip footer"),
  slipFooterPara103: text("Para 10(3) slip footer"),
  slipFooterGeneral: text("General slip footer"),
  secretaryName: z.string().trim().max(200),
  headMayVoidOwnItems: z.boolean(),
  // SPEC-v2 C6.3: Off (default) | Review | Send; CC for every ack email.
  ackEmailMode: z.enum(["OFF", "REVIEW", "SEND"], {
    error: "Acknowledgement email: choose Off, Review or Send.",
  }),
  ackEmailCc: z.string().trim().max(1000, "Email CC is too long."),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

function toInput(s: RegistrySettings): SettingsInput {
  return {
    ackPrefix: s.ackPrefix,
    outPrefix: s.outPrefix,
    officeClosingTime: s.officeClosingTime,
    registryForwardingTargetDays: s.registryForwardingTargetDays,
    dispatchTargetDays: s.dispatchTargetDays,
    chaseProofOfDeliveryAfterDays: s.chaseProofOfDeliveryAfterDays,
    urgentResponseTargetDays: s.urgentResponseTargetDays,
    defaultResponseTargetDays: s.defaultResponseTargetDays,
    fileReturnTargetDays: s.fileReturnTargetDays,
    effectiveDate: fromDbDate(s.effectiveDate),
    effectiveDateIsPlaceholder: s.effectiveDateIsPlaceholder,
    registrationDeadlineDays: s.registrationDeadlineDays,
    deadlineRollsToNextWorkingDay: s.deadlineRollsToNextWorkingDay,
    dashboardFirstMonth: fromDbDate(s.dashboardFirstMonth),
    registryAddress: s.registryAddress,
    schedule2RequiredDocs: s.schedule2RequiredDocs,
    schedule2RequiredDocsMultiState: s.schedule2RequiredDocsMultiState,
    slipFooterRegistration: s.slipFooterRegistration,
    slipFooterPara103: s.slipFooterPara103,
    slipFooterGeneral: s.slipFooterGeneral,
    secretaryName: s.secretaryName,
    headMayVoidOwnItems: s.headMayVoidOwnItems,
    ackEmailMode: s.ackEmailMode,
    ackEmailCc: s.ackEmailCc,
  };
}

export async function getSettings(
  db: Db,
  actor: Principal,
): Promise<SettingsInput> {
  assertCan(actor, "settings.manage");
  return toInput(
    await db.registrySettings.findUniqueOrThrow({ where: { id: 1 } }),
  );
}

export async function updateSettings(
  db: Db,
  actor: Principal,
  input: unknown,
  now: Date,
): Promise<SettingsInput> {
  assertCan(actor, "settings.manage");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues.map((i) => i.message));
  const next = parsed.data;
  if (next.schedule2RequiredDocsMultiState < next.schedule2RequiredDocs)
    throw new ValidationError([
      "Schedule 2 documents (multi-State) can't be fewer than the standard number.",
    ]);
  const cc = normaliseEmails(next.ackEmailCc);
  if (cc.invalid.length)
    throw new ValidationError([
      `Email CC: not an email address: ${cc.invalid.join(", ")}.`,
    ]);
  next.ackEmailCc = cc.emails.join("; ");

  return db.$transaction(async (tx) => {
    const before = toInput(
      await tx.registrySettings.findUniqueOrThrow({ where: { id: 1 } }),
    );
    // Q-V2-1: no switching the email on until a provider is set up.
    if (
      next.ackEmailMode !== "OFF" &&
      next.ackEmailMode !== before.ackEmailMode &&
      !mailTransport()
    )
      throw new ValidationError([
        "Acknowledgement email: no email provider is set up (EMAIL_TRANSPORT), so it stays Off.",
      ]);
    const saved = await tx.registrySettings.update({
      where: { id: 1 },
      data: {
        ...next,
        effectiveDate: toDbDate(next.effectiveDate),
        dashboardFirstMonth: toDbDate(next.dashboardFirstMonth),
        updatedById: actor.id,
      },
    });
    const diff = changedFields(before, next);
    if (Object.keys(diff.after).length)
      await audit(
        tx,
        {
          userId: actor.id,
          action: "settings-update",
          entityType: "RegistrySettings",
          entityId: "1",
          ...diff,
        },
        now,
      );
    return toInput(saved);
  });
}
