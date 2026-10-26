// Turns server-layer errors into a form state; anything unexpected is rethrown
// (Next's redirect/forbidden are errors too and must pass through).
import { randomUUID } from "node:crypto";
import { ForbiddenError, ValidationError } from "./errors";
import { FormProblems } from "./workflows/common";

/**
 * Each error response carries a fresh `attempt` id. Forms use it as their
 * key so they remount with what was typed: React resets a form after every
 * action, and a <select> would otherwise fall back to its first default.
 */
export function formError(err: unknown, values?: Record<string, string>) {
  const attempt = randomUUID();
  if (err instanceof FormProblems)
    return { missing: err.missing, errors: err.problems, values, attempt };
  if (err instanceof ValidationError)
    return { errors: err.problems, values, attempt };
  if (err instanceof ForbiddenError)
    return { errors: [err.message], values, attempt };
  throw err;
}

/** Text fields from FormData, for re-filling a form after an error. */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries())
    if (typeof v === "string" && !/password/i.test(k)) out[k] = v;
  return out;
}
