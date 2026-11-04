"use client";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Field,
  inputClass,
  Messages,
  SubmitButton,
  type FormState,
} from "@/app/_components/form";
import { TextInput } from "@/app/_components/inputs";
import { buttonClass } from "@/app/_components/ui/button";
import { FormSection, Wide } from "@/app/_components/ui/form-section";
import { REPLACE_FORM_PROMPT } from "@/domain/front-desk";
import type { InwardPreview } from "@/server/read/inward-preview";
import type { FormOptions } from "@/server/read/options";
import { pullIntakeAction } from "../../front-desk/actions";
import { logInwardAction, previewInwardAction } from "../actions";
import { InwardFields } from "../inward-fields";
import { InwardPreviewCard } from "./inward-preview-card";

function rawOf(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new FormData(form))
    if (typeof v === "string") out[k] = v;
  return out;
}

export type IntakeChoice = { id: string; label: string };

export function NewInwardForm({
  options,
  defaults,
  intakes,
  initial,
  initialError,
}: {
  options: FormOptions;
  defaults: Record<string, string>;
  /** The "Awaiting registry" list; absent for users who can't pull. */
  intakes?: IntakeChoice[];
  /** Opened from the Front Desk's "Register" link: already pulled. */
  initial?: Record<string, string>;
  initialError?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    logInwardAction,
    {},
  );
  // Values set here (pull, clear) win until the next save or error.
  const [override, setOverride] = useState<{
    values: Record<string, string>;
    n: number;
  } | null>(initial ? { values: initial, n: 0 } : null);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setOverride(null);
  }
  const [dirty, setDirty] = useState(false);
  const [pullError, setPullError] = useState(initialError ?? null);
  const [pulling, setPulling] = useState(false);
  const [choice, setChoice] = useState("");
  // After a save: fresh defaults. After an error: what was typed.
  const values = override?.values ?? state.values ?? defaults;
  const key = `${state.message ?? ""}-${state.attempt ?? ""}-${override?.n ?? ""}`;
  const replace = (v: Record<string, string>) =>
    setOverride((o) => ({ values: v, n: (o?.n ?? 0) + 1 }));

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
    setPullError(null);
    replace(defaults);
  }

  // Pull into New Inward (SPEC-v2 C3.2): non-blank intake details only.
  async function pull() {
    if (!choice) return;
    if (dirty && !window.confirm(REPLACE_FORM_PROMPT)) return;
    setPulling(true);
    try {
      const r = await pullIntakeAction(choice);
      if (!r.ok) {
        setPullError(r.error);
        return;
      }
      setPullError(null);
      setDirty(false);
      setChoice("");
      replace({
        ...defaults,
        ...r.values,
        frontDeskIntakeId: choice,
        frontDeskIntakeNo: r.intakeNo,
      });
    } finally {
      setPulling(false);
    }
  }

  /** Keeps what is typed but no longer registers the intake. */
  function unlink() {
    if (!form.current) return;
    const rest = rawOf(form.current);
    delete rest.frontDeskIntakeId;
    delete rest.frontDeskIntakeNo;
    delete rest.receiptChangeReason;
    replace(rest);
  }

  const linked = values.frontDeskIntakeId
    ? { id: values.frontDeskIntakeId, no: values.frontDeskIntakeNo ?? "" }
    : null;

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

        {intakes && (
          <FormSection title="Front desk intake">
            <input
              type="hidden"
              name="frontDeskIntakeId"
              value={linked?.id ?? ""}
            />
            <input
              type="hidden"
              name="frontDeskIntakeNo"
              value={linked?.no ?? ""}
            />
            {linked ? (
              <>
                {/* Not a <label>: it holds a button. */}
                <div className="block text-sm">
                  <span className="text-text-muted">Registering</span>
                  <span className="mt-2 flex min-h-11 items-center gap-3">
                    <span className="font-mono text-sm">{linked.no}</span>
                    <button
                      type="button"
                      onClick={unlink}
                      className="text-accent rounded text-sm hover:underline"
                    >
                      Remove
                    </button>
                  </span>
                  <span className="text-text-faint mt-1.5 block text-xs">
                    The front desk&apos;s receipt time is kept: it drives the
                    para 10(3) deemed receipt date.
                  </span>
                </div>
                <Wide>
                  <TextInput
                    name="receiptChangeReason"
                    label="Reason for changing the front desk receipt time or mode"
                    hint="Only if you change either of them. The change is recorded."
                    defaultValue={values.receiptChangeReason ?? ""}
                  />
                </Wide>
              </>
            ) : (
              <Wide>
                <Field
                  label="Awaiting registry"
                  hint={
                    intakes.length
                      ? "Pick a document logged at the front desk to fill in its details."
                      : "Nothing is waiting at the front desk."
                  }
                >
                  <span className="flex gap-3">
                    <select
                      aria-label="Front desk intake"
                      value={choice}
                      onChange={(e) => setChoice(e.target.value)}
                      disabled={!intakes.length}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {intakes.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={pull}
                      disabled={!choice || pulling}
                      className={buttonClass()}
                    >
                      Pull details
                    </button>
                  </span>
                </Field>
              </Wide>
            )}
            {pullError && (
              <Wide>
                <p role="alert" className="text-overdue text-sm">
                  {pullError}
                </p>
              </Wide>
            )}
          </FormSection>
        )}

        <InwardFields options={options} values={values} />
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
