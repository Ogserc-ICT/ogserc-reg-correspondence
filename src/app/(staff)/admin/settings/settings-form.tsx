"use client";
import { useActionState, type ReactNode } from "react";
import {
  Field,
  inputClass,
  Messages,
  SubmitButton,
  type FormState,
} from "@/app/_components/form";
import { saveSettingsAction } from "./actions";

type Values = Record<string, string | number | boolean>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-panel border-border-subtle bg-surface border p-[22px]">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function SettingsForm({ initial }: { initial: Values }) {
  const [state, action] = useActionState<FormState, FormData>(
    saveSettingsAction,
    {},
  );
  // After an error, show what was typed; otherwise the saved values.
  const retry = state.errors ? state.values : undefined;
  const text = (k: string) =>
    String(retry ? (retry[k] ?? "") : (initial[k] ?? ""));
  const checked = (k: string) =>
    retry ? retry[k] === "on" : initial[k] === true;

  const input = (k: string, label: string, hint?: string, type = "text") => (
    <Field label={label} hint={hint}>
      <input
        name={k}
        type={type}
        defaultValue={text(k)}
        className={inputClass}
      />
    </Field>
  );
  const days = (k: string, label: string, hint?: string) =>
    input(k, label, hint ? `${hint} Working days.` : "Working days.", "number");
  const area = (k: string, label: string, hint?: string) => (
    <div className="sm:col-span-2">
      <Field label={label} hint={hint}>
        <textarea
          name={k}
          rows={3}
          defaultValue={text(k)}
          className={inputClass}
        />
      </Field>
    </div>
  );
  const box = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={k} defaultChecked={checked(k)} />
      {label}
    </label>
  );

  return (
    <form
      key={retry ? (state.attempt ?? "retry") : "saved"}
      action={action}
      className="space-y-6"
    >
      <Messages state={state} />
      <Section title="Numbering">
        {input(
          "ackPrefix",
          "Inward / acknowledgement prefix",
          "e.g. OGSERC/ACK",
        )}
        {input("outPrefix", "Outward prefix", "e.g. OGSERC/OUT")}
        {input("frontDeskPrefix", "Front desk prefix", "e.g. OGSERC/FD")}
        {input(
          "filePrefix",
          "File reference prefix",
          "e.g. OGSERC, giving OGSERC/RL/002",
        )}
        {input(
          "fileRefSerialDigits",
          "File reference digits",
          "3 gives OGSERC/RL/002.",
          "number",
        )}
      </Section>
      <Section title="Front desk and routing">
        {box(
          "frontDeskAnyMode",
          "The front desk may log any mode of receipt, not only hand deliveries (Q-V2-5)",
        )}
        {box(
          "routingRequiresPassword",
          "Routers re-enter their password to save routing (Q-V2-3)",
        )}
      </Section>
      <Section title="Receipt (para 10(3))">
        {input(
          "officeClosingTime",
          "Office closing time",
          "HH:mm, Lagos time. Email/portal receipt at or after this time is deemed next working day.",
        )}
      </Section>
      <Section title="Targets">
        {days("registryForwardingTargetDays", "Forward to unit within")}
        {days("dispatchTargetDays", "Dispatch outgoing letters within")}
        {days("chaseProofOfDeliveryAfterDays", "Chase proof of delivery after")}
        {days("urgentResponseTargetDays", "Urgent items: respond within")}
        {days(
          "defaultResponseTargetDays",
          "Default response target",
          "Used when a type has none.",
        )}
        {days("fileReturnTargetDays", "Files back to the Registry within")}
      </Section>
      <Section title="Registration (Order paras 11, 25)">
        {input("effectiveDate", "Effective Date", "YYYY-MM-DD", "date")}
        {input(
          "registrationDeadlineDays",
          "Registration deadline",
          "Calendar days after the Effective Date.",
          "number",
        )}
        {box(
          "effectiveDateIsPlaceholder",
          "Effective Date is a placeholder (not yet gazetted)",
        )}
        {box(
          "deadlineRollsToNextWorkingDay",
          "Deadline on a non-working day moves to the next working day (Q1)",
        )}
        {input(
          "schedule2RequiredDocs",
          "Schedule 2 documents required",
          undefined,
          "number",
        )}
        {input(
          "schedule2RequiredDocsMultiState",
          "Schedule 2 documents (multi-State licensee)",
          undefined,
          "number",
        )}
      </Section>
      <Section title="Acknowledgement slip and reports">
        {input(
          "secretaryName",
          "Secretary to the Commission",
          "Printed on slips and the Daily Register.",
        )}
        {input("registryAddress", "Registry address")}
        {area(
          "slipFooterRegistration",
          "Footer: registration filings",
          "{closingTime} is filled in from the closing time.",
        )}
        {area("slipFooterPara103", "Footer: other para 10(3) types")}
        {area("slipFooterGeneral", "Footer: all other correspondence")}
      </Section>
      <Section title="Acknowledgement email">
        <Field
          label="Acknowledgement email"
          hint="Off: nothing is emailed. Review: emails wait under 'Emails to review'. Send: emailed on save and on routing."
        >
          <select
            name="ackEmailMode"
            defaultValue={text("ackEmailMode")}
            className={inputClass}
          >
            <option value="OFF">Off</option>
            <option value="REVIEW">Review before sending</option>
            <option value="SEND">Send</option>
          </select>
        </Field>
        {input(
          "ackEmailCc",
          "Copy (CC) every acknowledgement to",
          "Optional. Separate addresses with ; or ,",
        )}
      </Section>
      <Section title="Dashboard and controls">
        {input(
          "dashboardFirstMonth",
          "Dashboard first month",
          "First day of a month.",
          "date",
        )}
        {box(
          "headMayVoidOwnItems",
          "The Head of Registry may void items they logged themselves",
        )}
      </Section>
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
