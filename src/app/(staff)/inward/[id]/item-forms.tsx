"use client";
import { useActionState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { Select, TextArea, TextInput } from "@/app/_components/inputs";
import { Picker } from "@/app/_components/picker";
import type { FormOptions } from "@/server/read/options";
import { searchFilesAction } from "../../search-actions";
import {
  closeTodayAction,
  editInwardAction,
  forwardTodayAction,
  updateInwardAction,
  voidInwardAction,
} from "../actions";
import { InwardFields, type Values } from "../inward-fields";

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
    () => forwardTodayAction(id),
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
  return (
    <div className="space-y-3">
      <Messages state={fwd} />
      <Messages state={cls} />
      <Messages state={vd} />
      <div className="flex flex-wrap items-start gap-3">
        {canForward && (
          <form action={forward}>
            <SubmitButton>Forwarded today</SubmitButton>
          </form>
        )}
        {canClose && (
          <details className="rounded-control border-border w-full border px-4 py-2.5 text-sm">
            <summary className="text-text-muted hover:text-text cursor-pointer text-center font-medium">
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
          <details className="rounded-control border-overdue/40 border px-4 py-2.5 text-sm">
            <summary className="text-overdue cursor-pointer font-medium">
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
              className="mt-2 w-80 space-y-2"
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

/** Update Item: the handling fields (SPEC §4.1). */
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
  const v = state.values ?? values;
  const val = (k: string) => v[k] ?? "";
  return (
    <form
      key={state.ok ? state.message : (state.attempt ?? "edit")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          name="unitOverrideId"
          label="Forward to (override)"
          hint="Only to override the type's unit."
          options={options.units}
          defaultValue={val("unitOverrideId")}
        />
        <TextInput
          name="actionOfficer"
          label="Action officer"
          defaultValue={val("actionOfficer")}
        />
        <Select
          name="priorityId"
          label="Priority"
          blank="Normal"
          options={options.priorities.filter((p) => p.key !== "NORMAL")}
          defaultValue={val("priorityId")}
        />
        <TextInput
          name="responseDueOverride"
          type="date"
          label="Response due (override)"
          hint="Use when the sender sets a deadline."
          defaultValue={val("responseDueOverride")}
        />
        <Select
          name="ackIssuedViaId"
          label="Acknowledgement issued via"
          required
          options={options.ackVia}
          defaultValue={val("ackIssuedViaId")}
        />
        <Picker
          name="fileId"
          label="File"
          search={searchFilesAction}
          defaultId={v.fileId || undefined}
          defaultLabel={v.fileIdLabel}
        />
        <TextInput
          name="dateClosedManual"
          type="date"
          label="Date closed (without letter)"
          defaultValue={val("dateClosedManual")}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <TextArea
            name="closingNote"
            label="Closing note"
            defaultValue={val("closingNote")}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
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
      <p className="text-sm text-neutral-600">
        The number never changes. A new receipt time or mode recalculates the
        deemed receipt date; a new type takes that type&apos;s current rules.
      </p>
      <InwardFields options={options} values={state.values ?? values} />
      <TextArea name="reason" label="Reason for the change" required />
      <SubmitButton>Save registered details</SubmitButton>
    </form>
  );
}
