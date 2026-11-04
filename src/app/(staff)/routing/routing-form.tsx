"use client";
// Routing Desk form (SPEC-v2 C5.2): the six routing fields. Saving replaces
// all six, records a routing history entry and recalculates the item.
import { useActionState } from "react";
import {
  inputClass,
  Messages,
  SubmitButton,
  type FormState,
} from "@/app/_components/form";
import { Select, TextInput } from "@/app/_components/inputs";
import { Picker } from "@/app/_components/picker";
import { Wide } from "@/app/_components/ui/form-section";
import type { Option } from "@/server/read/options";
import { routeInwardAction, searchRoutingFilesAction } from "./actions";

export function RoutingForm({
  id,
  values,
  units,
  actions,
  priorities,
  askPassword,
}: {
  id: string;
  values: Record<string, string>;
  units: Option[];
  actions: Option[];
  /** Without Normal: blank means Normal. */
  priorities: Option[];
  /** Q-V2-3: re-enter the password to save. */
  askPassword: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    routeInwardAction.bind(null, id),
    {},
  );
  // After a save the page reloads the item; after an error, what was typed.
  const v = state.ok ? values : (state.values ?? values);
  const val = (k: string) => v[k] ?? "";
  return (
    <form
      key={state.ok ? state.message : (state.attempt ?? "route")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <Select
          name="unitOverrideId"
          label="Unit (override)"
          hint="Only to send it somewhere other than the type's unit."
          blank="The type's unit"
          options={units}
          defaultValue={val("unitOverrideId")}
        />
        <Picker
          name="fileId"
          label="File reference"
          search={searchRoutingFilesAction}
          defaultId={v.fileId || undefined}
          defaultLabel={v.fileIdLabel}
        />
        <Select
          name="actionRequiredId"
          label="Action required"
          required
          options={actions}
          defaultValue={val("actionRequiredId")}
        />
        <Select
          name="priorityId"
          label="Priority"
          blank="Normal"
          options={priorities}
          defaultValue={val("priorityId")}
        />
        <TextInput
          name="actionOfficer"
          label="Action officer"
          defaultValue={val("actionOfficer")}
        />
        <TextInput
          name="responseDueOverride"
          type="date"
          label="Response due (override)"
          hint="Use when the sender sets a deadline."
          defaultValue={val("responseDueOverride")}
        />
        {askPassword && (
          <Wide>
            <label className="block text-sm">
              <span className="text-text-muted">Your password *</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                className={`${inputClass} mt-2`}
              />
            </label>
          </Wide>
        )}
      </div>
      <SubmitButton>Save routing</SubmitButton>
    </form>
  );
}
