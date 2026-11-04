"use server";
// Organisation (SPEC-v2 C1, C7, C8, C12). Each action re-checks the session.
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import {
  saveDivision,
  saveFileClassCode,
  saveSignatory,
  saveUnit,
} from "@/server/organisation";

async function run(
  form: FormData,
  fn: (raw: Record<string, string>) => Promise<{ message: string }>,
): Promise<FormState> {
  const raw = rawOf(form);
  try {
    const { message } = await fn(raw);
    revalidatePath("/admin/organisation");
    return { ok: true, message };
  } catch (err) {
    return formError(err, raw);
  }
}

export async function saveDivisionAction(
  id: string | null,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("organisation.manage");
  return run(form, (raw) => saveDivision(getDb(), actor, id, raw));
}

export async function saveUnitAction(
  id: string | null,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("organisation.manage");
  return run(form, (raw) => saveUnit(getDb(), actor, id, raw));
}

export async function saveSignatoryAction(
  id: string | null,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("organisation.manage");
  return run(form, (raw) => saveSignatory(getDb(), actor, id, raw));
}

export async function saveFileClassCodeAction(
  id: string,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("organisation.manage");
  return run(form, (raw) => saveFileClassCode(getDb(), actor, id, raw));
}
