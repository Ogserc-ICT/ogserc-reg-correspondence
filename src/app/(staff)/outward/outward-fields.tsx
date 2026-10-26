"use client";
// The New Outward fields (SPEC §5.1). Also used by the Head of Registry's
// "edit registered details".
import type { ReactNode } from "react";
import { Field, inputClass } from "@/app/_components/form";
import { Select, TextArea, TextInput, YesNo } from "@/app/_components/inputs";
import { Picker } from "@/app/_components/picker";
import type { FormOptions } from "@/server/read/options";
import { searchFilesAction, searchInwardAction } from "../search-actions";

export type Values = Record<string, string | undefined>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded border border-neutral-200 p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

export function OutwardFields({
  options,
  values,
  dispatch = true,
}: {
  options: FormOptions;
  values: Values;
  dispatch?: boolean;
}) {
  const v = (k: string) => values[k] ?? "";
  return (
    <div className="space-y-5">
      <Section title="Document">
        <TextInput
          name="documentDate"
          type="date"
          label="Date of document"
          required
          defaultValue={v("documentDate")}
        />
        <Select
          name="typeId"
          label="Document type"
          required
          options={options.outgoingTypes}
          defaultValue={v("typeId")}
        />
        <Select
          name="originatingUnitId"
          label="Originating unit"
          required
          options={options.units}
          defaultValue={v("originatingUnitId")}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <TextInput
            name="subject"
            label="Subject"
            required
            defaultValue={v("subject")}
          />
        </div>
        <TextInput
          name="addressee"
          label="Addressee"
          required
          defaultValue={v("addressee")}
        />
        <Select
          name="recipientCategoryId"
          label="Recipient category"
          required
          options={options.partyCategories}
          defaultValue={v("recipientCategoryId")}
        />
        <TextInput
          name="recipientContact"
          label="Address / email"
          defaultValue={v("recipientContact")}
        />
        <Picker
          name="inReplyToInwardId"
          label="In reply to"
          hint="The inward item this answers. Check the sender shown matches."
          search={searchInwardAction}
          defaultId={values.inReplyToInwardId || undefined}
          defaultLabel={values.inReplyToInwardIdLabel}
        />
        <TextInput
          name="relatedOgsercNo"
          label="Related OGSERC No."
          hint="Registration / licence no."
          defaultValue={v("relatedOgsercNo")}
        />
        <Picker
          name="fileId"
          label="File"
          search={searchFilesAction}
          defaultId={values.fileId || undefined}
          defaultLabel={values.fileIdLabel}
        />
        <TextInput
          name="preparedBy"
          label="Prepared by"
          defaultValue={v("preparedBy")}
        />
      </Section>

      <Section title="Signature">
        <Select
          name="signedById"
          label="Signed by"
          required
          options={options.signatories}
          defaultValue={v("signedById")}
        />
        <Field
          label="Signatory's designation *"
          hint="Filled in from the signatory if left blank."
        >
          <input
            name="signatoryDesignation"
            defaultValue={v("signatoryDesignation")}
            className={inputClass}
          />
        </Field>
      </Section>

      {dispatch && (
        <Section title="Dispatch">
          <Select
            name="dispatchModeId"
            label="Dispatch mode"
            required
            options={options.receiptModes}
            defaultValue={v("dispatchModeId")}
          />
          <TextInput
            name="dateDispatched"
            type="date"
            label="Date dispatched"
            hint="Leave blank if not yet sent."
            defaultValue={v("dateDispatched")}
          />
          <Select
            name="dispatchedById"
            label="Dispatched by"
            hint="Cleared if there is no dispatch date."
            options={options.registryUsers}
            defaultValue={v("dispatchedById")}
          />
          <TextInput
            name="trackingRef"
            label="Tracking ref."
            defaultValue={v("trackingRef")}
          />
          <YesNo
            name="responseExpectedOverride"
            label="Response expected"
            blankLabel="Type default"
            defaultValue={v("responseExpectedOverride")}
          />
          <TextInput
            name="responseDueOverride"
            type="date"
            label="Response due (override)"
            defaultValue={v("responseDueOverride")}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <TextArea
              name="remarks"
              label="Remarks"
              defaultValue={v("remarks")}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
