"use client";
// Buttons for "Emails to review" (SPEC-v2 C6.3) and RESEND ACK EMAIL (C6.1).
import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { buttonClass } from "@/app/_components/ui/button";
import {
  discardReviewedAction,
  resendAckEmailAction,
  sendReviewedAction,
} from "./actions";

/** Outcomes of Send / Discard, kept above the list: the row itself goes. */
const Report = createContext<(s: FormState) => void>(() => {});

export function ReviewArea({ children }: { children: ReactNode }) {
  const [outcomes, setOutcomes] = useState<FormState[]>([]);
  const report = useCallback(
    (s: FormState) => setOutcomes((list) => [...list, s]),
    [],
  );
  return (
    <Report.Provider value={report}>
      {outcomes.length > 0 && (
        <div className="px-[22px]">
          {outcomes.map((s, i) => (
            <Messages key={i} state={s} />
          ))}
        </div>
      )}
      {children}
    </Report.Provider>
  );
}

export function ReviewButtons({ id }: { id: string }) {
  const report = useContext(Report);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FormState>) =>
    start(async () => report(await fn()));
  return (
    <div className="flex flex-wrap items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => sendReviewedAction(id))}
        className={buttonClass("primary")}
      >
        Send
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Discard this email? It will not be sent."))
            run(() => discardReviewedAction(id));
        }}
        className={buttonClass()}
      >
        Discard
      </button>
    </div>
  );
}

export function ResendButton({ itemId }: { itemId: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    resendAckEmailAction.bind(null, itemId),
    {},
  );
  if (state.confirm)
    return (
      <form
        action={action}
        role="alertdialog"
        aria-label="Confirm resend"
        className="rounded-card border-awaiting/40 bg-status-awaiting border p-4 text-sm"
      >
        <input type="hidden" name="confirmResend" value="1" />
        <p className="font-medium">{state.confirm}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <SubmitButton>Send again</SubmitButton>
          <a
            href={`/inward/${itemId}`}
            className="text-accent self-center text-sm hover:underline"
          >
            Cancel
          </a>
        </div>
      </form>
    );
  return (
    <div className="space-y-2">
      <Messages state={state} />
      <form action={action} className="[&>button]:w-full">
        <SubmitButton variant="secondary">Resend ack email</SubmitButton>
      </form>
    </div>
  );
}
