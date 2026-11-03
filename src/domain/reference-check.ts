// Reference-data checks (SPEC-v2 C2, E2). Pure: callers pass names in.

export type TypeUnitProblem = { type: string; defaultUnit: string };

/** Every incoming type whose default unit is not one of `unitNames`. */
export function checkTypeDefaultUnits(
  types: readonly { name: string; defaultUnit: string }[],
  unitNames: Iterable<string>,
): TypeUnitProblem[] {
  const known = new Set(unitNames);
  return types
    .filter((t) => !known.has(t.defaultUnit))
    .map((t) => ({ type: t.name, defaultUnit: t.defaultUnit }));
}

export type ResolvedDefaultUnits = {
  /** type name → unit name, for every type that resolved. */
  unitByType: Map<string, string>;
  /** Types whose default unit was replaced by a confirmed decision. */
  replaced: { type: string; from: string; to: string }[];
  /** Types left without a valid unit (nothing is ever created for them). */
  missing: TypeUnitProblem[];
};

/**
 * Resolves each type's default unit against the unit list. A missing unit is
 * replaced only by an explicit, confirmed replacement that itself exists.
 */
export function resolveTypeDefaultUnits(
  types: readonly { name: string; defaultUnit: string }[],
  unitNames: Iterable<string>,
  replacements: Readonly<Record<string, string>>,
): ResolvedDefaultUnits {
  const known = new Set(unitNames);
  const out: ResolvedDefaultUnits = {
    unitByType: new Map(),
    replaced: [],
    missing: [],
  };
  for (const t of types) {
    if (known.has(t.defaultUnit)) {
      out.unitByType.set(t.name, t.defaultUnit);
      continue;
    }
    const to = replacements[t.name];
    if (to && known.has(to)) {
      out.unitByType.set(t.name, to);
      out.replaced.push({ type: t.name, from: t.defaultUnit, to });
    } else out.missing.push({ type: t.name, defaultUnit: t.defaultUnit });
  }
  return out;
}
