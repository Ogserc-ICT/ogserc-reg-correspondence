// Database rows → domain facts. The only place that knows both shapes.
import type { FileFacts, MovementFacts } from "@/domain/files";
import type { InwardFacts } from "@/domain/inward";
import type { OutwardFacts } from "@/domain/outward";
import type {
  AckViaKey,
  ActionRequiredKey,
  FileStatusKey,
  PriorityKey,
} from "@/domain/rules";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate } from "./dates";

const KEY = { select: { systemKey: true } } as const;

export const inwardFactsInclude = {
  ackIssuedVia: KEY,
  actionRequired: KEY,
  priority: KEY,
  replies: {
    select: {
      id: true,
      number: true,
      dateDispatched: true,
      snapClosesInwardItem: true,
      voidedAt: true,
    },
  },
} satisfies Prisma.InwardItemInclude;

export type InwardFactsRow = Prisma.InwardItemGetPayload<{
  include: typeof inwardFactsInclude;
}>;

export const outwardFactsInclude = {
  responses: {
    select: { id: true, number: true, deemedReceiptDate: true, voidedAt: true },
  },
} satisfies Prisma.OutwardItemInclude;

export type OutwardFactsRow = Prisma.OutwardItemGetPayload<{
  include: typeof outwardFactsInclude;
}>;

export const fileFactsInclude = {
  fileStatus: KEY,
  inwardItems: { select: { deemedReceiptDate: true, voidedAt: true } },
  outwardItems: { select: { documentDate: true, voidedAt: true } },
  movements: { include: { unit: { select: { name: true } } } },
} satisfies Prisma.RegistryFileInclude;

export type FileFactsRow = Prisma.RegistryFileGetPayload<{
  include: typeof fileFactsInclude;
}>;

function key<K extends string>(
  item: { systemKey: string | null } | null,
  allowed: readonly K[],
): K | null {
  const k = item?.systemKey;
  return k && (allowed as readonly string[]).includes(k) ? (k as K) : null;
}

const ACTION_KEYS: readonly ActionRequiredKey[] = [
  "REPLY_REQUIRED",
  "ACTION_REQUIRED",
  "FOR_INFORMATION",
  "FILE_ONLY",
];
const PRIORITY_KEYS: readonly PriorityKey[] = [
  "URGENT",
  "HIGH",
  "NORMAL",
  "LOW",
];
const ACK_KEYS: readonly AckViaKey[] = [
  "PRINTED_SLIP",
  "EMAIL",
  "PORTAL",
  "NOT_YET_ISSUED",
  "NOT_REQUIRED",
];
const FILE_STATUS_KEYS: readonly FileStatusKey[] = [
  "OPEN",
  "CLOSED",
  "ARCHIVED",
];

export function toInwardFacts(
  r: InwardFactsRow,
  possibleDuplicateCac: boolean,
): InwardFacts {
  return {
    number: r.number,
    numberYear: r.numberYear,
    receivedAt: r.receivedAt,
    modeId: r.modeId,
    deemedReceiptDate: fromDbDate(r.deemedReceiptDate),
    type: {
      name: r.snapTypeName,
      category: r.snapCategory,
      orderRef: r.snapOrderRef,
      defaultUnitId: r.snapDefaultUnitId,
      responseTargetDays: r.snapResponseTargetDays,
      isRegistration: r.snapIsRegistration,
      requiresRelatedOgsercNo: r.snapRequiresRelatedOgsercNo,
    },
    sender: r.sender,
    senderCategoryId: r.senderCategoryId,
    subject: r.subject,
    receivedById: r.receivedById,
    ackIssuedVia: key(r.ackIssuedVia, ACK_KEYS),
    actionRequired: key(r.actionRequired, ACTION_KEYS),
    priority: key(r.priority, PRIORITY_KEYS),
    unitOverrideId: r.unitOverrideId,
    responseDueOverride: fromDbDate(r.responseDueOverride),
    relatedOgsercNo: r.relatedOgsercNo,
    cacNo: r.cacNo,
    schedule2DocsAttached: r.schedule2DocsAttached,
    feeEvidenceAttached: r.feeEvidenceAttached,
    multiState: r.multiState,
    registrationDeadlineOverride: fromDbDate(r.registrationDeadlineOverride),
    dateForwarded: fromDbDate(r.dateForwarded),
    dateClosedManual: fromDbDate(r.dateClosedManual),
    voided: r.voidedAt !== null,
    possibleDuplicateCac,
    replies: r.replies.map((o) => ({
      id: o.id,
      number: o.number,
      dateDispatched: fromDbDate(o.dateDispatched),
      closesInwardItem: o.snapClosesInwardItem,
      voided: o.voidedAt !== null,
    })),
  };
}

export function toOutwardFacts(r: OutwardFactsRow): OutwardFacts {
  return {
    number: r.number,
    documentDate: fromDbDate(r.documentDate),
    type: {
      name: r.snapTypeName,
      responseExpected: r.snapResponseExpected,
      responseWindowDays: r.snapResponseWindowDays,
    },
    dispatchModeId: r.dispatchModeId,
    dateDispatched: fromDbDate(r.dateDispatched),
    deliveryConfirmed: r.deliveryConfirmed,
    dateDelivered: fromDbDate(r.dateDelivered),
    responseExpectedOverride: r.responseExpectedOverride,
    responseDueOverride: fromDbDate(r.responseDueOverride),
    inReplyToInwardId: r.inReplyToInwardId,
    voided: r.voidedAt !== null,
    responses: r.responses.map((i) => ({
      id: i.id,
      number: i.number,
      deemedReceiptDate: fromDbDate(i.deemedReceiptDate),
      voided: i.voidedAt !== null,
    })),
  };
}

export function toMovementFacts(
  m: FileFactsRow["movements"][number],
): MovementFacts {
  return {
    id: m.id,
    outAt: m.outAt,
    issuedTo: m.issuedTo,
    unitName: m.unit?.name ?? null,
    returnByOverride: fromDbDate(m.returnByOverride),
    dateReturned: fromDbDate(m.dateReturned),
    issuedWhileOut: m.issuedWhileOut,
  };
}

export function toFileFacts(r: FileFactsRow): FileFacts {
  return {
    reference: r.reference,
    fileStatus: key(r.fileStatus, FILE_STATUS_KEYS) ?? "OPEN",
    dateClosedOrArchived: fromDbDate(r.dateClosedOrArchived),
    inward: r.inwardItems.map((i) => ({
      deemedReceiptDate: fromDbDate(i.deemedReceiptDate),
      voided: i.voidedAt !== null,
    })),
    outward: r.outwardItems.map((o) => ({
      documentDate: fromDbDate(o.documentDate),
      voided: o.voidedAt !== null,
    })),
    movements: r.movements.map(toMovementFacts),
  };
}
