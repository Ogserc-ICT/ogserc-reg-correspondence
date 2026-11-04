// Read scopes as Prisma filters (STACK rule 6): every query of inward/outward
// items and files goes through these, so a unit officer can't reach another
// unit's items even by typing a URL.
import { can, readScope, type Principal } from "@/domain/permissions";
import type { Prisma } from "@/generated/prisma/client";

const NOTHING = { id: { in: [] as string[] } };

export function inwardWhere(user: Principal): Prisma.InwardItemWhereInput {
  const scope = readScope(user);
  if (scope.kind === "all") return {};
  if (scope.kind === "unit")
    return { routedUnitId: scope.unitId, voidedAt: null };
  return NOTHING;
}

export function outwardWhere(user: Principal): Prisma.OutwardItemWhereInput {
  const scope = readScope(user);
  if (scope.kind === "all") return {};
  if (scope.kind === "unit")
    return { originatingUnitId: scope.unitId, voidedAt: null };
  return NOTHING;
}

/** A system key that is absent or different (NULL-safe: SQL's NULL <> x is NULL). */
const keyIsNot = (key: string) => ({
  OR: [{ systemKey: null }, { systemKey: { not: key } }],
});

/**
 * Files a registry officer may see: neither Confidential security nor the
 * Personnel class (SPEC §10). Written positively because NOT(...) over a
 * NULL system key would hide ordinary files too.
 */
export const NON_CONFIDENTIAL_FILE: Prisma.RegistryFileWhereInput = {
  AND: [
    { security: keyIsNot("CONFIDENTIAL") },
    { OR: [{ fileClassId: null }, { fileClass: keyIsNot("PERSONNEL") }] },
  ],
};

export function fileWhere(user: Principal): Prisma.RegistryFileWhereInput {
  if (!can(user, "files.read")) return NOTHING;
  if (can(user, "files.readConfidential")) return {};
  return NON_CONFIDENTIAL_FILE;
}

/**
 * Files a router may choose on the Routing Desk (SPEC-v2 C5.2). Routing grants
 * no file access of its own: Confidential and Personnel files only for users
 * whose role reads them (C12).
 */
export function routingFileWhere(
  user: Principal,
): Prisma.RegistryFileWhereInput {
  return can(user, "files.readConfidential") ? {} : NON_CONFIDENTIAL_FILE;
}
