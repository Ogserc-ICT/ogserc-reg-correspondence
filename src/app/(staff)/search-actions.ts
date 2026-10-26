"use server";
// Searches behind the link pickers (SPEC §9 R2). Each re-checks the session
// and only returns items the user may read.
import { requireUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { searchFiles, searchInward, searchOutward } from "@/server/read/items";

export type PickerResult = { id: string; label: string; detail: string };

export async function searchInwardAction(q: string): Promise<PickerResult[]> {
  const user = await requireUser();
  return (await searchInward(getDb(), user, q)).map((r) => ({
    id: r.id,
    label: r.number,
    detail: `${r.sender} — ${r.subject}`,
  }));
}

export async function searchOutwardAction(q: string): Promise<PickerResult[]> {
  const user = await requireUser();
  return (await searchOutward(getDb(), user, q)).map((r) => ({
    id: r.id,
    label: r.number,
    detail: `${r.addressee} — ${r.subject}`,
  }));
}

export async function searchFilesAction(q: string): Promise<PickerResult[]> {
  const user = await requireUser();
  return (await searchFiles(getDb(), user, q)).map((r) => ({
    id: r.id,
    label: r.reference,
    detail: r.title,
  }));
}
