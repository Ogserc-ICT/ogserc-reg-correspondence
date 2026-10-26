"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import { newOutwardDefaults } from "@/server/read/defaults";
import { formOptions } from "@/server/read/options";
import { voidItem } from "@/server/registers";
import {
  deliverToday,
  dispatchToday,
  logOutward,
  updateOutward,
} from "@/server/workflows/outward";

/** SAVE & GET NUMBER. */
export async function logOutwardAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("registers.write");
  const raw = rawOf(form);
  try {
    const { item, message } = await logOutward(getDb(), actor, raw);
    revalidatePath("/outward");
    revalidatePath("/");
    return {
      ok: true,
      message,
      link: { href: `/outward/${item.id}`, label: item.number },
      values: newOutwardDefaults(
        await formOptions(getDb()),
        actor.user,
        actor.now,
      ),
    };
  } catch (err) {
    return formError(err, raw);
  }
}

async function run(
  id: string,
  fn: () => Promise<{ message: string }>,
): Promise<FormState> {
  try {
    const { message } = await fn();
    revalidatePath(`/outward/${id}`);
    revalidatePath("/outward");
    revalidatePath("/");
    return { ok: true, message };
  } catch (err) {
    return formError(err);
  }
}

export async function updateOutwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
) {
  const actor = await actorWith("registers.write");
  const raw = rawOf(form);
  const result = await run(id, () => updateOutward(getDb(), actor, id, raw));
  return result.ok ? result : { ...result, values: raw };
}

export async function editOutwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
) {
  const actor = await actorWith("items.editAny");
  const raw = rawOf(form);
  const result = await run(id, () =>
    updateOutward(getDb(), actor, id, raw, { full: true, reason: raw.reason }),
  );
  return result.ok ? result : { ...result, values: raw };
}

export async function dispatchTodayAction(id: string): Promise<FormState> {
  const actor = await actorWith("registers.write");
  return run(id, () => dispatchToday(getDb(), actor, id));
}

export async function deliverTodayAction(id: string): Promise<FormState> {
  const actor = await actorWith("registers.write");
  return run(id, () => deliverToday(getDb(), actor, id));
}

export async function voidOutwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("items.void");
  const reason = String(form.get("voidReason") ?? "");
  return run(id, async () => {
    await getDb().$transaction((tx) =>
      voidItem(tx, "outward", id, reason, actor),
    );
    return {
      message: "Voided. The number is kept and will not be used again.",
    };
  });
}
