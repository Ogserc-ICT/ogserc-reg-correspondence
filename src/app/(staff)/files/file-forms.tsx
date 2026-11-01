"use client";
// New file, Update file, Issue and Record return (SPEC §6, §7).
import { useActionState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { buttonClass } from "@/app/_components/ui/button";
import { Select, TextArea, TextInput } from "@/app/_components/inputs";
import type { FormOptions } from "@/server/read/options";
import {
  createFileAction,
  issueFileAction,
  returnFileAction,
  updateFileAction,
} from "./actions";

type Values = Record<string, string | undefined>;

function FileFields({
  options,
  values,
  isNew,
}: {
  options: FormOptions;
  values: Values;
  isNew: boolean;
}) {
  const v = (k: string) => values[k] ?? "";
  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      {isNew && (
        <TextInput
          name="reference"
          label="File reference"
          hint="Must be new, e.g. OGSERC/RL/002."
          required
          defaultValue={v("reference")}
        />
      )}
      <div className={isNew ? "" : "sm:col-span-2"}>
        <TextInput
          name="title"
          label="Title"
          required
          defaultValue={v("title")}
        />
      </div>
      <Select
        name="fileClassId"
        label="File class"
        options={options.fileClasses}
        defaultValue={v("fileClassId")}
      />
      <Select
        name="owningUnitId"
        label="Owning unit"
        options={options.units}
        defaultValue={v("owningUnitId")}
      />
      <Select
        name="securityId"
        label="Security"
        required
        options={options.fileSecurity}
        defaultValue={v("securityId")}
      />
      <TextInput
        name="dateOpened"
        type="date"
        label="Date opened"
        required
        defaultValue={v("dateOpened")}
      />
      <TextInput
        name="currentVolume"
        type="number"
        label="Current volume"
        defaultValue={v("currentVolume")}
      />
      <Select
        name="fileStatusId"
        label="File status"
        required
        options={options.fileStatuses}
        defaultValue={v("fileStatusId")}
      />
      <TextInput
        name="dateClosedOrArchived"
        type="date"
        label="Date closed / archived"
        hint="Required once the file is closed or archived."
        defaultValue={v("dateClosedOrArchived")}
      />
      <div className="sm:col-span-2">
        <TextArea name="remarks" label="Remarks" defaultValue={v("remarks")} />
      </div>
    </div>
  );
}

export function NewFileForm({
  options,
  defaults,
}: {
  options: FormOptions;
  defaults: Values;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    createFileAction,
    {},
  );
  return (
    <form
      key={state.ok ? state.message : (state.attempt ?? "new")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <FileFields
        options={options}
        values={state.ok ? defaults : (state.values ?? defaults)}
        isNew
      />
      <SubmitButton>Add to File Index</SubmitButton>
    </form>
  );
}

export function UpdateFileForm({
  id,
  options,
  values,
}: {
  id: string;
  options: FormOptions;
  values: Values;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateFileAction.bind(null, id),
    {},
  );
  return (
    <form
      key={state.ok ? state.message : (state.attempt ?? "edit")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <FileFields
        options={options}
        values={state.ok ? values : (state.values ?? values)}
        isNew={false}
      />
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

/**
 * ISSUE FILE. When the file is still out the server asks first; "Issue
 * anyway" sends the same details again with confirmStillOut=1.
 */
export function IssueFileForm({
  id,
  options,
}: {
  id: string;
  options: FormOptions;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    issueFileAction.bind(null, id),
    {},
  );
  const v = state.values ?? {};
  if (state.confirm)
    return (
      // Resends exactly what the server was given, plus the officer's yes.
      <form
        action={action}
        role="alertdialog"
        aria-label="Confirm issue"
        className="rounded-card border-awaiting/40 bg-status-awaiting border p-4 text-sm"
      >
        {Object.entries(v)
          .filter(([k]) => k !== "confirmStillOut")
          .map(([k, value]) => (
            <input key={k} type="hidden" name={k} value={value} />
          ))}
        <input type="hidden" name="confirmStillOut" value="1" />
        <p className="font-medium">{state.confirm}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <SubmitButton>Issue anyway</SubmitButton>
          <a href={`/files/${id}`} className={buttonClass()}>
            Cancel
          </a>
        </div>
      </form>
    );
  return (
    <form
      key={state.ok ? state.message : (state.attempt ?? "issue")}
      action={action}
      className="space-y-4"
    >
      <Messages state={state} />
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-1">
        <TextInput
          name="issuedTo"
          label="Issued to"
          required
          hint="Name or position, e.g. PA to Chairman."
          defaultValue={v.issuedTo}
        />
        <Select
          name="issuedToUserId"
          label="…or a staff member"
          options={options.staff}
          defaultValue={v.issuedToUserId}
        />
        <Select
          name="unitId"
          label="Unit"
          options={options.units}
          defaultValue={v.unitId}
        />
        <TextInput name="purpose" label="Purpose" defaultValue={v.purpose} />
        <TextInput
          name="volume"
          type="number"
          label="Volume"
          hint="Blank = current volume."
          defaultValue={v.volume}
        />
        <TextInput
          name="returnByOverride"
          type="date"
          label="Return by (override)"
          defaultValue={v.returnByOverride}
        />
      </div>
      <SubmitButton>Issue file</SubmitButton>
    </form>
  );
}

/** RECORD RETURN; stays mounted after the return so its message is kept. */
export function ReturnFileForm({
  id,
  reference,
  holder,
}: {
  id: string;
  reference: string;
  holder: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    returnFileAction.bind(null, id),
    {},
  );
  return (
    <div className="space-y-3">
      <Messages state={state} />
      {holder ? (
        <form
          action={action}
          className="space-y-4 [&>button]:h-auto [&>button]:min-h-11 [&>button]:w-full [&>button]:py-2.5 [&>button]:text-center [&>button]:whitespace-normal"
        >
          <TextInput
            name="dateReturned"
            type="date"
            label="Date returned"
            hint="Blank = today."
          />
          <SubmitButton>Record return from {holder}</SubmitButton>
        </form>
      ) : (
        <p className="text-text-muted text-sm">
          {reference} is with the Registry.
        </p>
      )}
    </div>
  );
}
