"use client";
import { useActionState, useEffect, useState } from "react";
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

  // Save + print slip / Save + PDF slip (SPEC §7).
  const slip = state.ok && state.link ? `${state.link.href}/slip` : null;
  useEffect(() => {
    if (!slip || !state.after) return;
    if (state.after === "print") window.open(slip, "_blank", "noopener");
    else {
      const a = document.createElement("a");
      a.href = `${slip}?download=1`;
      a.click();
    }
  }, [slip, state.after]);

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
      {slip && (
        <p className="-mt-2 text-sm">
          Slip:{" "}
          <a href={slip} target="_blank" rel="noopener" className="underline">
            print
          </a>{" "}
          ·{" "}
          <a href={`${slip}?download=1`} className="underline">
            save PDF
          </a>
        </p>
      )}
      <InwardFields
        options={options}
        values={cleared && !state.values ? defaults : values}
      />
      <div className="flex flex-wrap gap-3">
        <SubmitButton>Save to register</SubmitButton>
        <SubmitButton name="after" value="print" variant="secondary">
          Save + print slip
        </SubmitButton>
        <SubmitButton name="after" value="pdf" variant="secondary">
          Save + PDF slip
        </SubmitButton>
        <button
          type="button"
          onClick={clear}
          className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          Clear form
        </button>
      </div>
      <p className="text-xs text-neutral-500">* required.</p>
    </form>
  );
}
