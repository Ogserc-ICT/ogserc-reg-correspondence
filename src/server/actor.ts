// The acting user for a server action: re-checks the session (actions are
// public endpoints) and pairs it with the app clock.
import type { Capability } from "@/domain/permissions";
import { appNow } from "./clock";
import { requireCan } from "./current-user";
import type { Actor } from "./registers";

export async function actorWith(cap: Capability): Promise<Actor> {
  return { user: await requireCan(cap), now: appNow() };
}

/** FormData → plain strings (files are ignored). */
export function rawOf(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
