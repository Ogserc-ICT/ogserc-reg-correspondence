"use client";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { buttonClass } from "@/app/_components/ui/button";
import type { InwardPreview } from "@/server/read/inward-preview";
import type { FormOptions } from "@/server/read/options";
import { logInwardAction, previewInwardAction } from "../actions";
import { InwardFields } from "../inward-fields";
import { InwardPreviewCard } from "./inward-preview-card";

function rawOf(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new FormData(form))
    if (typeof v === "string") out[k] = v;
  return out;
}

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
  const key = `${state.message ?? ""}-${state.attempt ?? ""}-${cleared}`;

  // "Will be saved as": worked out again shortly after each change.
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<InwardPreview | null>(null);
  const [stale, setStale] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(0);
  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    // After React has applied the change (hidden date/time inputs).
    timer.current = setTimeout(async () => {
      if (!form.current) return;
      const n = ++latest.current;
      try {
        const p = await previewInwardAction(rawOf(form.current));
        if (n === latest.current) {
          setPreview(p);
          setStale(false);
        }
      } catch {
        if (n === latest.current) setStale(false);
      }
    }, 300);
  }, []);
  const refresh = () => {
    setStale(true);
    schedule();
  };
  useEffect(() => {
    schedule();
    return () => clearTimeout(timer.current);
  }, [key, schedule]);

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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        ref={form}
        key={key}
        action={(fd) => {
          setDirty(false);
          return action(fd);
        }}
        onInput={() => {
          setDirty(true);
          refresh();
        }}
        onChange={refresh}
        className="min-w-0 space-y-5"
      >
        <Messages state={state} />
        {slip && (
          <p className="text-text-muted -mt-2 text-sm">
            Slip:{" "}
            <a
              href={slip}
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              print
            </a>{" "}
            ·{" "}
            <a
              href={`${slip}?download=1`}
              className="text-accent hover:underline"
            >
              save PDF
            </a>
          </p>
        )}
        <InwardFields
          options={options}
          values={cleared && !state.values ? defaults : values}
        />
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={clear} className={buttonClass()}>
            Clear form
          </button>
          {/* First submit button: what Enter does. */}
          <SubmitButton variant="secondary">Save to register</SubmitButton>
          <SubmitButton name="after" value="pdf" variant="secondary">
            Save + PDF slip
          </SubmitButton>
          <SubmitButton name="after" value="print">
            Save + print slip
          </SubmitButton>
        </div>
      </form>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <InwardPreviewCard preview={preview} stale={stale} />
      </div>
    </div>
  );
}
