// Item detail: every stored field with its labels, the derived fields, all
// linked items (SPEC §9 R3) and the audit history.
import { deriveInward, reg01CacDuplicates } from "@/domain/inward";
import { deriveOutward } from "@/domain/outward";
import { canReadForRouting, type Principal } from "@/domain/permissions";
import {
  fileWhere,
  inwardWhere,
  outwardWhere,
  routingFileWhere,
} from "../access";
import type { Db } from "../db";
import {
  inwardFactsInclude,
  outwardFactsInclude,
  toInwardFacts,
  toOutwardFacts,
} from "../facts";
import { loadRuleContext } from "../rules";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function auditHistory(
  db: Db,
  entityType: string,
  entityId: string,
) {
  return db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { id: "asc" },
    include: { user: { select: { name: true } } },
  });
}

export async function inwardDetail(
  db: Db,
  user: Principal,
  id: string,
  now: Date,
) {
  if (!isUuid(id)) return null;
  const row = await db.inwardItem.findFirst({
    where: { AND: [{ id }, inwardWhere(user)] },
    include: {
      ...inwardFactsInclude,
      mode: { select: { label: true } },
      type: { select: { name: true } },
      routedUnit: { select: { name: true } },
      routedBy: { select: { name: true } },
      unitOverride: { select: { name: true } },
      senderCategory: { select: { label: true } },
      ackIssuedVia: { select: { label: true, systemKey: true } },
      actionRequired: { select: { label: true, systemKey: true } },
      priority: { select: { label: true, systemKey: true } },
      receivedBy: { select: { name: true } },
      principalLga: { select: { label: true } },
      file: { select: { id: true, reference: true, title: true } },
      inResponseToOutward: {
        select: {
          id: true,
          number: true,
          addressee: true,
          subject: true,
          voidedAt: true,
        },
      },
      voidedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!row) return null;
  const ctx = await loadRuleContext(db, now);

  let dup = false;
  if (row.snapIsRegistration && row.cacNo) {
    const same = await db.inwardItem.findMany({
      where: {
        snapIsRegistration: true,
        cacNo: { equals: row.cacNo, mode: "insensitive" },
      },
      select: {
        id: true,
        snapIsRegistration: true,
        cacNo: true,
        voidedAt: true,
      },
    });
    dup = reg01CacDuplicates(
      same.map((r) => ({
        id: r.id,
        isRegistration: r.snapIsRegistration,
        cacNo: r.cacNo,
        voided: r.voidedAt !== null,
      })),
    ).has(row.id);
  }
  const derived = deriveInward(toInwardFacts(row, dup), ctx);

  // Replies the user may see, with their own status.
  const replies = await db.outwardItem.findMany({
    where: { AND: [{ inReplyToInwardId: row.id }, outwardWhere(user)] },
    include: outwardFactsInclude,
    orderBy: [{ numberYear: "asc" }, { serial: "asc" }],
  });
  const fileVisible =
    row.file &&
    (await db.registryFile.count({
      where: { AND: [{ id: row.file.id }, fileWhere(user)] },
    }));

  return {
    row,
    derived,
    today: ctx.today,
    replies: replies.map((r) => ({
      id: r.id,
      number: r.number,
      type: r.snapTypeName,
      subject: r.subject,
      closesInwardItem: r.snapClosesInwardItem,
      status: deriveOutward(toOutwardFacts(r), ctx).status,
    })),
    file: fileVisible ? row.file : null,
    history: await auditHistory(db, "InwardItem", row.id),
  };
}

export async function outwardDetail(
  db: Db,
  user: Principal,
  id: string,
  now: Date,
) {
  if (!isUuid(id)) return null;
  const row = await db.outwardItem.findFirst({
    where: { AND: [{ id }, outwardWhere(user)] },
    include: {
      ...outwardFactsInclude,
      type: { select: { name: true } },
      originatingUnit: {
        select: { name: true, division: { select: { name: true } } },
      },
      recipientCategory: { select: { label: true } },
      dispatchMode: { select: { label: true } },
      signatory: { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      file: { select: { id: true, reference: true, title: true } },
      inReplyToInward: {
        select: {
          id: true,
          number: true,
          sender: true,
          subject: true,
          voidedAt: true,
          routedUnitId: true,
        },
      },
      voidedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!row) return null;
  const ctx = await loadRuleContext(db, now);
  const derived = deriveOutward(toOutwardFacts(row), ctx);

  const responses = await db.inwardItem.findMany({
    where: { AND: [{ inResponseToOutwardId: row.id }, inwardWhere(user)] },
    select: {
      id: true,
      number: true,
      sender: true,
      deemedReceiptDate: true,
      voidedAt: true,
    },
    orderBy: [{ deemedReceiptDate: "asc" }, { serial: "asc" }],
  });
  const replyVisible =
    row.inReplyToInward &&
    (await db.inwardItem.count({
      where: { AND: [{ id: row.inReplyToInward.id }, inwardWhere(user)] },
    }));
  const fileVisible =
    row.file &&
    (await db.registryFile.count({
      where: { AND: [{ id: row.file.id }, fileWhere(user)] },
    }));

  return {
    row,
    derived,
    today: ctx.today,
    responses,
    inReplyTo: replyVisible ? row.inReplyToInward : null,
    file: fileVisible ? row.file : null,
    history: await auditHistory(db, "OutwardItem", row.id),
  };
}

/** Searchable pickers for links (SPEC §9 R2): non-void, in scope, at most 10. */
export async function searchInward(db: Db, user: Principal, q: string) {
  const t = q.trim();
  if (t.length < 2) return [];
  return db.inwardItem.findMany({
    where: {
      AND: [
        inwardWhere(user),
        { voidedAt: null },
        {
          OR: [
            { number: { contains: t, mode: "insensitive" } },
            { sender: { contains: t, mode: "insensitive" } },
            { subject: { contains: t, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, number: true, sender: true, subject: true },
    orderBy: [{ numberYear: "desc" }, { serial: "desc" }],
    take: 10,
  });
}

export async function searchOutward(db: Db, user: Principal, q: string) {
  const t = q.trim();
  if (t.length < 2) return [];
  return db.outwardItem.findMany({
    where: {
      AND: [
        outwardWhere(user),
        { voidedAt: null },
        {
          OR: [
            { number: { contains: t, mode: "insensitive" } },
            { addressee: { contains: t, mode: "insensitive" } },
            { subject: { contains: t, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, number: true, addressee: true, subject: true },
    orderBy: [{ numberYear: "desc" }, { serial: "desc" }],
    take: 10,
  });
}

export async function searchFiles(db: Db, user: Principal, q: string) {
  const t = q.trim();
  if (t.length < 2) return [];
  return db.registryFile.findMany({
    where: {
      AND: [
        fileWhere(user),
        {
          OR: [
            { reference: { contains: t, mode: "insensitive" } },
            { title: { contains: t, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, reference: true, title: true },
    orderBy: { reference: "asc" },
    take: 10,
  });
}

/** Routing Desk item picker: every non-void inward item, routers only (C5.2). */
export async function searchInwardForRouting(
  db: Db,
  user: Principal,
  q: string,
) {
  const t = q.trim();
  if (!canReadForRouting(user) || t.length < 2) return [];
  return db.inwardItem.findMany({
    where: {
      voidedAt: null,
      OR: [
        { number: { contains: t, mode: "insensitive" } },
        { sender: { contains: t, mode: "insensitive" } },
        { subject: { contains: t, mode: "insensitive" } },
      ],
    },
    select: { id: true, number: true, sender: true, subject: true },
    orderBy: [{ numberYear: "desc" }, { serial: "desc" }],
    take: 10,
  });
}

/** Routing Desk file picker: never Confidential or Personnel by routing alone. */
export async function searchFilesForRouting(
  db: Db,
  user: Principal,
  q: string,
) {
  const t = q.trim();
  if (!canReadForRouting(user) || t.length < 2) return [];
  return db.registryFile.findMany({
    where: {
      AND: [
        routingFileWhere(user),
        {
          OR: [
            { reference: { contains: t, mode: "insensitive" } },
            { title: { contains: t, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, reference: true, title: true },
    orderBy: { reference: "asc" },
    take: 10,
  });
}
