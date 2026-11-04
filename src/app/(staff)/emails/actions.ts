"use server";
// Emails to review (SPEC-v2 C6.3) and RESEND ACK EMAIL (C6.1).
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { actorWith, rawOf } from "@/server/actor";
import { getDb } from "@/server/db";
import {
  discardReviewedEmail,
  resendAckEmail,
  ResendNeedsConfirm,
  sendReviewedEmail,
} from "@/server/email/ack";

function done(message: string, itemId?: string): FormState {
  revalidatePath("/emails");
  revalidatePath("/");
  if (itemId) revalidatePath(`/inward/${itemId}`);
  return { ok: true, message };
}

export async function sendReviewedAction(emailId: string): Promise<FormState> {
  const actor = await actorWith("ackEmail.send");
  try {
    return done((await sendReviewedEmail(getDb(), actor, emailId)).message);
  } catch (err) {
    return formError(err);
  }
}

export async function discardReviewedAction(
  emailId: string,
): Promise<FormState> {
  const actor = await actorWith("ackEmail.send");
  try {
    return done((await discardReviewedEmail(getDb(), actor, emailId)).message);
  } catch (err) {
    return formError(err);
  }
}

/** Resend: asks first when the item was emailed before (C6.1). */
export async function resendAckEmailAction(
  itemId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await actorWith("ackEmail.send");
  const raw = rawOf(form);
  try {
    const { message } = await resendAckEmail(getDb(), actor, itemId, {
      confirm: raw.confirmResend === "1",
    });
    return done(message, itemId);
  } catch (err) {
    if (err instanceof ResendNeedsConfirm)
      return { confirm: err.message, values: {} };
    return formError(err);
  }
}
