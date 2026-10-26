// Outward workflows: New Outward, Update Item, Dispatched today, Delivered
// today (SPEC §5.1, §7).
import type { IsoDate } from "@/domain/calendar";
import { missingFields, outwardDateProblems } from "@/domain/validation";
import type { OutwardItem } from "@/generated/prisma/client";
import { outwardWhere } from "../access";
import { audit, changedFields } from "../audit";
import { fromDbDate, toDbDate } from "../dates";
import type { Db, Tx } from "../db";
import { assertCan, ValidationError } from "../errors";
import {
  createOutward,
  refreshInward,
  refreshOutward,
  type Actor,
} from "../registers";
import { loadRuleContext } from "../rules";
import {
  linkProblems,
  lockOutward,
  Reader,
  refProblems,
  throwIfProblems,
  type Raw,
} from "./common";

export type OutwardFields = {
  documentDate: IsoDate | null;
  typeId: string | null;
  subject: string | null;
  addressee: string | null;
  recipientCategoryId: string | null;
  recipientContact: string | null;
  inReplyToInwardId: string | null;
  relatedOgsercNo: string | null;
  fileId: string | null;
  originatingUnitId: string | null;
  preparedBy: string | null;
  signedById: string | null;
  signatoryDesignation: string | null;
  dispatchModeId: string | null;
  dateDispatched: IsoDate | null;
  dispatchedById: string | null;
  trackingRef: string | null;
  responseExpectedOverride: boolean | null;
  responseDueOverride: IsoDate | null;
  remarks: string | null;
  deliveryConfirmed: boolean | null;
  dateDelivered: IsoDate | null;
  receivedByRecipient: string | null;
};

type Key = keyof OutwardFields;

export const OUTWARD_LABELS: Record<Key, string> = {
  documentDate: "Date of document",
  typeId: "Document type",
  subject: "Subject",
  addressee: "Addressee",
  recipientCategoryId: "Recipient category",
  recipientContact: "Address / email",
  inReplyToInwardId: "In reply to",
  relatedOgsercNo: "Related OGSERC No.",
  fileId: "File",
  originatingUnitId: "Originating unit",
  preparedBy: "Prepared by",
  signedById: "Signed by",
  signatoryDesignation: "Signatory's designation",
  dispatchModeId: "Dispatch mode",
  dateDispatched: "Date dispatched",
  dispatchedById: "Dispatched by",
  trackingRef: "Tracking ref.",
  responseExpectedOverride: "Response expected",
  responseDueOverride: "Response due (override)",
  remarks: "Remarks",
  deliveryConfirmed: "Delivery confirmed",
  dateDelivered: "Date delivered",
  receivedByRecipient: "Received by (recipient)",
};

const REQUIRED: Key[] = [
  "documentDate",
  "typeId",
  "subject",
  "addressee",
  "recipientCategoryId",
  "originatingUnitId",
  "signedById",
  "signatoryDesignation",
  "dispatchModeId",
];

export const OUTWARD_HANDLING_KEYS: Key[] = [
  "dateDispatched",
  "dispatchedById",
  "trackingRef",
  "deliveryConfirmed",
  "dateDelivered",
  "receivedByRecipient",
  "responseExpectedOverride",
  "responseDueOverride",
  "remarks",
];
const DELIVERY_KEYS: Key[] = [
  "deliveryConfirmed",
  "dateDelivered",
  "receivedByRecipient",
];
const ALL_KEYS = Object.keys(OUTWARD_LABELS) as Key[];
const CREATE_KEYS = ALL_KEYS.filter((k) => !DELIVERY_KEYS.includes(k));
const DATE_KEYS = new Set<Key>([
  "documentDate",
  "dateDispatched",
  "responseDueOverride",
  "dateDelivered",
]);

export function readOutward(raw: Raw): {
  fields: Partial<OutwardFields>;
  problems: string[];
} {
  const r = new Reader(raw);
  const f: Record<string, unknown> = {};
  const L = OUTWARD_LABELS;
  for (const k of [
    "subject",
    "addressee",
    "recipientContact",
    "relatedOgsercNo",
    "preparedBy",
    "signatoryDesignation",
    "trackingRef",
    "remarks",
    "receivedByRecipient",
  ] as Key[])
    if (r.has(k)) f[k] = r.text(k);
  for (const k of [
    "typeId",
    "recipientCategoryId",
    "inReplyToInwardId",
    "fileId",
    "originatingUnitId",
    "signedById",
    "dispatchModeId",
    "dispatchedById",
  ] as Key[])
    if (r.has(k)) f[k] = r.id(k, L[k]);
  for (const k of DATE_KEYS) if (r.has(k)) f[k] = r.date(k, L[k]);
  for (const k of ["responseExpectedOverride", "deliveryConfirmed"] as Key[])
    if (r.has(k)) f[k] = r.yesNo(k);
  return { fields: f as Partial<OutwardFields>, problems: r.problems };
}

function fromRow(row: OutwardItem): OutwardFields {
  return {
    documentDate: fromDbDate(row.documentDate),
    typeId: row.typeId,
    subject: row.subject,
    addressee: row.addressee,
    recipientCategoryId: row.recipientCategoryId,
    recipientContact: row.recipientContact,
    inReplyToInwardId: row.inReplyToInwardId,
    relatedOgsercNo: row.relatedOgsercNo,
    fileId: row.fileId,
    originatingUnitId: row.originatingUnitId,
    preparedBy: row.preparedBy,
    signedById: row.signedById,
    signatoryDesignation: row.signatoryDesignation,
    dispatchModeId: row.dispatchModeId,
    dateDispatched: fromDbDate(row.dateDispatched),
    dispatchedById: row.dispatchedById,
    trackingRef: row.trackingRef,
    responseExpectedOverride: row.responseExpectedOverride,
    responseDueOverride: fromDbDate(row.responseDueOverride),
    remarks: row.remarks,
    deliveryConfirmed: row.deliveryConfirmed,
    dateDelivered: fromDbDate(row.dateDelivered),
    receivedByRecipient: row.receivedByRecipient,
  };
}

/** No dispatch date, no dispatcher (VBA); a dispatch defaults to the current user. */
function settleDispatcher(f: OutwardFields, actor: Actor) {
  if (!f.dateDispatched) f.dispatchedById = null;
  else if (!f.dispatchedById) f.dispatchedById = actor.user.id;
}

async function defaultDesignation(tx: Tx, f: OutwardFields) {
  if (f.signatoryDesignation || !f.signedById) return;
  const signer = await tx.user.findUnique({ where: { id: f.signedById } });
  f.signatoryDesignation = signer?.designation ?? null;
}

async function checkAll(
  tx: Tx,
  actor: Actor,
  f: OutwardFields,
  problems: string[],
  opts: { create: boolean; changed: Set<Key> },
  today: IsoDate,
) {
  const missing = missingFields(
    REQUIRED.map((k) => ({ label: OUTWARD_LABELS[k], value: f[k] })),
  );
  const changed = (k: Key) => opts.create || opts.changed.has(k);
  const all = [...problems];
  all.push(
    ...(await refProblems(
      tx,
      [
        {
          kind: "outgoingType",
          id: changed("typeId") ? f.typeId : null,
          label: OUTWARD_LABELS.typeId,
        },
        {
          kind: "list",
          list: "PARTY_CATEGORY",
          id: changed("recipientCategoryId") ? f.recipientCategoryId : null,
          label: OUTWARD_LABELS.recipientCategoryId,
        },
        {
          kind: "unit",
          id: changed("originatingUnitId") ? f.originatingUnitId : null,
          label: OUTWARD_LABELS.originatingUnitId,
        },
        {
          kind: "signatory",
          id: changed("signedById") ? f.signedById : null,
          label: OUTWARD_LABELS.signedById,
        },
        {
          kind: "list",
          list: "RECEIPT_MODE",
          id: changed("dispatchModeId") ? f.dispatchModeId : null,
          label: OUTWARD_LABELS.dispatchModeId,
        },
        {
          kind: "registryUser",
          id: changed("dispatchedById") ? f.dispatchedById : null,
          label: OUTWARD_LABELS.dispatchedById,
        },
      ],
      opts.create,
    )),
    ...(await linkProblems(tx, actor.user, {
      inwardId: changed("inReplyToInwardId") ? f.inReplyToInwardId : null,
      fileId: changed("fileId") ? f.fileId : null,
    })),
  );
  if (f.documentDate)
    all.push(
      ...outwardDateProblems(
        {
          documentDate: f.documentDate,
          dateDispatched: f.dateDispatched,
          dateDelivered: f.dateDelivered,
          deliveryConfirmed: f.deliveryConfirmed,
        },
        today,
      ),
    );
  throwIfProblems(missing, all);
}

/** SAVE & GET NUMBER. */
export async function logOutward(db: Db, actor: Actor, raw: Raw) {
  assertCan(actor.user, "registers.write");
  const { fields, problems } = readOutward(raw);
  const f = Object.fromEntries(ALL_KEYS.map((k) => [k, null])) as OutwardFields;
  for (const k of CREATE_KEYS)
    (f as Record<string, unknown>)[k] = fields[k] ?? null;

  return db.$transaction(
    async (tx) => {
      const ctx = await loadRuleContext(tx, actor.now);
      settleDispatcher(f, actor);
      await defaultDesignation(tx, f);
      await checkAll(
        tx,
        actor,
        f,
        problems,
        { create: true, changed: new Set() },
        ctx.today,
      );
      const item = await createOutward(
        tx,
        {
          ...f,
          documentDate: f.documentDate!,
          typeId: f.typeId!,
          subject: f.subject!,
          addressee: f.addressee!,
          recipientCategoryId: f.recipientCategoryId!,
          originatingUnitId: f.originatingUnitId!,
          signatoryDesignation: f.signatoryDesignation!,
          dispatchModeId: f.dispatchModeId!,
        },
        actor,
      );
      return {
        item,
        message: `Outward number: ${item.number}. Quote it on the document.`,
      };
    },
    { timeout: 20_000 },
  );
}

async function loadForWrite(tx: Tx, actor: Actor, id: string) {
  await lockOutward(tx, id);
  const row = await tx.outwardItem.findFirst({
    where: { AND: [{ id }, outwardWhere(actor.user)] },
  });
  if (!row) throw new ValidationError(["That outward item doesn't exist."]);
  if (row.voidedAt)
    throw new ValidationError([`${row.number} is void and can't be changed.`]);
  return row;
}

/** Inward items whose status may change when this letter changes. */
async function refreshLinked(
  tx: Tx,
  ids: (string | null)[],
  ctx: Awaited<ReturnType<typeof loadRuleContext>>,
) {
  for (const id of new Set(ids)) if (id) await refreshInward(tx, id, ctx);
}

/** Update Item (officers: handling fields; Head of Registry: any field, with a reason). */
export async function updateOutward(
  db: Db,
  actor: Actor,
  id: string,
  raw: Raw,
  opts: { full?: boolean; reason?: string } = {},
) {
  assertCan(actor.user, "registers.write");
  if (opts.full) assertCan(actor.user, "items.editAny");
  const reason = opts.reason?.trim();
  if (opts.full && !reason)
    throw new ValidationError([
      "Give a reason for changing the registered details.",
    ]);
  const { fields, problems } = readOutward(raw);
  const allowed = opts.full ? ALL_KEYS : OUTWARD_HANDLING_KEYS;

  return db.$transaction(
    async (tx) => {
      const ctx = await loadRuleContext(tx, actor.now);
      const row = await loadForWrite(tx, actor, id);
      const before = fromRow(row);
      const after = { ...before };
      for (const k of allowed)
        if (k in fields) (after as Record<string, unknown>)[k] = fields[k];
      settleDispatcher(after, actor);
      await defaultDesignation(tx, after);
      const diff = changedFields(before, after);
      const changed = new Set(Object.keys(diff.after) as Key[]);
      if (!changed.size) return { item: row, message: "Nothing changed." };

      await checkAll(
        tx,
        actor,
        after,
        problems,
        { create: false, changed },
        ctx.today,
      );

      const data: Record<string, unknown> = {};
      for (const k of changed)
        data[k] = DATE_KEYS.has(k)
          ? toDbDate(after[k] as IsoDate | null)
          : after[k];
      if (changed.has("typeId")) {
        const t = await tx.outgoingType.findUniqueOrThrow({
          where: { id: after.typeId! },
        });
        Object.assign(data, {
          snapTypeName: t.name,
          snapResponseExpected: t.responseExpected,
          snapResponseWindowDays: t.responseWindowDays,
          snapClosesInwardItem: t.closesInwardItem,
        });
      }
      const item = await tx.outwardItem.update({ where: { id }, data });
      await audit(
        tx,
        {
          userId: actor.user.id,
          action: opts.full ? "edit" : "update",
          entityType: "OutwardItem",
          entityId: id,
          ...diff,
          note: reason,
        },
        actor.now,
      );
      await refreshOutward(tx, id, ctx);
      await refreshLinked(
        tx,
        [before.inReplyToInwardId, after.inReplyToInwardId],
        ctx,
      );
      return { item, message: `${item.number} updated.` };
    },
    { timeout: 20_000 },
  );
}

/** DISPATCHED TODAY: dateDispatched = today and dispatchedBy = me, if empty. */
export async function dispatchToday(db: Db, actor: Actor, id: string) {
  assertCan(actor.user, "registers.write");
  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const row = await loadForWrite(tx, actor, id);
    if (row.dateDispatched)
      return { item: row, message: `${row.number} was already dispatched.` };
    const problems = outwardDateProblems(
      { documentDate: fromDbDate(row.documentDate), dateDispatched: ctx.today },
      ctx.today,
    );
    if (problems.length) throw new ValidationError(problems);
    const after = { dateDispatched: ctx.today, dispatchedById: actor.user.id };
    const item = await tx.outwardItem.update({
      where: { id },
      data: {
        dateDispatched: toDbDate(ctx.today),
        dispatchedById: actor.user.id,
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "dispatch",
        entityType: "OutwardItem",
        entityId: id,
        before: { dateDispatched: null, dispatchedById: row.dispatchedById },
        after,
      },
      actor.now,
    );
    await refreshOutward(tx, id, ctx);
    await refreshLinked(tx, [row.inReplyToInwardId], ctx);
    return { item, message: `${row.number} dispatched today.` };
  });
}

/** DELIVERED TODAY: blocked until the dispatch is recorded. */
export async function deliverToday(db: Db, actor: Actor, id: string) {
  assertCan(actor.user, "registers.write");
  return db.$transaction(async (tx) => {
    const ctx = await loadRuleContext(tx, actor.now);
    const row = await loadForWrite(tx, actor, id);
    if (!row.dateDispatched)
      throw new ValidationError([
        "Record the dispatch first (DISPATCHED TODAY).",
      ]);
    if (row.deliveryConfirmed && row.dateDelivered)
      return {
        item: row,
        message: `${row.number} was already recorded as delivered.`,
      };
    const after = {
      deliveryConfirmed: true,
      dateDelivered: fromDbDate(row.dateDelivered) ?? ctx.today,
    };
    const item = await tx.outwardItem.update({
      where: { id },
      data: {
        deliveryConfirmed: true,
        dateDelivered: toDbDate(after.dateDelivered),
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "deliver",
        entityType: "OutwardItem",
        entityId: id,
        before: {
          deliveryConfirmed: row.deliveryConfirmed,
          dateDelivered: fromDbDate(row.dateDelivered),
        },
        after,
      },
      actor.now,
    );
    await refreshOutward(tx, id, ctx);
    return { item, message: `${row.number} delivered today.` };
  });
}
