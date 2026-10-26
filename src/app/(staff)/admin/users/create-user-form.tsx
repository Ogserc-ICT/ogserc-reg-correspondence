"use client";
import { useActionState } from "react";
import {
  Field,
  inputClass,
  Messages,
  SubmitButton,
  type FormState,
} from "@/app/_components/form";
import { createUserAction } from "./actions";
import { UserFields, type UnitOption } from "./user-fields";

export function CreateUserForm({
  units,
  suggestedPassword,
}: {
  units: UnitOption[];
  suggestedPassword: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    createUserAction,
    {},
  );
  const v = state.values ?? {};
  return (
    // A new key after each save clears the form; after an error it keeps the values.
    <form
      key={state.ok ? state.message : (state.attempt ?? "form")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <UserFields
        units={units}
        values={{ ...v, isSignatory: v.isSignatory === "on" }}
      />
      <Field
        label="Temporary password"
        hint="Suggested; you can change it. Give it to the person in person, not by email."
      >
        <input
          name="temporaryPassword"
          required
          defaultValue={suggestedPassword}
          className={`${inputClass} font-mono`}
        />
      </Field>
      <SubmitButton>Add user</SubmitButton>
    </form>
  );
}
