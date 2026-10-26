// Register screens and CSV export (SPEC §8): stored-column filters run in the
// database; status and flags are derived from today's date for every row, so
// they are never stale (§9 R6), then filtered, sorted and paged.
import type { IsoDate } from "@/domain/calendar";
import { isIsoDate } from "@/domain/calendar";
import {
  deriveInward,
  reg01CacDuplicates,
  type InwardDerived,
  type InwardStatus,
} from "@/domain/inward";
import {
  deriveOutward,
  type OutwardDerived,
  type OutwardStatus,
} from "@/domain/outward";
import type { Principal } from "@/domain/permissions";
import type { RuleContext } from "@/domain/rules";
import type { Prisma } from "@/generated/prisma/client";
import { inwardWhere, outwardWhere } from "../access";
import { toDbDate } from "../dates";
import type { Db } from "../db";
import {
  inwardFactsInclude,
  outwardFactsInclude,
  toInwardFacts,
  toOutwardFacts,
} from "../facts";
import { loadRuleContext } from "../rules";

export const PAGE_SIZE = 50;

export type RegisterFilters = {
  q?: string;
  status?: string;
  unitId?: string;
  typeId?: string;
  from?: IsoDate;
  to?: IsoDate;
  flagged?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
};

/** URL search params → filters, ignoring anything malformed. */
export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): RegisterFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const uuid = (v?: string) =>
    v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
  const date = (v?: string) => (v && isIsoDate(v) ? v : undefined);
  const page = Number(one("page"));
  return {
    q: one("q")?.slice(0, 100),
    status: one("status"),
    unitId: uuid(one("unit")),
    typeId: uuid(one("type")),
    from: date(one("from")),
    to: date(one("to")),
    flagged: one("flagged") === "1",
    sort: one("sort"),
    dir:
      one("dir") === "asc" ? "asc" : one("dir") === "desc" ? "desc" : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function dateRange(from?: IsoDate, to?: IsoDate) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDbDate(from) } : {}),
    ...(to ? { lte: toDbDate(to) } : {}),
  };
}

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

// ----------------------------------------------------------------- inward ---

const inwardInclude = {
  ...inwardFactsInclude,
  mode: { select: { label: true } },
  type: { select: { name: true } },
  routedUnit: { select: { name: true } },
  senderCategory: { select: { label: true } },
  ackIssuedVia: { select: { label: true, systemKey: true } },
  actionRequired: { select: { label: true, systemKey: true } },
  priority: { select: { label: true, systemKey: true } },
  receivedBy: { select: { name: true } },
  principalLga: { select: { label: true } },
  file: { select: { reference: true } },
} satisfies Prisma.InwardItemInclude;

export type InwardRegisterRow = Prisma.InwardItemGetPayload<{
  include: typeof inwardInclude;
}> & { derived: InwardDerived };

export const INWARD_STATUSES: InwardStatus[] = [
  "Awaiting forwarding",
  "Open",
  "Overdue",
  "Noted / filed",
  "Closed",
  "Void",
];

async function inwardRows(
  db: Db,
  user: Principal,
  f: RegisterFilters,
  ctx: RuleContext,
) {
  const where: Prisma.InwardItemWhereInput = {
    AND: [
      inwardWhere(user),
      f.unitId ? { routedUnitId: f.unitId } : {},
      f.typeId ? { typeId: f.typeId } : {},
      f.from || f.to ? { deemedReceiptDate: dateRange(f.from, f.to) } : {},
      f.q
        ? {
            OR: [
              { number: contains(f.q) },
              { sender: contains(f.q) },
              { subject: contains(f.q) },
              { senderRef: contains(f.q) },
              { cacNo: contains(f.q) },
              { relatedOgsercNo: contains(f.q) },
              { paymentRef: contains(f.q) },
            ],
          }
        : {},
    ],
  };
  const rows = await db.inwardItem.findMany({ where, include: inwardInclude });
  // Duplicate-CAC needs every REG-01, not just the filtered rows.
  const reg = await db.inwardItem.findMany({
    where: { snapIsRegistration: true, cacNo: { not: null } },
    select: { id: true, snapIsRegistration: true, cacNo: true, voidedAt: true },
  });
  const dupes = reg01CacDuplicates(
    reg.map((r) => ({
      id: r.id,
      isRegistration: r.snapIsRegistration,
      cacNo: r.cacNo,
      voided: r.voidedAt !== null,
    })),
  );
  return rows.map((r) => ({
    ...r,
    derived: deriveInward(toInwardFacts(r, dupes.has(r.id)), ctx),
  }));
}

const INWARD_SORTS: Record<
  string,
  (a: InwardRegisterRow, b: InwardRegisterRow) => number
> = {
  number: (a, b) => a.numberYear - b.numberYear || a.serial - b.serial,
  received: (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
  deemed: (a, b) =>
    a.derived.deemedReceiptDate.localeCompare(b.derived.deemedReceiptDate),
  sender: (a, b) => a.sender.localeCompare(b.sender),
  unit: (a, b) => a.routedUnit.name.localeCompare(b.routedUnit.name),
  due: (a, b) =>
    (a.derived.responseDue ?? "9999").localeCompare(
      b.derived.responseDue ?? "9999",
    ),
  status: (a, b) => a.derived.status.localeCompare(b.derived.status),
};

export async function inwardRegister(
  db: Db,
  user: Principal,
  f: RegisterFilters,
  now: Date,
  opts: { all?: boolean } = {},
) {
  const ctx = await loadRuleContext(db, now);
  let rows = await inwardRows(db, user, f, ctx);
  if (f.status === "Pending") rows = rows.filter((r) => r.derived.pending);
  else if (f.status) rows = rows.filter((r) => r.derived.status === f.status);
  if (f.flagged) rows = rows.filter((r) => r.derived.flags.length > 0);
  const sort = INWARD_SORTS[f.sort ?? ""] ?? INWARD_SORTS.number;
  const dir = f.dir ?? (f.sort ? "asc" : "desc");
  // Ties keep number order, so a sorted list is always the same.
  rows.sort(
    (a, b) =>
      (dir === "asc" ? 1 : -1) * sort(a, b) || INWARD_SORTS.number(a, b),
  );
  const total = rows.length;
  const page = f.page ?? 1;
  return {
    rows: opts.all
      ? rows
      : rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    today: ctx.today,
  };
}

// ---------------------------------------------------------------- outward ---

const outwardInclude = {
  ...outwardFactsInclude,
  type: { select: { name: true } },
  originatingUnit: { select: { name: true } },
  recipientCategory: { select: { label: true } },
  dispatchMode: { select: { label: true } },
  signedBy: { select: { name: true } },
  dispatchedBy: { select: { name: true } },
  inReplyToInward: { select: { id: true, number: true, sender: true } },
  file: { select: { reference: true } },
} satisfies Prisma.OutwardItemInclude;

export type OutwardRegisterRow = Prisma.OutwardItemGetPayload<{
  include: typeof outwardInclude;
}> & { derived: OutwardDerived };

export const OUTWARD_STATUSES: OutwardStatus[] = [
  "Not yet dispatched",
  "Dispatched",
  "Delivered",
  "Awaiting response",
  "Response overdue",
  "Response received",
  "Void",
];

const OUTWARD_SORTS: Record<
  string,
  (a: OutwardRegisterRow, b: OutwardRegisterRow) => number
> = {
  number: (a, b) => a.numberYear - b.numberYear || a.serial - b.serial,
  date: (a, b) => a.documentDate.getTime() - b.documentDate.getTime(),
  addressee: (a, b) => a.addressee.localeCompare(b.addressee),
  unit: (a, b) => a.originatingUnit.name.localeCompare(b.originatingUnit.name),
  dispatched: (a, b) =>
    (a.dateDispatched?.getTime() ?? Infinity) -
    (b.dateDispatched?.getTime() ?? Infinity),
  due: (a, b) =>
    (a.derived.responseDue ?? "9999").localeCompare(
      b.derived.responseDue ?? "9999",
    ),
  status: (a, b) => a.derived.status.localeCompare(b.derived.status),
};

export async function outwardRegister(
  db: Db,
  user: Principal,
  f: RegisterFilters,
  now: Date,
  opts: { all?: boolean } = {},
) {
  const ctx = await loadRuleContext(db, now);
  const where: Prisma.OutwardItemWhereInput = {
    AND: [
      outwardWhere(user),
      f.unitId ? { originatingUnitId: f.unitId } : {},
      f.typeId ? { typeId: f.typeId } : {},
      f.from || f.to ? { documentDate: dateRange(f.from, f.to) } : {},
      f.q
        ? {
            OR: [
              { number: contains(f.q) },
              { addressee: contains(f.q) },
              { subject: contains(f.q) },
              { relatedOgsercNo: contains(f.q) },
              { trackingRef: contains(f.q) },
            ],
          }
        : {},
    ],
  };
  const found = await db.outwardItem.findMany({
    where,
    include: outwardInclude,
  });
  let rows: OutwardRegisterRow[] = found.map((r) => ({
    ...r,
    derived: deriveOutward(toOutwardFacts(r), ctx),
  }));
  if (f.status) rows = rows.filter((r) => r.derived.status === f.status);
  if (f.flagged) rows = rows.filter((r) => r.derived.flags.length > 0);
  const sort = OUTWARD_SORTS[f.sort ?? ""] ?? OUTWARD_SORTS.number;
  const dir = f.dir ?? (f.sort ? "asc" : "desc");
  rows.sort(
    (a, b) =>
      (dir === "asc" ? 1 : -1) * sort(a, b) || OUTWARD_SORTS.number(a, b),
  );
  const total = rows.length;
  const page = f.page ?? 1;
  return {
    rows: opts.all
      ? rows
      : rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    today: ctx.today,
  };
}
