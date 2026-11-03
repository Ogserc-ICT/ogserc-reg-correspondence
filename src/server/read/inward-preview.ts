// New Inward "Will be saved as" panel: what the item would get if saved now,
// worked out by the same domain rules as the save. Read-only: the number is a
// peek at the counter, not a reservation, so the screen says "expected".
import { LEGACY_ROUTED } from "../facts";
import { compareDates, isWorkingDay, yearOf } from "@/domain/calendar";
import { formatNumber } from "@/domain/numbering";
import { deriveInward, INWARD_FLAGS, type InwardFlag } from "@/domain/inward";
import type { Principal } from "@/domain/permissions";
import { deemedReceiptDate } from "@/domain/receipt";
import type { AckViaKey, ActionRequiredKey, PriorityKey } from "@/domain/rules";
import { fromDbDate } from "../dates";
import type { Db } from "../db";
import { loadRuleContext } from "../rules";
import { readInward } from "../workflows/inward";
import type { Raw } from "../workflows/common";

/** Flags that depend only on what is typed, so they can be fixed before saving. */
const INPUT_FLAGS: readonly InwardFlag[] = [
  INWARD_FLAGS.duplicateCac,
  INWARD_FLAGS.noFee,
  INWARD_FLAGS.schedule2Incomplete,
  INWARD_FLAGS.schedule2MultiState,
  INWARD_FLAGS.relatedNoMissing,
  INWARD_FLAGS.ackNotIssued,
];

export type InwardPreview = {
  expectedNumber: string | null;
  receiptDate: string | null;
  deemedReceiptDate: string | null;
  /** Why deemed receipt is later than the receipt date, if it is. */
  deemedReason: "after-hours" | "non-working-day" | null;
  officeClosingTime: string;
  modeLabel: string | null;
  routeTo: string | null;
  orderRef: string | null;
  category: string | null;
  isRegistration: boolean;
  responseDue: string | null;
  /** Working days counted, or null when the due date was typed in. */
  targetDays: number | null;
  noteOnly: boolean;
  /** Weekday public holidays the response clock skips. */
  holidaysSkipped: { date: string; name: string }[];
  slipWording: "Para 10(3)" | "General" | null;
  warnings: InwardFlag[];
};

export async function inwardPreview(
  db: Db,
  _user: Principal,
  raw: Raw,
  now: Date,
): Promise<InwardPreview> {
  const { fields: f } = readInward(raw);
  const ctx = await loadRuleContext(db, now);
  const { rules, holidays } = ctx;

  const ids = [
    f.modeId,
    f.actionRequiredId,
    f.priorityId,
    f.ackIssuedViaId,
  ].filter((x): x is string => Boolean(x));
  const lists = await db.listItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, label: true, systemKey: true },
  });
  const key = (id: string | null | undefined) =>
    lists.find((l) => l.id === id)?.systemKey ?? null;

  const type = f.typeId
    ? await db.incomingType.findUnique({
        where: { id: f.typeId },
        include: { defaultUnit: { select: { name: true } } },
      })
    : null;
  const override = f.unitOverrideId
    ? await db.unit.findUnique({
        where: { id: f.unitOverrideId },
        select: { name: true },
      })
    : null;

  const deemed =
    f.receivedAt && f.modeId
      ? deemedReceiptDate(f.receivedAt, f.modeId, rules, holidays)
      : null;

  let duplicateCac = false;
  const cac = f.cacNo?.trim();
  if (type?.isRegistration && cac)
    duplicateCac =
      (await db.inwardItem.count({
        where: {
          snapIsRegistration: true,
          voidedAt: null,
          cacNo: { equals: cac, mode: "insensitive" },
        },
      })) > 0;

  const base = {
    expectedNumber: null,
    receiptDate: null,
    deemedReceiptDate: null,
    deemedReason: null,
    officeClosingTime: rules.officeClosingTime,
    modeLabel: lists.find((l) => l.id === f.modeId)?.label ?? null,
    routeTo: override?.name ?? type?.defaultUnit.name ?? null,
    orderRef: type?.orderRef ?? null,
    category: type?.category ?? null,
    isRegistration: type?.isRegistration ?? false,
    responseDue: null,
    targetDays: null,
    noteOnly: false,
    holidaysSkipped: [],
    slipWording: type
      ? type.para103SlipWording
        ? "Para 10(3)"
        : "General"
      : null,
    warnings: [],
  } satisfies InwardPreview;
  if (!deemed) return base;

  const year = yearOf(deemed);
  const settings = await db.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { ackPrefix: true },
  });
  const counter = await db.numberCounter.findUnique({
    where: { series_year: { series: "ACK", year } },
  });

  const derived = deriveInward(
    {
      number: "",
      numberYear: year,
      receivedAt: f.receivedAt!,
      modeId: f.modeId ?? null,
      deemedReceiptDate: deemed,
      type: type && {
        name: type.name,
        category: type.category,
        orderRef: type.orderRef,
        defaultUnitId: type.defaultUnitId,
        responseTargetDays: type.responseTargetDays,
        isRegistration: type.isRegistration,
        requiresRelatedOgsercNo: type.requiresRelatedOgsercNo,
      },
      sender: f.sender ?? null,
      senderCategoryId: f.senderCategoryId ?? null,
      subject: f.subject ?? null,
      receivedById: f.receivedById ?? null,
      ackIssuedVia: key(f.ackIssuedViaId) as AckViaKey | null,
      actionRequired: key(f.actionRequiredId) as ActionRequiredKey | null,
      priority: key(f.priorityId) as PriorityKey | null,
      unitOverrideId: f.unitOverrideId ?? null,
      responseDueOverride: f.responseDueOverride ?? null,
      relatedOgsercNo: f.relatedOgsercNo ?? null,
      cacNo: f.cacNo ?? null,
      schedule2DocsAttached: f.schedule2DocsAttached ?? null,
      feeEvidenceAttached: f.feeEvidenceAttached ?? null,
      multiState: f.multiState ?? null,
      registrationDeadlineOverride: null,
      routed: LEGACY_ROUTED,
      forwardedBeforeRouting: false,
      dateForwarded: null,
      dateClosedManual: null,
      voided: false,
      replies: [],
      possibleDuplicateCac: duplicateCac,
    },
    ctx,
  );

  const due = derived.responseDue;
  const skipped = due
    ? (
        await db.publicHoliday.findMany({
          select: { date: true, name: true },
          orderBy: { date: "asc" },
        })
      )
        .map((h) => ({ date: fromDbDate(h.date), name: h.name }))
        .filter(
          (h) =>
            compareDates(h.date, deemed) > 0 &&
            compareDates(h.date, due) <= 0 &&
            isWorkingDay(h.date, new Set()),
        )
    : [];

  return {
    ...base,
    expectedNumber: formatNumber(
      settings.ackPrefix,
      year,
      (counter?.lastValue ?? 0) + 1,
    ),
    receiptDate: derived.receiptDate,
    deemedReceiptDate: deemed,
    deemedReason: !derived.afterHoursOrNonWorkingDay
      ? null
      : derived.receiptDate && isWorkingDay(derived.receiptDate, holidays)
        ? "after-hours"
        : "non-working-day",
    responseDue: due,
    targetDays:
      f.responseDueOverride || !due
        ? null
        : key(f.priorityId) === "URGENT"
          ? rules.urgentResponseTargetDays
          : derived.targetDays,
    noteOnly: due === null && !f.responseDueOverride,
    holidaysSkipped: skipped,
    warnings: derived.flags.filter((x) => INPUT_FLAGS.includes(x)),
  };
}
