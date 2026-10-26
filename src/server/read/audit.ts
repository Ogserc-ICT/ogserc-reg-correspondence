// Audit log viewer (STACK Phase 7): every write, newest first, filterable.
import { addDays, isIsoDate, type IsoDate } from "@/domain/calendar";
import { instantIn } from "@/domain/clock";
import type { Principal } from "@/domain/permissions";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "../db";
import { assertCan } from "../errors";

export const AUDIT_PAGE = 50;

export type AuditFilters = {
  entityType?: string;
  action?: string;
  userId?: string;
  from?: IsoDate;
  to?: IsoDate;
  /** An inward/outward number or file reference. */
  q?: string;
  page: number;
};

export function parseAuditFilters(
  sp: Record<string, string | undefined>,
): AuditFilters {
  const page = Number(sp.page);
  return {
    entityType: sp.type?.trim() || undefined,
    action: sp.action?.trim() || undefined,
    userId: sp.user && /^[0-9a-f-]{36}$/i.test(sp.user) ? sp.user : undefined,
    from: sp.from && isIsoDate(sp.from) ? sp.from : undefined,
    to: sp.to && isIsoDate(sp.to) ? sp.to : undefined,
    q: sp.q?.trim().toUpperCase() || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export async function auditLog(db: Db, user: Principal, f: AuditFilters) {
  assertCan(user, "audit.view");
  let entityIds: string[] | undefined;
  if (f.q) {
    const [i, o, file] = [
      await db.inwardItem.findMany({
        where: { number: { contains: f.q } },
        select: { id: true },
      }),
      await db.outwardItem.findMany({
        where: { number: { contains: f.q } },
        select: { id: true },
      }),
      await db.registryFile.findMany({
        where: { reference: { contains: f.q } },
        select: { id: true },
      }),
    ];
    entityIds = [...i, ...o, ...file].map((r) => r.id);
  }
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      f.entityType ? { entityType: f.entityType } : {},
      f.action ? { action: f.action } : {},
      f.userId ? { userId: f.userId } : {},
      f.from ? { at: { gte: instantIn(f.from, "00:00") } } : {},
      f.to ? { at: { lt: instantIn(addDays(f.to, 1), "00:00") } } : {},
      entityIds ? { entityId: { in: entityIds } } : {},
    ],
  };
  const total = await db.auditLog.count({ where });
  const rows = await db.auditLog.findMany({
    where,
    orderBy: { id: "desc" },
    skip: (f.page - 1) * AUDIT_PAGE,
    take: AUDIT_PAGE,
    include: { user: { select: { name: true } } },
  });

  // What each entry points at, for a readable link.
  const ids = (type: string) =>
    rows.filter((r) => r.entityType === type).map((r) => r.entityId);
  const label = new Map<string, { text: string; href?: string }>();
  for (const r of await db.inwardItem.findMany({
    where: { id: { in: ids("InwardItem") } },
    select: { id: true, number: true },
  }))
    label.set(r.id, { text: r.number, href: `/inward/${r.id}` });
  for (const r of await db.outwardItem.findMany({
    where: { id: { in: ids("OutwardItem") } },
    select: { id: true, number: true },
  }))
    label.set(r.id, { text: r.number, href: `/outward/${r.id}` });
  for (const r of await db.registryFile.findMany({
    where: { id: { in: ids("RegistryFile") } },
    select: { id: true, reference: true },
  }))
    label.set(r.id, { text: r.reference, href: `/files/${r.id}` });
  for (const r of await db.user.findMany({
    where: { id: { in: ids("User") } },
    select: { id: true, name: true },
  }))
    label.set(r.id, { text: r.name, href: `/admin/users/${r.id}` });

  const facets = {
    types: (
      await db.auditLog.findMany({
        distinct: ["entityType"],
        select: { entityType: true },
      })
    )
      .map((r) => r.entityType)
      .sort(),
    actions: (
      await db.auditLog.findMany({
        distinct: ["action"],
        select: { action: true },
      })
    )
      .map((r) => r.action)
      .sort(),
    users: await db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  };
  return {
    rows: rows.map((r) => ({
      ...r,
      target: label.get(r.entityId) ?? { text: r.entityId },
    })),
    total,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE)),
    facets,
  };
}
