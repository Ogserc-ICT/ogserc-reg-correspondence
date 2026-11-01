"use client";
import { useActionState, useState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { buttonClass } from "@/app/_components/ui/button";
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
  const issued = state.ok && state.link ? state.link : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        key={key}
        action={(fd) => {
          setDirty(false);
          return action(fd);
        }}
        onInput={() => setDirty(true)}
        className="min-w-0 space-y-5"
      >
        {!state.ok && <Messages state={state} />}
        <OutwardFields options={options} values={values} />
        <div className="flex flex-wrap justify-end gap-3">
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
            className={buttonClass()}
          >
            Clear form
          </button>
          <SubmitButton>Save &amp; get number</SubmitButton>
        </div>
      </form>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        {/* Log before signature, then quote the number (SPEC §5.1). */}
        <section
          role="status"
          className={`rounded-panel border p-[22px] ${
            issued
              ? "border-accent/50 bg-status-closed"
              : "border-border bg-surface"
          }`}
        >
          <h2 className="text-text-faint text-xs font-semibold tracking-wider uppercase">
            Outward number
          </h2>
          {issued ? (
            <>
              <p className="mt-3 font-mono text-xl font-semibold break-all">
                {issued.label}
              </p>
              <p className="text-text-muted mt-2 text-sm">
                Quote it on the document before it is signed.
              </p>
              <a
                href={issued.href}
                className={buttonClass("secondary", "mt-4 w-full")}
              >
                Open the record
              </a>
            </>
          ) : (
            <>
              <p className="text-text-muted mt-3 font-mono text-xl font-semibold">
                OGSERC/OUT/…
              </p>
              <p className="text-text-muted mt-2 text-sm">
                Issued when you save. Log the letter before it is signed, then
                quote the number on it.
              </p>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
