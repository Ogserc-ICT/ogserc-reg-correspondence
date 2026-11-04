"use client";
// Front Desk form (SPEC-v2 C3.1). No acknowledgement is issued here.
import { useActionState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import {
  DateTimeInput,
  Select,
  TextArea,
  TextInput,
} from "@/app/_components/inputs";
import { FormSection, Wide } from "@/app/_components/ui/form-section";
import type { Option } from "@/server/read/options";
import { logIntakeAction } from "./actions";

export function IntakeForm({
  modes,
  types,
  defaults,
}: {
  modes: Option[];
  types: Option[];
  defaults: Record<string, string>;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    logIntakeAction,
    {},
  );
  const values = state.values ?? defaults;
  const v = (k: string) => values[k] ?? "";
  return (
    <form
      key={`${state.message ?? ""}-${state.attempt ?? ""}`}
      action={action}
      className="space-y-5"
    >
      <Messages state={state} />
      <FormSection title="Document received">
        <DateTimeInput
          dateName="receivedDate"
          timeName="receivedTime"
          label="Date & time received"
          hint="Lagos time"
          required
          defaultDate={v("receivedDate")}
          defaultTime={v("receivedTime")}
        />
        <Select
          name="modeId"
          label="Mode of receipt"
          required
          options={modes}
          defaultValue={v("modeId")}
        />
        <TextInput
          name="sender"
          label="Sender"
          required
          defaultValue={v("sender")}
        />
        <Select
          name="typeId"
          label="Type (if known)"
          options={types}
          defaultValue={v("typeId")}
        />
        <Wide>
          <TextInput
            name="subject"
            label="Subject"
            required
            defaultValue={v("subject")}
          />
        </Wide>
        <TextInput
          name="deliveredBy"
          label="Delivered by"
          defaultValue={v("deliveredBy")}
        />
        <TextInput
          name="phone"
          type="tel"
          label="Phone"
          defaultValue={v("phone")}
        />
        <TextInput
          name="volumes"
          type="number"
          label="Files / volumes"
          defaultValue={v("volumes")}
        />
        <Wide>
          <TextArea
            name="remarks"
            label="Remarks"
            rows={2}
            defaultValue={v("remarks")}
          />
        </Wide>
      </FormSection>
      <div className="flex justify-end">
        <SubmitButton>Save to front desk log</SubmitButton>
      </div>
    </form>
  );
}
