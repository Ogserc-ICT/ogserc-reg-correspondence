// Inward and outward items: create (number assigned in the insert transaction),
// void, and the cached status/routing columns. Permissions are checked here,
// so no caller can skip them; form validation wraps these in Phase 4.
import type { IsoDate } from "@/domain/calendar";
import { canVoid, type Principal } from "@/domain/permissions";
import {
  deriveInward,
  type InwardStatus as DomainInwardStatus,
} from "@/domain/inward";
import { inwardNumberYear, outwardNumberYear } from "@/domain/numbering";
import type { OutwardStatus as DomainOutwardStatus } from "@/domain/outward";
import { deriveOutward } from "@/domain/outward";
import { deemedReceiptDate } from "@/domain/receipt";
import type { RuleContext } from "@/domain/rules";
import type {
  InwardItem,
  InwardStatus,
  OutwardItem,
  OutwardStatus,
} from "@/generated/prisma/client";
import { audit } from "./audit";
import { toDbDate } from "./dates";
import type { Tx } from "./db";
import { assertCan, ForbiddenError, ValidationError } from "./errors";
import {
  inwardFactsInclude,
  outwardFactsInclude,
  toInwardFacts,
  toOutwardFacts,
} from "./facts";
import { advanceCounterTo, nextNumber, type AssignedNumber } from "./numbers";
import { loadRuleContext } from "./rules";

/** Who is acting and when; `now` comes from `appNow()`. */
export type Actor = { user: Principal; now: Date };

const INWARD_STATUS: Record<DomainInwardStatus, InwardStatus> = {
  Void: "VOID",
  Closed: "CLOSED",
  Overdue: "OVERDUE",
  "Awaiting forwarding": "AWAITING_FORWARDING",
  "Noted / filed": "NOTED_FILED",
  Open: "OPEN",
};

const OUTWARD_STATUS: Record<DomainOutwardStatus, OutwardStatus> = {
  Void: "VOID",
  "Not yet dispatched": "NOT_YET_DISPATCHED",
  "Response received": "RESPONSE_RECEIVED",
  "Response overdue": "RESPONSE_OVERDUE",
  "Awaiting response": "AWAITING_RESPONSE",
  Delivered: "DELIVERED",
  Dispatched: "DISPATCHED",
};

/** Trimmed text, or null when blank. */
function text(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

function required(s: string, field: string): string {
  const t = text(s);
  if (!t) throw new Error(`${field} is required`);
  return t;
}

/**
 * Workbook import (STACK rule 19): keep the number issued in the workbook and
 * move the counter past it, so it is never issued again.
 */
export type CreateOptions = { preset?: AssignedNumber };

async function numberFor(
  tx: Tx,
  series: "ACK" | "OUT",
  year: number,
  opts: CreateOptions,
): Promise<AssignedNumber> {
  if (!opts.preset) return nextNumber(series, year, tx);
  await advanceCounterTo(series, opts.preset.year, opts.preset.serial, tx);
  return opts.preset;
}

// ----------------------------------------------------------------- inward ---

export type NewInward = {
  receivedAt: Date;
  modeId: string;
  typeId: string;
  sender: string;
  senderCategoryId: string;
  subject: string;
  receivedById: string;
  ackIssuedViaId: string;
  actionRequiredId: string;
  priorityId?: string | null;
  senderRef?: string | null;
  documentDate?: IsoDate | null;
  relatedOgsercNo?: string | null;
  inResponseToOutwardId?: string | null;
  cacNo?: string | null;
  principalLgaId?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  deliveredBy?: string | null;
  volumes?: number | null;
  schedule2DocsAttached?: number | null;
  feeEvidenceAttached?: boolean | null;
  paymentRef?: string | null;
  amountShownKobo?: bigint | null;
  fileId?: string | null;
  unitOverrideId?: string | null;
  actionOfficer?: string | null;
  responseDueOverride?: IsoDate | null;
  remarks?: string | null;
  multiState?: boolean | null;
  registrationDeadlineOverride?: IsoDate | null;
  /** Handling fields: set at creation only by the seed and imports. */
  dateForwarded?: IsoDate | null;
  receivedByUnitOfficer?: string | null;
  dateClosedManual?: IsoDate | null;
  closingNote?: string | null;
};

export async function createInward(
  tx: Tx,
  input: NewInward,
  actor: Actor,
  opts: CreateOptions = {},
): Promise<InwardItem> {
  assertCan(actor.user, "registers.write");
  const ctx = await loadRuleContext(tx, actor.now);
  const type = await tx.incomingType.findUniqueOrThrow({
    where: { id: input.typeId },
  });
  const deemed = deemedReceiptDate(
    input.receivedAt,
    input.modeId,
    ctx.rules,
    ctx.holidays,
  );
  const no = await numberFor(tx, "ACK", inwardNumberYear(deemed), opts);

  const created = await tx.inwardItem.create({
    data: {
      number: no.number,
      numberYear: no.year,
      serial: no.serial,
      receivedAt: input.receivedAt,
      modeId: input.modeId,
      typeId: type.id,
      sender: required(input.sender, "Sender"),
      senderCategoryId: input.senderCategoryId,
      subject: required(input.subject, "Subject"),
      senderRef: text(input.senderRef),
      documentDate: toDbDate(input.documentDate),
      relatedOgsercNo: text(input.relatedOgsercNo),
      inResponseToOutwardId: input.inResponseToOutwardId ?? null,
      cacNo: text(input.cacNo),
      principalLgaId: input.principalLgaId ?? null,
      contactPerson: text(input.contactPerson),
      phone: text(input.phone),
      email: text(input.email),
      deliveredBy: text(input.deliveredBy),
      volumes: input.volumes ?? null,
      schedule2DocsAttached: input.schedule2DocsAttached ?? null,
      feeEvidenceAttached: input.feeEvidenceAttached ?? null,
      paymentRef: text(input.paymentRef),
      amountShownKobo: input.amountShownKobo ?? null,
      receivedById: input.receivedById,
      fileId: input.fileId ?? null,
      unitOverrideId: input.unitOverrideId ?? null,
      ackIssuedViaId: input.ackIssuedViaId,
      actionRequiredId: input.actionRequiredId,
      priorityId: input.priorityId ?? null,
      actionOfficer: text(input.actionOfficer),
      responseDueOverride: toDbDate(input.responseDueOverride),
      remarks: text(input.remarks),
      multiState: input.multiState ?? null,
      registrationDeadlineOverride: toDbDate(
        input.registrationDeadlineOverride,
      ),
      dateForwarded: toDbDate(input.dateForwarded),
      receivedByUnitOfficer: text(input.receivedByUnitOfficer),
      dateClosedManual: toDbDate(input.dateClosedManual),
      closingNote: text(input.closingNote),
      snapTypeName: type.name,
      snapCategory: type.category,
      snapOrderRef: type.orderRef,
      snapDefaultUnitId: type.defaultUnitId,
      snapResponseTargetDays: type.responseTargetDays,
      snapPara103SlipWording: type.para103SlipWording,
      snapSlipFooter: type.slipFooter,
      snapIsRegistration: type.isRegistration,
      snapRequiresRelatedOgsercNo: type.requiresRelatedOgsercNo,
      snapClosingTime: ctx.rules.officeClosingTime,
      deemedReceiptDate: toDbDate(deemed),
      routedUnitId: input.unitOverrideId ?? type.defaultUnitId,
      createdById: actor.user.id,
      imported: !!opts.preset,
    },
  });

  await audit(
    tx,
    {
      userId: actor.user.id,
      action: opts.preset ? "import" : "create",
      entityType: "InwardItem",
      entityId: created.id,
      after: created,
    },
    actor.now,
  );
  await refreshInward(tx, created.id, ctx);
  if (created.inResponseToOutwardId)
    await refreshOutward(tx, created.inResponseToOutwardId, ctx);
  return tx.inwardItem.findUniqueOrThrow({ where: { id: created.id } });
}

/** Recomputes routedUnitId and statusCache from stored facts (§9 R6). */
export async function refreshInward(tx: Tx, id: string, ctx: RuleContext) {
  const row = await tx.inwardItem.findUniqueOrThrow({
    where: { id },
    include: inwardFactsInclude,
  });
  const dupCac =
    row.snapIsRegistration && row.cacNo && !row.voidedAt
      ? (await tx.inwardItem.count({
          where: {
            id: { not: id },
            snapIsRegistration: true,
            voidedAt: null,
            cacNo: { equals: row.cacNo, mode: "insensitive" },
          },
        })) > 0
      : false;
  const d = deriveInward(toInwardFacts(row, dupCac), ctx);
  await tx.inwardItem.update({
    where: { id },
    data: {
      routedUnitId: d.routedUnitId ?? row.snapDefaultUnitId,
      statusCache: INWARD_STATUS[d.status],
      statusCachedOn: toDbDate(ctx.today),
    },
  });
  return d;
}

// ---------------------------------------------------------------- outward ---

export type NewOutward = {
  documentDate: IsoDate;
  typeId: string;
  subject: string;
  addressee: string;
  recipientCategoryId: string;
  originatingUnitId: string;
  signedById: string | null;
  signatoryDesignation: string;
  dispatchModeId: string;
  recipientContact?: string | null;
  inReplyToInwardId?: string | null;
  relatedOgsercNo?: string | null;
  fileId?: string | null;
  preparedBy?: string | null;
  signedByText?: string | null;
  dateDispatched?: IsoDate | null;
  dispatchedById?: string | null;
  trackingRef?: string | null;
  responseExpectedOverride?: boolean | null;
  responseDueOverride?: IsoDate | null;
  remarks?: string | null;
  /** Delivery fields: set at creation only by the seed and imports. */
  deliveryConfirmed?: boolean | null;
  dateDelivered?: IsoDate | null;
  receivedByRecipient?: string | null;
};

export async function createOutward(
  tx: Tx,
  input: NewOutward,
  actor: Actor,
  opts: CreateOptions = {},
): Promise<OutwardItem> {
  assertCan(actor.user, "registers.write");
  const ctx = await loadRuleContext(tx, actor.now);
  const type = await tx.outgoingType.findUniqueOrThrow({
    where: { id: input.typeId },
  });
  const no = await numberFor(
    tx,
    "OUT",
    outwardNumberYear(input.documentDate),
    opts,
  );
  const dispatched = toDbDate(input.dateDispatched);

  const created = await tx.outwardItem.create({
    data: {
      number: no.number,
      numberYear: no.year,
      serial: no.serial,
      documentDate: toDbDate(input.documentDate),
      typeId: type.id,
      subject: required(input.subject, "Subject"),
      addressee: required(input.addressee, "Addressee"),
      recipientCategoryId: input.recipientCategoryId,
      recipientContact: text(input.recipientContact),
      inReplyToInwardId: input.inReplyToInwardId ?? null,
      relatedOgsercNo: text(input.relatedOgsercNo),
      fileId: input.fileId ?? null,
      originatingUnitId: input.originatingUnitId,
      preparedBy: text(input.preparedBy),
      signedById: input.signedById,
      signedByText: text(input.signedByText),
      signatoryDesignation: required(input.signatoryDesignation, "Designation"),
      dispatchModeId: input.dispatchModeId,
      dateDispatched: dispatched,
      // SPEC §5.1 (VBA): no dispatch date, no dispatcher.
      dispatchedById: dispatched
        ? (input.dispatchedById ?? actor.user.id)
        : null,
      trackingRef: text(input.trackingRef),
      responseExpectedOverride: input.responseExpectedOverride ?? null,
      responseDueOverride: toDbDate(input.responseDueOverride),
      remarks: text(input.remarks),
      deliveryConfirmed: input.deliveryConfirmed ?? null,
      dateDelivered: toDbDate(input.dateDelivered),
      receivedByRecipient: text(input.receivedByRecipient),
      snapTypeName: type.name,
      snapResponseExpected: type.responseExpected,
      snapResponseWindowDays: type.responseWindowDays,
      snapClosesInwardItem: type.closesInwardItem,
      createdById: actor.user.id,
      imported: !!opts.preset,
    },
  });

  await audit(
    tx,
    {
      userId: actor.user.id,
      action: opts.preset ? "import" : "create",
      entityType: "OutwardItem",
      entityId: created.id,
      after: created,
    },
    actor.now,
  );
  await refreshOutward(tx, created.id, ctx);
  if (created.inReplyToInwardId)
    await refreshInward(tx, created.inReplyToInwardId, ctx);
  return tx.outwardItem.findUniqueOrThrow({ where: { id: created.id } });
}

export async function refreshOutward(tx: Tx, id: string, ctx: RuleContext) {
  const row = await tx.outwardItem.findUniqueOrThrow({
    where: { id },
    include: outwardFactsInclude,
  });
  const d = deriveOutward(toOutwardFacts(row), ctx);
  await tx.outwardItem.update({
    where: { id },
    data: {
      statusCache: OUTWARD_STATUS[d.status],
      statusCachedOn: toDbDate(ctx.today),
    },
  });
  return d;
}

// ------------------------------------------------------------------- void ---

/**
 * Voids an item (SPEC §3.2). The number is kept and never reissued. Linked
 * items are refreshed because a void reply or response no longer counts.
 */
export async function voidItem(
  tx: Tx,
  kind: "inward" | "outward",
  id: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const why = text(reason);
  if (!why) throw new ValidationError(["Give a reason for voiding this item."]);
  const ctx = await loadRuleContext(tx, actor.now);
  const { headMayVoidOwnItems } = await tx.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { headMayVoidOwnItems: true },
  });
  const check = (item: {
    number: string;
    createdById: string;
    voidedAt: Date | null;
  }) => {
    if (item.voidedAt)
      throw new ValidationError([`${item.number} is already void.`]);
    if (
      !canVoid(
        actor.user,
        { createdById: item.createdById, voided: false },
        headMayVoidOwnItems,
      )
    )
      throw new ForbiddenError(
        actor.user.role === "HEAD_OF_REGISTRY"
          ? `You logged ${item.number}, so another Head of Registry must void it.`
          : "Only the Head of Registry can void an item.",
      );
  };
  const data = {
    voidedAt: actor.now,
    voidedById: actor.user.id,
    voidReason: why,
  };

  if (kind === "inward") {
    const before = await tx.inwardItem.findUniqueOrThrow({ where: { id } });
    check(before);
    await tx.inwardItem.update({ where: { id }, data });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "void",
        entityType: "InwardItem",
        entityId: id,
        before: { voidedAt: null, voidedById: null, voidReason: null },
        after: data,
      },
      actor.now,
    );
    await refreshInward(tx, id, ctx);
    if (before.inResponseToOutwardId)
      await refreshOutward(tx, before.inResponseToOutwardId, ctx);
    if (before.snapIsRegistration && before.cacNo)
      await refreshSameCac(tx, before.cacNo, ctx);
  } else {
    const before = await tx.outwardItem.findUniqueOrThrow({ where: { id } });
    check(before);
    await tx.outwardItem.update({ where: { id }, data });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "void",
        entityType: "OutwardItem",
        entityId: id,
        before: { voidedAt: null, voidedById: null, voidReason: null },
        after: data,
      },
      actor.now,
    );
    await refreshOutward(tx, id, ctx);
    if (before.inReplyToInwardId)
      await refreshInward(tx, before.inReplyToInwardId, ctx);
  }
}

export async function refreshSameCac(tx: Tx, cacNo: string, ctx: RuleContext) {
  const same = await tx.inwardItem.findMany({
    where: {
      snapIsRegistration: true,
      cacNo: { equals: cacNo, mode: "insensitive" },
    },
    select: { id: true },
  });
  for (const { id } of same) await refreshInward(tx, id, ctx);
}
