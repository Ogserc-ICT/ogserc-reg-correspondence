// File Index, File Movement log and file detail (SPEC §6). Derived values
// ("currently with", overdue returns, counts, flags) come from today's date.
import {
  deriveFile,
  deriveMovement,
  type MovementStatus,
} from "@/domain/files";
import type { Principal } from "@/domain/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { fileWhere, inwardWhere, outwardWhere } from "../access";
import { assertCan } from "../errors";
import type { Db } from "../db";
import { fileFactsInclude, toFileFacts, toMovementFacts } from "../facts";
import { loadRuleContext } from "../rules";
import { auditHistory } from "./items";

export type FileFilters = {
  q?: string;
  status?: string;
  unitId?: string;
  classId?: string;
  out?: boolean;
  overdue?: boolean;
  flagged?: boolean;
};

export function parseFileFilters(
  sp: Record<string, string | undefined>,
): FileFilters {
  const uuid = (v?: string) =>
    v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
  return {
    q: sp.q?.trim().slice(0, 100) || undefined,
    status: ["OPEN", "CLOSED", "ARCHIVED"].includes(sp.status ?? "")
      ? sp.status
      : undefined,
    unitId: uuid(sp.unit),
    classId: uuid(sp.class),
    out: sp.out === "1",
    overdue: sp.overdue === "1",
    flagged: sp.flagged === "1",
  };
}

const include = {
  ...fileFactsInclude,
  fileClass: { select: { label: true, systemKey: true } },
  security: { select: { label: true } },
  fileStatus: { select: { label: true, systemKey: true } },
  owningUnit: { select: { name: true } },
} satisfies Prisma.RegistryFileInclude;

export async function fileIndex(
  db: Db,
  user: Principal,
  f: FileFilters,
  now: Date,
) {
  assertCan(user, "files.read");
  const ctx = await loadRuleContext(db, now);
  const rows = await db.registryFile.findMany({
    where: {
      AND: [
        fileWhere(user),
        f.status ? { fileStatus: { systemKey: f.status } } : {},
        f.unitId ? { owningUnitId: f.unitId } : {},
        f.classId ? { fileClassId: f.classId } : {},
        f.q
          ? {
              OR: [
                { reference: { contains: f.q, mode: "insensitive" } },
                { title: { contains: f.q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    include,
    orderBy: { reference: "asc" },
  });
  let out = rows.map((r) => ({
    ...r,
    derived: deriveFile(toFileFacts(r), ctx),
  }));
  if (f.out) out = out.filter((r) => r.derived.isOut);
  if (f.overdue)
    out = out.filter(
      (r) => r.derived.latestMovementStatus === "Overdue" && r.derived.isOut,
    );
  if (f.flagged) out = out.filter((r) => r.derived.flags.length > 0);
  return { rows: out, today: ctx.today };
}

export type FileIndexRow = Awaited<
  ReturnType<typeof fileIndex>
>["rows"][number];

/** Every movement of the files the user may see, newest first. */
export async function movementLog(
  db: Db,
  user: Principal,
  status: MovementStatus | undefined,
  now: Date,
) {
  assertCan(user, "files.read");
  const ctx = await loadRuleContext(db, now);
  const rows = await db.fileMovement.findMany({
    where: { file: fileWhere(user) },
    include: {
      unit: { select: { name: true } },
      file: { select: { id: true, reference: true, title: true } },
      releasedBy: { select: { name: true } },
      receivedBackBy: { select: { name: true } },
    },
    orderBy: { outAt: "desc" },
  });
  const all = rows.map((m) => ({
    ...m,
    derived: deriveMovement(toMovementFacts(m), ctx),
  }));
  return status ? all.filter((m) => m.derived.status === status) : all;
}

export async function fileDetail(
  db: Db,
  user: Principal,
  id: string,
  now: Date,
) {
  assertCan(user, "files.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const ctx = await loadRuleContext(db, now);
  const row = await db.registryFile.findFirst({
    where: { AND: [{ id }, fileWhere(user)] },
    include: { ...include, createdBy: { select: { name: true } } },
  });
  if (!row) return null;
  const movements = await db.fileMovement.findMany({
    where: { fileId: row.id },
    include: {
      unit: { select: { name: true } },
      releasedBy: { select: { name: true } },
      receivedBackBy: { select: { name: true } },
      issuedToUser: { select: { name: true } },
    },
    orderBy: { outAt: "desc" },
  });
  const inward = await db.inwardItem.findMany({
    where: { AND: [{ fileId: row.id }, inwardWhere(user)] },
    select: {
      id: true,
      number: true,
      sender: true,
      subject: true,
      deemedReceiptDate: true,
      voidedAt: true,
    },
    orderBy: [{ numberYear: "desc" }, { serial: "desc" }],
  });
  const outward = await db.outwardItem.findMany({
    where: { AND: [{ fileId: row.id }, outwardWhere(user)] },
    select: {
      id: true,
      number: true,
      addressee: true,
      subject: true,
      documentDate: true,
      voidedAt: true,
    },
    orderBy: [{ numberYear: "desc" }, { serial: "desc" }],
  });
  return {
    row,
    derived: deriveFile(toFileFacts(row), ctx),
    movements: movements.map((m) => ({
      ...m,
      derived: deriveMovement(toMovementFacts(m), ctx),
    })),
    inward,
    outward,
    today: ctx.today,
    history: await auditHistory(db, "RegistryFile", row.id),
  };
}
