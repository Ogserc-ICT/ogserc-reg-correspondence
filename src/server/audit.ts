// Every write is audited in the same transaction (CLAUDE.md rule 4, SPEC §7).
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

export type AuditEntry = {
  userId: string | null;
  action: string;
  entityType:
    "InwardItem" | "OutwardItem" | "RegistryFile" | "FileMovement" | string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string;
};

/** JSON-safe copy: Dates → ISO strings, BigInt → string. */
function toJson(v: Record<string, unknown> | null | undefined) {
  if (!v) return undefined;
  return JSON.parse(
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)),
  ) as Prisma.InputJsonValue;
}

/** Keeps only the fields whose values differ, for an update's before/after. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const same = (x: unknown, y: unknown) =>
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)) ===
    JSON.stringify(y, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  for (const k of Object.keys(after))
    if (!same(before[k], after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  return { before: b, after: a };
}

export async function audit(tx: Tx, e: AuditEntry, at: Date): Promise<void> {
  await tx.auditLog.create({
    data: {
      at,
      userId: e.userId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      before: toJson(e.before),
      after: toJson(e.after),
      note: e.note,
    },
  });
}
