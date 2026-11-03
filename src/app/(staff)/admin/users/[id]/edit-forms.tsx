"use client";
import { useActionState } from "react";
import {
  Field,
  inputClass,
  Messages,
  SubmitButton,
  type FormState,
} from "@/app/_components/form";
import { resetPasswordAction, updateUserAction } from "../actions";
import { UserFields, type UnitOption, type UserValues } from "../user-fields";

export function EditUserForm({
  id,
  units,
  values,
}: {
  id: string;
  units: UnitOption[];
  values: UserValues & { active: boolean };
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateUserAction.bind(null, id),
    {},
  );
  const v = state.values;
  const shown = v
    ? {
        ...v,
        isSignatory: v.isSignatory === "on",
        canRoute: v.canRoute === "on",
      }
    : values;
  const active = v ? v.active === "on" : values.active;
  return (
    <form
      key={v ? (state.attempt ?? "retry") : "initial"}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <UserFields units={units} values={shown} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} />
        Account active (unticking signs them out everywhere)
      </label>
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({
  id,
  suggestedPassword,
}: {
  id: string;
  suggestedPassword: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    resetPasswordAction.bind(null, id),
    {},
  );
  return (
    <form action={action} className="max-w-md space-y-4">
      <Messages state={state} />
      <Field
        label="New temporary password"
        hint="They must change it at their next sign-in."
      >
        <input
          name="temporaryPassword"
          required
          defaultValue={suggestedPassword}
          className={`${inputClass} font-mono`}
        />
      </Field>
      <SubmitButton variant="secondary">Set temporary password</SubmitButton>
    </form>
  );
}
