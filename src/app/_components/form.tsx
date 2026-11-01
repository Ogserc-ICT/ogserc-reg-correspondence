"use client";
// Small form building blocks shared by every screen. Errors are listed in full
// (STACK rule 17); values typed before an error are kept by the caller.
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui/button";

/** What every form action returns. */
export type FormState = {
  ok?: boolean;
  message?: string;
  /** Required fields left empty ("Please complete:", TEMPLATES §4). */
  missing?: string[];
  errors?: string[];
  values?: Record<string, string>;
  /** New on every error response; forms key on it (see formError). */
  attempt?: string;
  /** A question the user must confirm before the action goes ahead. */
  confirm?: string;
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
        className="rounded-card border-overdue/40 bg-status-overdue text-text mb-4 border p-4 text-sm"
      >
        {state.missing?.length ? (
          <>
            <p className="text-overdue font-semibold">Please complete:</p>
            <ul className="mt-1 mb-2 list-disc pl-5">
              {state.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        ) : null}
        {state.errors?.length ? (
          <>
            <p className="text-overdue font-semibold">
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
        className="rounded-card border-closed/40 bg-status-closed text-text mb-4 border p-4 text-sm"
      >
        {state.message}
        {state.link && (
          <>
            {" "}
            <a
              href={state.link.href}
              className="text-accent font-semibold underline"
            >
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
      <span className="text-text-muted">{label}</span>
      <span className="mt-2 block">{children}</span>
      {hint && (
        <span className="text-text-faint mt-1.5 block text-xs">{hint}</span>
      )}
    </label>
  );
}

export { inputClass } from "./ui/input";

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
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant)}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
