"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import { newInwardDefaults } from "@/server/read/defaults";
import { formOptions } from "@/server/read/options";
import { voidItem } from "@/server/registers";
import {
  closeToday,
  forwardToday,
  logInward,
  updateInward,
} from "@/server/workflows/inward";

/** SAVE TO REGISTER. On success the form starts again from its defaults. */
export async function logInwardAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("registers.write");
  const raw = rawOf(form);
  try {
    const { item, message } = await logInward(getDb(), actor, raw);
    revalidatePath("/inward");
    revalidatePath("/");
    return {
      ok: true,
      message,
      link: { href: `/inward/${item.id}`, label: `Open ${item.number}` },
      values: newInwardDefaults(
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
    revalidatePath(`/inward/${id}`);
    revalidatePath("/inward");
    revalidatePath("/");
    return { ok: true, message };
  } catch (err) {
    return formError(err);
  }
}

export async function updateInwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
) {
  const actor = await actorWith("registers.write");
  const raw = rawOf(form);
  const result = await run(id, () => updateInward(getDb(), actor, id, raw));
  return result.ok ? result : { ...result, values: raw };
}

export async function editInwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
) {
  const actor = await actorWith("items.editAny");
  const raw = rawOf(form);
  const result = await run(id, () =>
    updateInward(getDb(), actor, id, raw, { full: true, reason: raw.reason }),
  );
  return result.ok ? result : { ...result, values: raw };
}

export async function forwardTodayAction(id: string): Promise<FormState> {
  const actor = await actorWith("registers.write");
  return run(id, () => forwardToday(getDb(), actor, id));
}

export async function closeTodayAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("registers.write");
  return run(id, () =>
    closeToday(getDb(), actor, id, String(form.get("closingNote") ?? "")),
  );
}

export async function voidInwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("items.void");
  const reason = String(form.get("voidReason") ?? "");
  return run(id, async () => {
    await getDb().$transaction((tx) =>
      voidItem(tx, "inward", id, reason, actor),
    );
    return {
      message: "Voided. The number is kept and will not be used again.",
    };
  });
}
