"use client";
// The New Inward fields (SPEC §4.1), grouped as on the workbook form. Also
// used by the Head of Registry's "edit registered details".
import { useState } from "react";
import { Field } from "@/app/_components/form";
import { Select, TextArea, TextInput, YesNo } from "@/app/_components/inputs";
import { Picker } from "@/app/_components/picker";
import type { FormOptions } from "@/server/read/options";
import { searchFilesAction, searchOutwardAction } from "../search-actions";

export type Values = Record<string, string | undefined>;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded border border-neutral-200 p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

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

  return (
    <div className="space-y-5">
      <Section title="Receipt">
        <TextInput
          name="receivedDate"
          type="date"
          label="Date received"
          required
          defaultValue={v("receivedDate")}
        />
        <TextInput
          name="receivedTime"
          type="time"
          label="Time received"
          hint="Lagos time. Email/portal at or after closing time counts as next working day."
          required
          defaultValue={v("receivedTime")}
        />
        <Select
          name="modeId"
          label="Mode of receipt"
          required
          options={options.receiptModes}
          defaultValue={v("modeId")}
        />
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
      </Section>

      <Section title="Correspondence">
        <Select
          name="typeId"
          label="Type of correspondence"
          required
          options={options.incomingTypes}
          defaultValue={typeId}
          onChange={setTypeId}
          hint={
            type ? `${type.category}. Goes to ${type.defaultUnit}.` : undefined
          }
        />
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
        <div className="sm:col-span-2 lg:col-span-3">
          <TextInput
            name="subject"
            label="Subject"
            required
            defaultValue={v("subject")}
          />
        </div>
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
          hint="Registration no. or earlier ACK no. Needed for updates, annual confirmations and deficiency responses."
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
      </Section>

      <Section
        title={
          type?.isRegistration
            ? "Registration filing (REG-01)"
            : "Filing details"
        }
      >
        <TextInput name="cacNo" label="CAC No." defaultValue={v("cacNo")} />
        <Select
          name="principalLgaId"
          label="Principal LGA"
          options={options.lgas}
          defaultValue={v("principalLgaId")}
        />
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
          <label className="flex items-center gap-2 py-2 text-sm">
            <input
              type="checkbox"
              name="multiState"
              defaultChecked={v("multiState") === "on"}
            />
            Needs 13 Schedule 2 documents
          </label>
        </Field>
      </Section>

      <Section title="Contact">
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
        <TextInput
          name="email"
          type="email"
          label="Email"
          defaultValue={v("email")}
        />
      </Section>

      {handling && (
        <Section title="Handling">
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
          <Select
            name="ackIssuedViaId"
            label="Acknowledgement issued via"
            required
            options={options.ackVia}
            defaultValue={v("ackIssuedViaId")}
          />
          <Select
            name="actionRequiredId"
            label="Action required"
            required
            options={options.actionRequired}
            defaultValue={v("actionRequiredId")}
          />
          <Select
            name="priorityId"
            label="Priority"
            blank="Normal"
            options={options.priorities.filter((p) => p.key !== "NORMAL")}
            defaultValue={v("priorityId")}
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
          <div className="sm:col-span-2">
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
