// Data for the acknowledgement slip, Daily Register and Pending Actions
// (SPEC §8.1–§8.3). Every function checks reports.print and the read scope.
import { isAwaitingRoutingOrForwarding } from "@/domain/inward";
import { addDays, compareDates, type IsoDate } from "@/domain/calendar";
import { instantIn, todayIn } from "@/domain/clock";
import type { Principal } from "@/domain/permissions";
import { slipContent, type SlipContent } from "@/domain/slip";
import { inwardWhere, outwardWhere } from "../access";
import { fromDbDate, toDbDate } from "../dates";
import type { Db } from "../db";
import { assertCan } from "../errors";
import { inwardRegister } from "./registers";

async function settingsOf(db: Db) {
  return db.registrySettings.findUniqueOrThrow({ where: { id: 1 } });
}

/** The slip for one inward item, or null if it is not visible to the user. */
export async function slipFor(
  db: Db,
  user: Principal,
  id: string,
): Promise<SlipContent | null> {
  assertCan(user, "reports.print");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await db.inwardItem.findFirst({
    where: { AND: [{ id }, inwardWhere(user)] },
    include: {
      mode: { select: { label: true } },
      receivedBy: { select: { name: true } },
      routedUnit: { select: { name: true } },
    },
  });
  if (!row) return null;
  const s = await settingsOf(db);
  return slipContent({
    number: row.number,
    receivedAt: row.receivedAt,
    deemedReceiptDate: fromDbDate(row.deemedReceiptDate),
    mode: row.mode.label,
    orderRef: row.snapOrderRef,
    type: row.snapTypeName,
    relatedOgsercNo: row.relatedOgsercNo,
    sender: row.sender,
    senderRef: row.senderRef,
    subject: row.subject,
    deliveredBy: row.deliveredBy,
    volumes: row.volumes,
    schedule2DocsAttached: row.schedule2DocsAttached,
    feeEvidenceAttached: row.feeEvidenceAttached,
    paymentRef: row.paymentRef,
    amountShownKobo: row.amountShownKobo,
    receivedBy: row.receivedBy.name,
    forwardedTo: row.routedUnit.name,
    para103SlipWording: row.snapPara103SlipWording,
    footerKind: row.snapSlipFooter,
    footers: {
      registration: s.slipFooterRegistration,
      para103: s.slipFooterPara103,
      general: s.slipFooterGeneral,
    },
    // The closing time that applied when the item was received.
    officeClosingTime: row.snapClosingTime,
    secretaryName: s.secretaryName,
    registryAddress: s.registryAddress,
  });
}

/** "Slip for": an inward number typed or chosen on the Desk → its id. */
export async function inwardIdByNumber(db: Db, user: Principal, no: string) {
  const row = await db.inwardItem.findFirst({
    where: { AND: [{ number: no.trim().toUpperCase() }, inwardWhere(user)] },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function latestInwardNumber(db: Db, user: Principal) {
  const row = await db.inwardItem.findFirst({
    where: { AND: [inwardWhere(user), { voidedAt: null }] },
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  return row?.number ?? null;
}

/**
 * Daily Register: items actually received on `date` (not deemed), in receipt
 * order, and items dispatched on `date`, in number order. Voided items are
 * left out, like every other count (SPEC §3.2).
 */
export async function dailyRegister(db: Db, user: Principal, date: IsoDate) {
  assertCan(user, "reports.print");
  const s = await settingsOf(db);
  const received = await db.inwardItem.findMany({
    where: {
      AND: [
        inwardWhere(user),
        { voidedAt: null },
        {
          receivedAt: {
            gte: instantIn(date, "00:00", s.timezone),
            lt: instantIn(addDays(date, 1), "00:00", s.timezone),
          },
        },
      ],
    },
    orderBy: [{ receivedAt: "asc" }, { numberYear: "asc" }, { serial: "asc" }],
    include: {
      mode: { select: { label: true } },
      receivedBy: { select: { name: true } },
      routedUnit: { select: { name: true } },
    },
  });
  const dispatched = await db.outwardItem.findMany({
    where: {
      AND: [
        outwardWhere(user),
        { voidedAt: null },
        { dateDispatched: toDbDate(date) },
      ],
    },
    orderBy: [{ numberYear: "asc" }, { serial: "asc" }],
    include: {
      dispatchMode: { select: { label: true } },
      dispatchedBy: { select: { name: true } },
      originatingUnit: { select: { name: true } },
    },
  });
  return { date, received, dispatched, secretaryName: s.secretaryName };
}

export type DailyRegister = Awaited<ReturnType<typeof dailyRegister>>;

/**
 * Pending Actions: inward items that are Open, Overdue or Awaiting
 * forwarding today, ordered by deemed receipt then number (TEMPLATES §3).
 */
export async function pendingActions(
  db: Db,
  user: Principal,
  unitId: string | undefined,
  now: Date,
) {
  assertCan(user, "reports.print");
  const r = await inwardRegister(db, user, { status: "Pending", unitId }, now, {
    all: true,
  });
  const rows = [...r.rows].sort(
    (a, b) =>
      compareDates(a.derived.deemedReceiptDate, b.derived.deemedReceiptDate) ||
      a.numberYear - b.numberYear ||
      a.serial - b.serial,
  );
  const unit = unitId
    ? (await db.unit.findUnique({ where: { id: unitId } }))?.name
    : undefined;
  return {
    rows,
    unit: unit ?? "All units",
    printedAt: now,
    today: todayIn(now),
    counts: {
      pending: rows.length,
      overdue: rows.filter((x) => x.derived.status === "Overdue").length,
      /** C5.3: "Awaiting routing / fwd" = Awaiting routing + Awaiting forwarding. */
      awaitingRoutingOrForwarding: rows.filter((x) =>
        isAwaitingRoutingOrForwarding(x.derived.status),
      ).length,
    },
  };
}

export type PendingActions = Awaited<ReturnType<typeof pendingActions>>;
