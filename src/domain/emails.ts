// Email address lists for units and divisions (SPEC-v2 C1, C6.2). Pure.

/** A plain, conservative address check (no display names, no spaces). */
const ADDRESS = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export function isEmailAddress(s: string): boolean {
  return ADDRESS.test(s.trim());
}

/**
 * Splits on commas, semicolons and whitespace, trims, lower-cases and drops
 * duplicates (first occurrence wins). Returns the valid addresses and any
 * entries that are not addresses, so a form can name them.
 */
export function normaliseEmails(input: string | readonly string[]): {
  emails: string[];
  invalid: string[];
} {
  const parts = (typeof input === "string" ? [input] : input)
    .flatMap((s) => s.split(/[,;\s]+/))
    .map((s) => s.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (!isEmailAddress(p)) invalid.push(p);
    else if (!emails.includes(p.toLowerCase())) emails.push(p.toLowerCase());
  }
  return { emails, invalid };
}
