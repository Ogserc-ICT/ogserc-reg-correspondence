// Turns server-layer errors into a form state; anything unexpected is rethrown
// (Next's redirect/forbidden are errors too and must pass through).
import { ForbiddenError, ValidationError } from "./errors";
import { FormProblems } from "./workflows/common";

export function formError(err: unknown, values?: Record<string, string>) {
  if (err instanceof FormProblems)
    return { missing: err.missing, errors: err.problems, values };
  if (err instanceof ValidationError) return { errors: err.problems, values };
  if (err instanceof ForbiddenError) return { errors: [err.message], values };
  throw err;
}

/** Text fields from FormData, for re-filling a form after an error. */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries())
    if (typeof v === "string" && !/password/i.test(k)) out[k] = v;
  return out;
}
