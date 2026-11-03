// Generated file references (SPEC-v2 C8): {prefix}/{code}/{NNN}, where NNN is
// the highest existing serial for that code + 1. Matching ignores case. The
// server runs this inside the insert transaction under a per-code lock.

/** Serial of `ref` under `stem`, like VBA Val(): leading digits, else 0. */
function serialAfter(ref: string, stem: string): number | null {
  if (!ref.toUpperCase().startsWith(stem.toUpperCase())) return null;
  const m = /^\s*(\d+)/.exec(ref.slice(stem.length));
  return m ? Number(m[1]) : 0;
}

export function nextFileReference(
  prefix: string,
  code: string,
  existing: readonly string[],
  digits: number,
): string {
  const stem = `${prefix}/${code}/`;
  let max = 0;
  for (const ref of existing) {
    const n = serialAfter(ref.trim(), stem);
    if (n !== null && n > max) max = n;
  }
  // A serial past 999 simply grows, as VBA Format "000" does.
  return `${stem}${String(max + 1).padStart(digits, "0")}`;
}

/** File references are unique ignoring case and surrounding spaces (V9). */
export function fileReferenceTaken(
  ref: string,
  existing: readonly string[],
): boolean {
  const k = ref.trim().toUpperCase();
  return existing.some((e) => e.trim().toUpperCase() === k);
}

export function missingFileClassCode(fileClass: string): string {
  return `Set a file class code for '${fileClass}' in Admin, or type the file reference.`;
}

export function fileAlreadyInIndex(ref: string): string {
  return `${ref} is already in the File Index.`;
}

/**
 * Internal File Desk (C8): a file is issued to an OGSERC unit chosen from the
 * unit list. Returns the problem, or null.
 */
export function issueUnitProblem(
  unitId: string | null,
  activeUnitIds: ReadonlySet<string>,
): string | null {
  if (!unitId) return "Please complete:\nUnit";
  return activeUnitIds.has(unitId)
    ? null
    : "Choose the unit from the list of OGSERC units.";
}
