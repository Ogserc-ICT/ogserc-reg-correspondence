"use client";
import { useActionState } from "react";
import {
  Field,
  inputClass,
  Messages,
  SubmitButton,
  type FormState,
} from "@/app/_components/form";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <Messages state={state} />
      <Field label="Email address">
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.values?.email}
          className={inputClass}
        />
      </Field>
      <Field label="Password">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
