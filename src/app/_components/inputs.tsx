"use client";
// Labelled inputs for the register forms. Required fields carry a "*" like
// the workbook's form column F; the server still checks everything.
import { useState } from "react";
import { Field, inputClass } from "./form";

type Base = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  disabled?: boolean;
};

const labelOf = (label: string, required?: boolean) =>
  required ? `${label} *` : label;

export function TextInput({
  type = "text",
  ...p
}: Base & { type?: "text" | "email" | "tel" | "number" | "date" | "time" }) {
  return (
    <Field label={labelOf(p.label, p.required)} hint={p.hint}>
      <input
        name={p.name}
        type={type}
        defaultValue={p.defaultValue}
        disabled={p.disabled}
        min={type === "number" ? 0 : undefined}
        className={inputClass}
      />
    </Field>
  );
}

export function TextArea(p: Base & { rows?: number }) {
  return (
    <Field label={labelOf(p.label, p.required)} hint={p.hint}>
      <textarea
        name={p.name}
        rows={p.rows ?? 2}
        defaultValue={p.defaultValue}
        disabled={p.disabled}
        className={inputClass}
      />
    </Field>
  );
}

export function Select(
  p: Base & {
    options: readonly { id: string; label: string }[];
    blank?: string;
    onChange?: (value: string) => void;
  },
) {
  return (
    <Field label={labelOf(p.label, p.required)} hint={p.hint}>
      <select
        name={p.name}
        defaultValue={p.defaultValue ?? ""}
        disabled={p.disabled}
        onChange={p.onChange ? (e) => p.onChange!(e.target.value) : undefined}
        className={inputClass}
      >
        <option value="">{p.blank ?? "—"}</option>
        {p.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * One picker for a date and a time. Submits them as two fields (`dateName`,
 * `timeName`), which is what the server reads.
 */
export function DateTimeInput(
  p: Omit<Base, "name" | "defaultValue"> & {
    dateName: string;
    timeName: string;
    defaultDate?: string;
    defaultTime?: string;
  },
) {
  const [value, setValue] = useState(
    p.defaultDate ? `${p.defaultDate}T${p.defaultTime || "00:00"}` : "",
  );
  const [date = "", time = ""] = value.split("T");
  return (
    <Field label={labelOf(p.label, p.required)} hint={p.hint}>
      <input type="hidden" name={p.dateName} value={date} />
      <input type="hidden" name={p.timeName} value={time.slice(0, 5)} />
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={p.disabled}
        className={inputClass}
      />
    </Field>
  );
}

/** A short list of choices shown as buttons (Priority: Normal / High / Urgent). */
export function Segmented({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <fieldset className="text-sm">
      <legend className="text-text-muted">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value || "blank"}
            className="border-border bg-surface text-text has-[:checked]:border-text has-[:checked]:bg-text has-[:checked]:text-bg has-[:focus-visible]:outline-accent inline-flex h-11 cursor-pointer items-center rounded-full border px-4 font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={o.value === defaultValue}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Y / N / blank, as in the workbook's Y/N columns. */
export function YesNo(p: Base & { blankLabel?: string }) {
  return (
    <Select
      {...p}
      blank={p.blankLabel ?? "—"}
      options={[
        { id: "Y", label: "Yes" },
        { id: "N", label: "No" },
      ]}
    />
  );
}
