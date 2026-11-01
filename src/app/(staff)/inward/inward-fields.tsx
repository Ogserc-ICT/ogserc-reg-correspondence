"use client";
// The New Inward fields (SPEC §4.1): Receipt, Sender and Handling as on the
// reference design, with the less-used fields in fold-out groups. Also used
// by the Head of Registry's "edit registered details".
import { useState } from "react";
import { Field } from "@/app/_components/form";
import {
  DateTimeInput,
  Segmented,
  Select,
  TextArea,
  TextInput,
  YesNo,
} from "@/app/_components/inputs";
import { Picker } from "@/app/_components/picker";
import {
  FoldSection,
  FormSection,
  Wide,
} from "@/app/_components/ui/form-section";
import type { FormOptions } from "@/server/read/options";
import { searchFilesAction, searchOutwardAction } from "../search-actions";

export type Values = Record<string, string | undefined>;

const FILING_KEYS = [
  "cacNo",
  "volumes",
  "schedule2DocsAttached",
  "feeEvidenceAttached",
  "paymentRef",
  "amountShown",
  "multiState",
];

export function InwardFields({
  options,
  values,
  handling = true,
}: {
  options: FormOptions;
  values: Values;
  /** Show the handling section (New Inward); the full edit has its own. */
  handling?: boolean;
}) {
  const [typeId, setTypeId] = useState(values.typeId ?? "");
  const type = options.incomingTypes.find((t) => t.id === typeId);
  const v = (k: string) => values[k] ?? "";
  const has = (keys: string[]) => keys.some((k) => v(k));
  const normal = options.priorities.find((p) => p.key === "NORMAL");

  return (
    <div className="space-y-5">
      <FormSection title="Receipt">
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
          hint="Email or portal at or after closing time counts from the next working day"
          required
          options={options.receiptModes}
          defaultValue={v("modeId")}
        />
        <Wide>
          <Select
            name="typeId"
            label="Type"
            required
            options={options.incomingTypes}
            defaultValue={typeId}
            onChange={setTypeId}
            hint={
              type
                ? `${type.category}. Goes to ${type.defaultUnit}.`
                : undefined
            }
          />
        </Wide>
        <Select
          name="receivedById"
          label="Received by"
          required
          options={options.registryUsers}
          defaultValue={v("receivedById")}
        />
        <TextInput
          name="deliveredBy"
          label="Delivered / sent by"
          defaultValue={v("deliveredBy")}
        />
      </FormSection>

      <FormSection title="Sender">
        <TextInput
          name="sender"
          label="Sender"
          required
          defaultValue={v("sender")}
        />
        <Select
          name="senderCategoryId"
          label="Sender category"
          required
          options={options.partyCategories}
          defaultValue={v("senderCategoryId")}
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
          name="principalLgaId"
          label="Principal LGA"
          options={options.lgas}
          defaultValue={v("principalLgaId")}
        />
        <TextInput
          name="email"
          type="email"
          label="Email"
          defaultValue={v("email")}
        />
        <TextInput
          name="senderRef"
          label="Sender's ref. no."
          defaultValue={v("senderRef")}
        />
        <TextInput
          name="documentDate"
          type="date"
          label="Date of the letter"
          defaultValue={v("documentDate")}
        />
        <TextInput
          name="relatedOgsercNo"
          label="Related OGSERC No."
          hint="Registration or earlier ACK no. Needed for updates, annual confirmations and deficiency responses."
          defaultValue={v("relatedOgsercNo")}
        />
        <Picker
          name="inResponseToOutwardId"
          label="In response to our ref."
          hint="Our outward letter this answers, if any."
          search={searchOutwardAction}
          defaultId={values.inResponseToOutwardId || undefined}
          defaultLabel={values.inResponseToOutwardIdLabel}
        />
      </FormSection>

      <FoldSection
        title="Contact person"
        summary="Name and phone, if different from the sender"
        open={has(["contactPerson", "phone"])}
      >
        <TextInput
          name="contactPerson"
          label="Contact person"
          defaultValue={v("contactPerson")}
        />
        <TextInput
          name="phone"
          type="tel"
          label="Phone"
          defaultValue={v("phone")}
        />
      </FoldSection>

      <FoldSection
        // Opens by itself when a REG-01 type is chosen.
        title={
          type?.isRegistration
            ? "Registration filing (REG-01)"
            : "Filing details"
        }
        summary="CAC No., volumes, Schedule 2 documents, fee evidence"
        open={type?.isRegistration || has(FILING_KEYS)}
      >
        <TextInput name="cacNo" label="CAC No." defaultValue={v("cacNo")} />
        <TextInput
          name="volumes"
          type="number"
          label="Files / volumes"
          defaultValue={v("volumes")}
        />
        <TextInput
          name="schedule2DocsAttached"
          type="number"
          label="Schedule 2 documents attached"
          hint="REG-01: 12 required (13 for a multi-State licensee)."
          defaultValue={v("schedule2DocsAttached")}
        />
        <YesNo
          name="feeEvidenceAttached"
          label="Fee evidence attached"
          defaultValue={v("feeEvidenceAttached")}
        />
        <TextInput
          name="paymentRef"
          label="Payment reference"
          defaultValue={v("paymentRef")}
        />
        <TextInput
          name="amountShown"
          label="Amount shown (₦)"
          hint="e.g. 250,000"
          defaultValue={v("amountShown")}
        />
        <Field label="Multi-State licensee">
          <input type="hidden" name="multiStateShown" value="1" />
          <span className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="multiState"
              defaultChecked={v("multiState") === "on"}
              className="accent-accent h-4 w-4"
            />
            Needs 13 Schedule 2 documents
          </span>
        </Field>
      </FoldSection>

      {handling && (
        <>
          <FormSection title="Handling">
            <Select
              name="actionRequiredId"
              label="Action required"
              required
              options={options.actionRequired}
              defaultValue={v("actionRequiredId")}
            />
            <Select
              name="ackIssuedViaId"
              label="Acknowledgement via"
              required
              options={options.ackVia}
              defaultValue={v("ackIssuedViaId")}
            />
            <Wide>
              <Segmented
                name="priorityId"
                label="Priority"
                // Blank means Normal; keep a stored Normal id as it is.
                defaultValue={v("priorityId")}
                options={[
                  {
                    value: v("priorityId") === normal?.id ? normal.id : "",
                    label: normal?.label ?? "Normal",
                  },
                  ...options.priorities
                    .filter((p) => p.key !== "NORMAL")
                    .map((p) => ({ value: p.id, label: p.label })),
                ]}
              />
            </Wide>
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
            title="Routing and file"
            summary="File, unit override, action officer, sender's deadline"
            open={has([
              "fileId",
              "unitOverrideId",
              "actionOfficer",
              "responseDueOverride",
            ])}
          >
            <Picker
              name="fileId"
              label="File"
              search={searchFilesAction}
              defaultId={values.fileId || undefined}
              defaultLabel={values.fileIdLabel}
            />
            <Select
              name="unitOverrideId"
              label="Forward to (override)"
              hint="Only to override the type's unit."
              options={options.units}
              defaultValue={v("unitOverrideId")}
            />
            <TextInput
              name="actionOfficer"
              label="Action officer"
              defaultValue={v("actionOfficer")}
            />
            <TextInput
              name="responseDueOverride"
              type="date"
              label="Response due (override)"
              hint="Use when the sender sets a deadline."
              defaultValue={v("responseDueOverride")}
            />
          </FoldSection>
        </>
      )}
    </div>
  );
}
