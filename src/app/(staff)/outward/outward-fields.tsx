"use client";
// The New Outward fields (SPEC §5.1): Document, Recipient, Signature and
// Dispatch, as on the New Inward screen. Also used by the Head of
// Registry's "edit registered details".
import { useRef } from "react";
import { Field, inputClass } from "@/app/_components/form";
import { Select, TextArea, TextInput, YesNo } from "@/app/_components/inputs";
import { Picker } from "@/app/_components/picker";
import {
  FoldSection,
  FormSection,
  Wide,
} from "@/app/_components/ui/form-section";
import type { FormOptions } from "@/server/read/options";
import { searchFilesAction, searchInwardAction } from "../search-actions";

export type Values = Record<string, string | undefined>;

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
  const has = (keys: string[]) => keys.some((k) => v(k));
  // SPEC-v2 C7: the designation fills in from the signatory chosen.
  const designation = useRef<HTMLInputElement>(null);
  const chooseSignatory = (id: string) => {
    const s = options.signatories.find((x) => x.id === id);
    if (designation.current) designation.current.value = s?.designation ?? "";
  };
  return (
    <div className="space-y-5">
      <FormSection title="Document">
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
        <Wide>
          <TextInput
            name="subject"
            label="Subject"
            required
            defaultValue={v("subject")}
          />
        </Wide>
        <Select
          name="originatingUnitId"
          label="Originating unit"
          required
          options={options.units}
          defaultValue={v("originatingUnitId")}
        />
        <TextInput
          name="preparedBy"
          label="Prepared by"
          defaultValue={v("preparedBy")}
        />
      </FormSection>

      <FormSection title="Recipient">
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
        <Wide>
          <TextInput
            name="recipientContact"
            label="Address / email"
            defaultValue={v("recipientContact")}
          />
        </Wide>
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
      </FormSection>

      <FormSection title="Signature">
        <Select
          name="signatoryId"
          label="Signed by"
          hint="Choose from the list, or leave blank and type the name below."
          blank="Someone not on the list"
          options={options.signatories}
          defaultValue={v("signatoryId")}
          onChange={chooseSignatory}
        />
        <TextInput
          name="signedByText"
          label="Signed by (not on the list)"
          hint="Only for someone not on the list."
          defaultValue={v("signedByText")}
        />
        <Field
          label="Signatory's designation *"
          hint="Filled in from the signatory chosen if left blank."
        >
          <input
            ref={designation}
            name="signatoryDesignation"
            defaultValue={v("signatoryDesignation")}
            className={inputClass}
          />
        </Field>
      </FormSection>

      {dispatch && (
        <>
          <FormSection title="Dispatch">
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
            <Wide>
              <TextArea
                name="remarks"
                label="Remarks"
                rows={3}
                defaultValue={v("remarks")}
              />
            </Wide>
          </FormSection>

          <FoldSection
            title="Response"
            summary="Only to override the document type's default"
            open={has(["responseExpectedOverride", "responseDueOverride"])}
          >
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
          </FoldSection>
        </>
      )}
    </div>
  );
}
