"use server";
// Front Desk (SPEC-v2 C3.2): log an intake; pull one into New Inward.
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import { ValidationError } from "@/server/errors";
import {
  intakeDefaults,
  intakeForPull,
  logIntake,
} from "@/server/workflows/front-desk";

export async function logIntakeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("frontdesk.write");
  const raw = rawOf(form);
  try {
    const { message } = await logIntake(getDb(), actor, raw);
    revalidatePath("/front-desk");
    revalidatePath("/");
    return {
      ok: true,
      message,
      values: await intakeDefaults(getDb(), actor.now),
    };
  } catch (err) {
    return formError(err, raw);
  }
}

export type PullResult =
  | { ok: true; intakeNo: string; values: Record<string, string> }
  | { ok: false; error: string };

/** The intake's non-blank details for New Inward, or why it can't be pulled. */
export async function pullIntakeAction(id: string): Promise<PullResult> {
  const actor = await actorWith("registers.write");
  try {
    const r = await intakeForPull(getDb(), actor.user, id);
    return { ok: true, ...r };
  } catch (err) {
    if (err instanceof ValidationError)
      return { ok: false, error: err.problems.join(" ") };
    throw err;
  }
}
