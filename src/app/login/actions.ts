"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/_components/form";
import { getAuth } from "@/server/auth";
import { appNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { login } from "@/server/session";

export async function loginAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email.trim() || !password)
    return {
      errors: ["Enter your email address and password."],
      values: { email },
    };

  const result = await login(
    getDb(),
    getAuth(),
    { email, password, headers: await headers() },
    appNow(),
  );
  if (!result.ok) return { errors: [result.error], values: { email } };
  redirect(result.mustChangePassword ? "/account/password" : "/");
}
