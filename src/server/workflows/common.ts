// Shared pieces of the inward/outward workflows: raw form parsing, reference
// checks, row locks and the result shape actions turn into messages.
import { isIsoDate, type IsoDate } from "@/domain/calendar";
import type { Principal } from "@/domain/permissions";
import type { ListKind } from "@/generated/prisma/client";
import { fileWhere, inwardWhere, outwardWhere } from "../access";
import type { Tx } from "../db";
import { ValidationError } from "../errors";

/** Form fields as submitted: every value a string ("" when empty). */
export type Raw = Record<string, string | undefined>;

/** Invalid input: missing required fields and any other problems. */
export class FormProblems extends ValidationError {
  constructor(
    public readonly missing: string[],
    problems: string[],
  ) {
    super(problems);
    this.name = "FormProblems";
  }
}

export function throwIfProblems(missing: string[], problems: string[]) {
  if (missing.length || problems.length)
    throw new FormProblems(missing, problems);
}

/** Collects parse problems while reading typed values out of a Raw form. */
export class Reader {
  readonly problems: string[] = [];
  constructor(private readonly raw: Raw) {}

  has(key: string): boolean {
    return key in this.raw;
  }
  text(key: string): string | null {
    const v = this.raw[key]?.trim();
    return v ? v : null;
  }
  id(key: string, label: string): string | null {
    const v = this.text(key);
    if (v && !/^[0-9a-f-]{36}$/i.test(v)) {
      this.problems.push(`${label}: choose a value from the list.`);
      return null;
    }
    return v;
  }
  date(key: string, label: string): IsoDate | null {
    const v = this.text(key);
    if (v && !isIsoDate(v)) {
      this.problems.push(`${label}: enter a valid date.`);
      return null;
    }
    return v;
  }
  int(key: string, label: string): number | null {
    const v = this.text(key);
    if (v === null) return null;
    if (!/^\d+$/.test(v) || Number(v) > 100_000) {
      this.problems.push(`${label}: enter a whole number, 0 or more.`);
      return null;
    }
    return Number(v);
  }
  /** "Y" / "N" / "" → true / false / null. */
  yesNo(key: string): boolean | null {
    const v = this.text(key)?.toUpperCase();
    return v === "Y" ? true : v === "N" ? false : null;
  }
  checkbox(key: string): boolean {
    return this.raw[key] === "on" || this.raw[key] === "true";
  }
}

type RefCheck =
  | { kind: "list"; list: ListKind; id: string | null; label: string }
  | {
      kind:
        "unit" | "incomingType" | "outgoingType" | "registryUser" | "signatory";
      id: string | null;
      label: string;
    };

/**
 * Every referenced row exists and is the right kind; on create it must also
 * be active. Returns problems worded for the screen.
 */
export async function refProblems(
  tx: Tx,
  checks: RefCheck[],
  requireActive: boolean,
): Promise<string[]> {
  const problems: string[] = [];
  for (const c of checks) {
    if (!c.id) continue;
    let row: { active: boolean } | null = null;
    switch (c.kind) {
      case "list":
        row = await tx.listItem.findFirst({
          where: { id: c.id, list: c.list },
        });
        break;
      case "unit":
        row = await tx.unit.findUnique({ where: { id: c.id } });
        break;
      case "incomingType":
        row = await tx.incomingType.findUnique({ where: { id: c.id } });
        break;
      case "outgoingType":
        row = await tx.outgoingType.findUnique({ where: { id: c.id } });
        break;
      case "registryUser":
        row = await tx.user.findFirst({
          where: {
            id: c.id,
            role: { in: ["REGISTRY_OFFICER", "HEAD_OF_REGISTRY"] },
          },
        });
        break;
      case "signatory":
        row = await tx.signatory.findUnique({ where: { id: c.id } });
        break;
    }
    if (!row || (requireActive && !row.active))
      problems.push(`${c.label}: choose a value from the list.`);
  }
  return problems;
}

/** Linked items must be visible to the user and not void (SPEC §9 R2). */
export async function linkProblems(
  tx: Tx,
  user: Principal,
  links: {
    inwardId?: string | null;
    outwardId?: string | null;
    fileId?: string | null;
  },
): Promise<string[]> {
  const p: string[] = [];
  if (links.inwardId) {
    const ok = await tx.inwardItem.count({
      where: {
        AND: [{ id: links.inwardId, voidedAt: null }, inwardWhere(user)],
      },
    });
    if (!ok) p.push("In reply to: choose an inward item from the search.");
  }
  if (links.outwardId) {
    const ok = await tx.outwardItem.count({
      where: {
        AND: [{ id: links.outwardId, voidedAt: null }, outwardWhere(user)],
      },
    });
    if (!ok)
      p.push(
        "In response to our ref.: choose an outward item from the search.",
      );
  }
  if (links.fileId) {
    const ok = await tx.registryFile.count({
      where: { AND: [{ id: links.fileId }, fileWhere(user)] },
    });
    if (!ok) p.push("File: choose a file from the search.");
  }
  return p;
}

/** Holds the item's row until the transaction ends (STACK rule 5). */
export async function lockInward(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "InwardItem" WHERE "id" = ${id}::uuid FOR UPDATE`;
}
export async function lockOutward(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "OutwardItem" WHERE "id" = ${id}::uuid FOR UPDATE`;
}

export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}
