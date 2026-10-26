"use client";
// Labelled inputs for the register forms. Required fields carry a "*" like
// the workbook's form column F; the server still checks everything.
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
