"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import {
  createFile,
  issueFile,
  previewFileReference,
  recordReturn,
  StillOut,
  updateFile,
} from "@/server/workflows/files";

function refresh(id?: string) {
  revalidatePath("/files");
  revalidatePath("/");
  if (id) revalidatePath(`/files/${id}`);
}

/** ADD TO FILE INDEX. */
export async function createFileAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("files.write");
  const raw = rawOf(form);
  try {
    const { file, message } = await createFile(getDb(), actor, raw);
    refresh();
    return {
      ok: true,
      message,
      link: { href: `/files/${file.id}`, label: `Open ${file.reference}` },
    };
  } catch (err) {
    return formError(err, raw);
  }
}

export async function updateFileAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("files.write");
  const raw = rawOf(form);
  try {
    const { message } = await updateFile(getDb(), actor, id, raw);
    refresh(id);
    return { ok: true, message };
  } catch (err) {
    return formError(err, raw);
  }
}

/**
 * ISSUE FILE. If the file is still out, the answer is a question; the form
 * sends `confirmStillOut=1` when the officer says yes.
 */
export async function issueFileAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("files.write");
  const raw = rawOf(form);
  try {
    const { message } = await issueFile(getDb(), actor, id, raw, {
      confirmStillOut: raw.confirmStillOut === "1",
    });
    refresh(id);
    return { ok: true, message };
  } catch (err) {
    if (err instanceof StillOut) return { confirm: err.message, values: raw };
    return formError(err, raw);
  }
}

/** RECORD RETURN. */
export async function returnFileAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("files.write");
  try {
    const { message } = await recordReturn(getDb(), actor, id, rawOf(form));
    refresh(id);
    return { ok: true, message };
  } catch (err) {
    return formError(err);
  }
}

/** New file: the reference a blank field would get (SPEC-v2 C8). */
export async function previewFileReferenceAction(
  fileClassId: string,
): Promise<{ reference: string } | { problem: string }> {
  await actorWith("files.write");
  if (!/^[0-9a-f-]{36}$/i.test(fileClassId)) return { problem: "" };
  return previewFileReference(getDb(), fileClassId);
}
