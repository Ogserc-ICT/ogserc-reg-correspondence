// id → display name for everything an audit entry can point at, so history
// reads "Unit: Legal" rather than a UUID. Items and files only within the
// user's scope, so history never reveals another unit's numbers.
import type { Principal } from "@/domain/permissions";
import { fileWhere, inwardWhere, outwardWhere } from "../access";
import type { Db } from "../db";

export async function nameMap(
  db: Db,
  user: Principal,
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const l of await db.listItem.findMany({
    select: { id: true, label: true },
  }))
    m.set(l.id, l.label);
  for (const u of await db.unit.findMany({ select: { id: true, name: true } }))
    m.set(u.id, u.name);
  for (const t of await db.incomingType.findMany({
    select: { id: true, name: true },
  }))
    m.set(t.id, t.name);
  for (const t of await db.outgoingType.findMany({
    select: { id: true, name: true },
  }))
    m.set(t.id, t.name);
  for (const u of await db.user.findMany({ select: { id: true, name: true } }))
    m.set(u.id, u.name);
  for (const f of await db.registryFile.findMany({
    where: fileWhere(user),
    select: { id: true, reference: true },
  }))
    m.set(f.id, f.reference);
  for (const i of await db.inwardItem.findMany({
    where: inwardWhere(user),
    select: { id: true, number: true },
  }))
    m.set(i.id, i.number);
  for (const o of await db.outwardItem.findMany({
    where: outwardWhere(user),
    select: { id: true, number: true },
  }))
    m.set(o.id, o.number);
  return m;
}
