"use client";
import { useActionState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { Select, TextArea, TextInput, YesNo } from "@/app/_components/inputs";
import type { FormOptions } from "@/server/read/options";
import {
  deliverTodayAction,
  dispatchTodayAction,
  editOutwardAction,
  updateOutwardAction,
  voidOutwardAction,
} from "../actions";
import { OutwardFields, type Values } from "../outward-fields";

export function OutwardActions({
  id,
  number,
  canDispatch,
  canDeliver,
  canVoid,
}: {
  id: string;
  number: string;
  canDispatch: boolean;
  canDeliver: boolean;
  canVoid: boolean;
}) {
  const [ds, dispatch] = useActionState<FormState, FormData>(
    () => dispatchTodayAction(id),
    {},
  );
  const [dl, deliver] = useActionState<FormState, FormData>(
    () => deliverTodayAction(id),
    {},
  );
  const [vd, voidIt] = useActionState<FormState, FormData>(
    voidOutwardAction.bind(null, id),
    {},
  );
  return (
    <div className="space-y-3">
      <Messages state={ds} />
      <Messages state={dl} />
      <Messages state={vd} />
      <div className="flex flex-wrap items-start gap-3">
        {canDispatch && (
          <form action={dispatch}>
            <SubmitButton>Dispatched today</SubmitButton>
          </form>
        )}
        {canDeliver && (
          <form action={deliver}>
            <SubmitButton variant="secondary">Delivered today</SubmitButton>
          </form>
        )}
        {canVoid && (
          <details className="rounded border border-red-300 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-red-800">
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

/** Update Item: dispatch, delivery and response fields (SPEC §5.1). */
export function UpdateOutwardForm({
  id,
  options,
  values,
}: {
  id: string;
  options: FormOptions;
  values: Values;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateOutwardAction.bind(null, id),
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
          name="dateDispatched"
          type="date"
          label="Date dispatched"
          defaultValue={val("dateDispatched")}
        />
        <Select
          name="dispatchedById"
          label="Dispatched by"
          hint="Cleared if there is no dispatch date."
          options={options.registryUsers}
          defaultValue={val("dispatchedById")}
        />
        <TextInput
          name="trackingRef"
          label="Tracking ref."
          defaultValue={val("trackingRef")}
        />
        <YesNo
          name="deliveryConfirmed"
          label="Delivery confirmed"
          defaultValue={val("deliveryConfirmed")}
        />
        <TextInput
          name="dateDelivered"
          type="date"
          label="Date delivered"
          defaultValue={val("dateDelivered")}
        />
        <TextInput
          name="receivedByRecipient"
          label="Received by (recipient)"
          defaultValue={val("receivedByRecipient")}
        />
        <YesNo
          name="responseExpectedOverride"
          label="Response expected"
          blankLabel="Type default"
          defaultValue={val("responseExpectedOverride")}
        />
        <TextInput
          name="responseDueOverride"
          type="date"
          label="Response due (override)"
          defaultValue={val("responseDueOverride")}
        />
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
export function EditOutwardForm({
  id,
  options,
  values,
}: {
  id: string;
  options: FormOptions;
  values: Values;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    editOutwardAction.bind(null, id),
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
        The number never changes. A new document type takes that type&apos;s
        current rules.
      </p>
      <OutwardFields options={options} values={state.values ?? values} />
      <TextArea name="reason" label="Reason for the change" required />
      <SubmitButton>Save registered details</SubmitButton>
    </form>
  );
}
