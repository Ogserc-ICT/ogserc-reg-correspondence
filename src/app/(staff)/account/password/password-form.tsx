"use client";
import { useActionState } from "react";
import {
  Field,
  inputClass,
  Messages,
  SubmitButton,
  type FormState,
} from "@/app/_components/form";
import { PASSWORD_MIN } from "@/domain/passwords";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(
    changePasswordAction,
    {},
  );
  return (
    <form action={action} className="space-y-5">
      <Messages state={state} />
      <Field label="Current password">
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN} characters. A short sentence is easier to remember.`}
      >
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <Field label="New password again">
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
