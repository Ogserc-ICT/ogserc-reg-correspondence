"use client";
import { useActionState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { Select, TextArea, TextInput } from "@/app/_components/inputs";
import { buttonClass } from "@/app/_components/ui/button";
import type { FormOptions } from "@/server/read/options";
import {
  closeTodayAction,
  editInwardAction,
  forwardTodayAction,
  updateInwardAction,
  voidInwardAction,
} from "../actions";
import { InwardFields, type Values } from "../inward-fields";

/**
 * Forwarding an item that has not been routed (SPEC-v2 C5.4): the server
 * asks first; "Forward anyway" resends exactly what it was given, plus the
 * officer's yes. The item is then flagged "Forwarded before routing".
 */
function ConfirmForward({
  id,
  state,
  action,
}: {
  id: string;
  state: FormState;
  action: (fd: FormData) => void;
}) {
  return (
    <form
      action={action}
      role="alertdialog"
      aria-label="Confirm forwarding"
      className="rounded-card border-awaiting/40 bg-status-awaiting border p-4 text-sm"
    >
      {Object.entries(state.values ?? {})
        .filter(([k]) => k !== "confirmForwardBeforeRouting")
        .map(([k, value]) => (
          <input key={k} type="hidden" name={k} value={value} />
        ))}
      <input type="hidden" name="confirmForwardBeforeRouting" value="1" />
      <p className="font-medium">{state.confirm}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <SubmitButton>Forward anyway</SubmitButton>
        <a href={`/inward/${id}`} className={buttonClass()}>
          Cancel
        </a>
      </div>
    </form>
  );
}

export function InwardActions({
  id,
  number,
  canForward,
  canClose,
  canVoid,
}: {
  id: string;
  number: string;
  canForward: boolean;
  canClose: boolean;
  canVoid: boolean;
}) {
  const [fwd, forward] = useActionState<FormState, FormData>(
    forwardTodayAction.bind(null, id),
    {},
  );
  const [cls, close] = useActionState<FormState, FormData>(
    closeTodayAction.bind(null, id),
    {},
  );
  const [vd, voidIt] = useActionState<FormState, FormData>(
    voidInwardAction.bind(null, id),
    {},
  );
  if (fwd.confirm)
    return <ConfirmForward id={id} state={fwd} action={forward} />;
  if (cls.confirm) return <ConfirmForward id={id} state={cls} action={close} />;
  return (
    <div className="space-y-3">
      <Messages state={fwd} />
      <Messages state={cls} />
      <Messages state={vd} />
      <div className="flex flex-col gap-3">
        {canForward && (
          <form action={forward} className="[&>button]:w-full">
            <SubmitButton>Forwarded today</SubmitButton>
          </form>
        )}
        {canClose && (
          <details className="rounded-control border-border w-full border px-4 py-2.5 text-sm">
            <summary className="text-text-muted hover:text-text cursor-pointer list-none text-center font-medium">
              Close today…
            </summary>
            <form
              action={close}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    `Close ${number} today without an outgoing letter?`,
                  )
                )
                  e.preventDefault();
              }}
              className="mt-3 space-y-3"
            >
              <TextArea
                name="closingNote"
                label="Closing note"
                hint="Why it is closed without a letter."
                required
              />
              <SubmitButton variant="secondary">Close today</SubmitButton>
            </form>
          </details>
        )}
        {canVoid && (
          <details className="rounded-control border-overdue/40 w-full border px-4 py-2.5 text-sm">
            <summary className="text-overdue cursor-pointer list-none text-center font-medium">
              Void…
            </summary>
            <form
              action={voidIt}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    `Void ${number}? It stays on the register, and its number is never used again.`,
                  )
                )
                  e.preventDefault();
              }}
              className="mt-3 space-y-3"
            >
              <TextArea name="voidReason" label="Reason" required />
              <SubmitButton variant="secondary">Void this item</SubmitButton>
            </form>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Update Item: the handling fields, reduced by SPEC-v2 C5.4. Unit, file,
 * action, priority, action officer and due override are on the Routing Desk.
 */
export function UpdateInwardForm({
  id,
  options,
  values,
}: {
  id: string;
  options: FormOptions;
  values: Values;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateInwardAction.bind(null, id),
    {},
  );
  if (state.confirm)
    return <ConfirmForward id={id} state={state} action={action} />;
  const v = state.values ?? values;
  const val = (k: string) => v[k] ?? "";
  return (
    <form
      key={state.ok ? state.message : (state.attempt ?? "edit")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <TextInput
          name="dateForwarded"
          type="date"
          label="Date forwarded"
          defaultValue={val("dateForwarded")}
        />
        <TextInput
          name="receivedByUnitOfficer"
          label="Received in unit by"
          defaultValue={val("receivedByUnitOfficer")}
        />
        <Select
          name="ackIssuedViaId"
          label="Acknowledgement issued via"
          required
          options={options.ackVia}
          defaultValue={val("ackIssuedViaId")}
        />
        <TextInput
          name="dateClosedManual"
          type="date"
          label="Date closed (without letter)"
          defaultValue={val("dateClosedManual")}
        />
        <div className="sm:col-span-2">
          <TextArea
            name="closingNote"
            label="Closing note"
            defaultValue={val("closingNote")}
          />
        </div>
        <div className="sm:col-span-2">
          <TextArea
            name="remarks"
            label="Remarks"
            defaultValue={val("remarks")}
          />
        </div>
      </div>
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

/** Head of Registry only: change registered details, with a reason. */
export function EditInwardForm({
  id,
  options,
  values,
}: {
  id: string;
  options: FormOptions;
  values: Values;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    editInwardAction.bind(null, id),
    {},
  );
  return (
    <form
      key={state.ok ? state.message : (state.attempt ?? "full")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <p className="text-text-muted text-sm">
        The number never changes. A new receipt time or mode recalculates the
        deemed receipt date; a new type takes that type&apos;s current rules.
        Routing is changed on the Routing Desk.
      </p>
      <InwardFields options={options} values={state.values ?? values} />
      <TextArea name="reason" label="Reason for the change" required />
      <SubmitButton>Save registered details</SubmitButton>
    </form>
  );
}
