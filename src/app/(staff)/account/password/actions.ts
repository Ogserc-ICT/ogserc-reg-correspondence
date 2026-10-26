"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/_components/form";
import { formError } from "@/server/action-errors";
import { getAuth } from "@/server/auth";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { changeOwnPassword } from "@/server/users";

export async function changePasswordAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser({ allowTemporaryPassword: true });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("newPassword") ?? "");
  if (next !== String(form.get("confirmPassword") ?? ""))
    return { errors: ["The new passwords don't match."] };

  const session = await getAuth().api.getSession({ headers: await headers() });
  try {
    await changeOwnPassword(
      getDb(),
      user,
      { current, next, keepSessionToken: session?.session.token },
      appNow(),
    );
  } catch (err) {
    return formError(err);
  }
  redirect("/");
}
