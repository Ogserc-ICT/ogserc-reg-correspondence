"use client";
import { useActionState, useState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import type { FormOptions } from "@/server/read/options";
import { logInwardAction } from "../actions";
import { InwardFields } from "../inward-fields";

export function NewInwardForm({
  options,
  defaults,
}: {
  options: FormOptions;
  defaults: Record<string, string>;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    logInwardAction,
    {},
  );
  const [cleared, setCleared] = useState(0);
  const [dirty, setDirty] = useState(false);
  // After a save: fresh defaults. After an error: what was typed.
  const values = state.values ?? defaults;
  const key = `${state.message ?? ""}-${state.errors?.length ?? 0}-${cleared}`;

  function clear() {
    if (
      dirty &&
      !window.confirm("Clear the form? What you typed will be lost.")
    )
      return;
    setDirty(false);
    setCleared((n) => n + 1);
  }

  return (
    <form
      key={key}
      action={(fd) => {
        setDirty(false);
        return action(fd);
      }}
      onInput={() => setDirty(true)}
      className="space-y-5"
    >
      <Messages state={state} />
      <InwardFields
        options={options}
        values={cleared && !state.values ? defaults : values}
      />
      <div className="flex flex-wrap gap-3">
        <SubmitButton>Save to register</SubmitButton>
        <button
          type="button"
          onClick={clear}
          className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          Clear form
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        * required. The acknowledgement slip (Save + print slip) arrives in
        Phase 5.
      </p>
    </form>
  );
}
