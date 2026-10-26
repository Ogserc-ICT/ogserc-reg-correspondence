"use client";
// Small form building blocks shared by every screen. Errors are listed in full
// (STACK rule 17); values typed before an error are kept by the caller.
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** What every form action returns. */
export type FormState = {
  ok?: boolean;
  message?: string;
  /** Required fields left empty ("Please complete:", TEMPLATES §4). */
  missing?: string[];
  errors?: string[];
  values?: Record<string, string>;
  /** New Inward: open ("print") or download ("pdf") the slip after saving. */
  after?: "print" | "pdf";
  /** A link shown with the success message, e.g. to the saved item. */
  link?: { href: string; label: string };
};

export function Messages({ state }: { state: FormState }) {
  if (state.errors?.length || state.missing?.length)
    return (
      <div
        role="alert"
        className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
      >
        {state.missing?.length ? (
          <>
            <p className="font-medium">Please complete:</p>
            <ul className="mt-1 mb-2 list-disc pl-5">
              {state.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        ) : null}
        {state.errors?.length ? (
          <>
            <p className="font-medium">
              {state.missing?.length
                ? "Also fix:"
                : "Please fix the following:"}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    );
  if (state.message)
    return (
      <p
        role="status"
        className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900"
      >
        {state.message}
        {state.link && (
          <>
            {" "}
            <a href={state.link.href} className="font-medium underline">
              {state.link.label}
            </a>
          </>
        )}
      </p>
    );
  return null;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-neutral-800">{label}</span>
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export const inputClass =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:ring-1 focus:ring-brand-green focus:outline-none";

export function SubmitButton({
  children,
  name,
  value,
  variant = "primary",
}: {
  children: ReactNode;
  name?: string;
  value?: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  const style =
    variant === "primary"
      ? "bg-brand-green text-white hover:opacity-90"
      : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50";
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${style}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
