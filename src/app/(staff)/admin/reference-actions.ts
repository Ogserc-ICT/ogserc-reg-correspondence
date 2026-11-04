"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import type { ListKind } from "@/generated/prisma/client";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import {
  deleteHoliday,
  saveHoliday,
  saveIncomingType,
  saveListItem,
  saveOutgoingType,
} from "@/server/reference";

async function run(
  path: string,
  form: FormData,
  fn: (raw: Record<string, string>) => Promise<{ message: string }>,
): Promise<FormState> {
  const raw = rawOf(form);
  try {
    const { message } = await fn(raw);
    revalidatePath(path);
    return { ok: true, message };
  } catch (err) {
    return formError(err, raw);
  }
}

export async function saveIncomingTypeAction(
  id: string | null,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("reference.manage");
  return run("/admin/types", form, (raw) =>
    saveIncomingType(getDb(), actor, id, raw),
  );
}

export async function saveOutgoingTypeAction(
  id: string | null,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("reference.manage");
  return run("/admin/types", form, (raw) =>
    saveOutgoingType(getDb(), actor, id, raw),
  );
}

export async function saveListItemAction(
  list: ListKind,
  id: string | null,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("reference.manage");
  return run("/admin/lists", form, (raw) =>
    saveListItem(getDb(), actor, list, id, raw),
  );
}

export async function saveHolidayAction(
  id: string | null,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("reference.manage");
  return run("/admin/holidays", form, (raw) =>
    saveHoliday(getDb(), actor, id, raw),
  );
}

export async function deleteHolidayAction(
  id: string,
  _p: FormState,
  form: FormData,
) {
  const actor = await actorWith("reference.manage");
  return run("/admin/holidays", form, () => deleteHoliday(getDb(), actor, id));
}
