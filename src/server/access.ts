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

/** Confidential security or Personnel class (SPEC §10). */
export const CONFIDENTIAL_FILE: Prisma.RegistryFileWhereInput = {
  OR: [
    { security: { systemKey: "CONFIDENTIAL" } },
    { fileClass: { systemKey: "PERSONNEL" } },
  ],
};

export function fileWhere(user: Principal): Prisma.RegistryFileWhereInput {
  if (!can(user, "files.read")) return NOTHING;
  if (can(user, "files.readConfidential")) return {};
  return { NOT: CONFIDENTIAL_FILE };
}
