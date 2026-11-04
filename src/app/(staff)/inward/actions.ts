"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import { newInwardDefaults } from "@/server/read/defaults";
import {
  inwardPreview,
  type InwardPreview,
} from "@/server/read/inward-preview";
import { formOptions } from "@/server/read/options";
import { voidItem } from "@/server/registers";
import {
  closeToday,
  forwardToday,
  logInward,
  NotRoutedYet,
  updateInward,
} from "@/server/workflows/inward";

/** New Inward's "Will be saved as" panel; reads only, assigns nothing. */
export async function previewInwardAction(
  raw: Record<string, string>,
): Promise<InwardPreview> {
  const actor = await actorWith("registers.write");
  return inwardPreview(getDb(), actor.user, raw, actor.now);
}

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
    const after =
      raw.after === "print" || raw.after === "pdf" ? raw.after : undefined;
    return {
      ok: true,
      message,
      after,
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
  values?: Record<string, string>,
): Promise<FormState> {
  try {
    const { message } = await fn();
    revalidatePath(`/inward/${id}`);
    revalidatePath("/inward");
    revalidatePath("/");
    return { ok: true, message };
  } catch (err) {
    // Not routed yet: ask first, then resend with the officer's yes (C5.4).
    if (err instanceof NotRoutedYet)
      return { confirm: err.message, values: values ?? {} };
    return formError(err);
  }
}

const CONFIRM = "confirmForwardBeforeRouting";
const confirmed = (raw: Record<string, string>) => raw[CONFIRM] === "1";

export async function updateInwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
) {
  const actor = await actorWith("registers.write");
  const raw = rawOf(form);
  const result = await run(
    id,
    () =>
      updateInward(getDb(), actor, id, raw, {
        confirmForwardBeforeRouting: confirmed(raw),
      }),
    raw,
  );
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

export async function forwardTodayAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("registers.write");
  const raw = rawOf(form);
  return run(
    id,
    () =>
      forwardToday(getDb(), actor, id, {
        confirmForwardBeforeRouting: confirmed(raw),
      }),
    raw,
  );
}

export async function closeTodayAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("registers.write");
  const raw = rawOf(form);
  return run(
    id,
    () =>
      closeToday(getDb(), actor, id, raw.closingNote ?? "", {
        confirmForwardBeforeRouting: confirmed(raw),
      }),
    raw,
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
