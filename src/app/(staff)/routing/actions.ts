"use server";
// Routing Desk (SPEC-v2 C5.2). The actions re-check the session; routeInward
// refuses anyone without registry.route with the C5.1 message.
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { rawOf } from "@/server/actor";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import {
  searchFilesForRouting,
  searchInwardForRouting,
} from "@/server/read/items";
import { routeInward } from "@/server/workflows/routing";
import type { PickerResult } from "../search-actions";

export async function searchRoutingItemsAction(
  q: string,
): Promise<PickerResult[]> {
  const user = await requireUser();
  return (await searchInwardForRouting(getDb(), user, q)).map((r) => ({
    id: r.id,
    label: r.number,
    detail: `${r.sender} — ${r.subject}`,
  }));
}

export async function searchRoutingFilesAction(
  q: string,
): Promise<PickerResult[]> {
  const user = await requireUser();
  return (await searchFilesForRouting(getDb(), user, q)).map((r) => ({
    id: r.id,
    label: r.reference,
    detail: r.title,
  }));
}

export async function routeInwardAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = { user: await requireUser(), now: appNow() };
  const { password, ...raw } = rawOf(form);
  try {
    const { message } = await routeInward(getDb(), actor, id, raw, {
      password,
    });
    revalidatePath("/routing");
    revalidatePath(`/inward/${id}`);
    revalidatePath("/inward");
    revalidatePath("/");
    return { ok: true, message };
  } catch (err) {
    return formError(err, raw);
  }
}
