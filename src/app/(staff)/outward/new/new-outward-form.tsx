"use client";
import { useActionState, useState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import type { FormOptions } from "@/server/read/options";
import { logOutwardAction } from "../actions";
import { OutwardFields } from "../outward-fields";

export function NewOutwardForm({
  options,
  defaults,
}: {
  options: FormOptions;
  defaults: Record<string, string>;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    logOutwardAction,
    {},
  );
  const [cleared, setCleared] = useState(0);
  const [dirty, setDirty] = useState(false);
  const key = `${state.message ?? ""}-${state.attempt ?? ""}-${cleared}`;
  const values =
    cleared && !state.values ? defaults : (state.values ?? defaults);

  return (
    <>
      {state.ok && state.link && (
        // Log before signature, then quote the number (SPEC §5.1).
        <div
          role="status"
          className="border-brand-green mb-6 rounded border-2 bg-green-50 p-4"
        >
          <p className="text-sm text-neutral-700">Outward number</p>
          <p className="font-mono text-3xl font-semibold">{state.link.label}</p>
          <p className="mt-1 text-sm">
            Quote it on the document.{" "}
            <a href={state.link.href} className="underline">
              Open the record
            </a>
          </p>
        </div>
      )}
      <form
        key={key}
        action={(fd) => {
          setDirty(false);
          return action(fd);
        }}
        onInput={() => setDirty(true)}
        className="space-y-5"
      >
        {!state.ok && <Messages state={state} />}
        <OutwardFields options={options} values={values} />
        <div className="flex flex-wrap gap-3">
          <SubmitButton>Save &amp; get number</SubmitButton>
          <button
            type="button"
            onClick={() => {
              if (
                dirty &&
                !window.confirm("Clear the form? What you typed will be lost.")
              )
                return;
              setDirty(false);
              setCleared((n) => n + 1);
            }}
            className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Clear form
          </button>
        </div>
        <p className="text-xs text-neutral-500">* required.</p>
      </form>
    </>
  );
}
