"use client";
// Building blocks for the reference screens: an expandable editor per entry,
// an "Add" form, checkboxes, and the tabs between the three screens.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  startTransition,
  useActionState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Messages, type FormState } from "@/app/_components/form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/**
 * Submits through a transition rather than the form `action`, so React does
 * not reset the inputs: after an error the officer's typing stays (STACK
 * rule 17); after a save the form remounts with the saved values.
 */
function useSubmit(action: Action) {
  const [state, act, pending] = useActionState<FormState, FormData>(action, {});
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => act(data));
  };
  return { state, onSubmit, pending };
}

function Submit({
  pending,
  children,
  quiet,
}: {
  pending: boolean;
  children: ReactNode;
  quiet?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${quiet ? "border border-neutral-300 bg-white hover:bg-neutral-50" : "bg-brand-green text-white hover:opacity-90"}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function Tabs() {
  const path = usePathname();
  const tab = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={path === href ? "page" : undefined}
      className={`rounded px-3 py-1.5 text-sm ${path === href ? "bg-neutral-800 text-white" : "border border-neutral-300"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Reference data">
      {tab("/admin/types", "Types")}
      {tab("/admin/lists", "Lists and units")}
      {tab("/admin/holidays", "Public holidays")}
    </nav>
  );
}

/** One entry: summary line, expands to its edit form. */
export function Editor({
  summary,
  action,
  children,
  submit = "Save",
  extra,
}: {
  summary: ReactNode;
  action: Action;
  children: ReactNode;
  submit?: string;
  extra?: ReactNode;
}) {
  const { state, onSubmit, pending } = useSubmit(action);
  return (
    <details className="rounded border border-neutral-200 open:bg-neutral-50">
      <summary className="cursor-pointer px-3 py-2 text-sm">{summary}</summary>
      <div className="space-y-3 border-t border-neutral-200 p-3">
        <form
          key={state.ok ? state.message : "edit"}
          onSubmit={onSubmit}
          className="space-y-3"
        >
          <Messages state={state} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {children}
          </div>
          <Submit pending={pending}>{submit}</Submit>
        </form>
        {extra}
      </div>
    </details>
  );
}

/** The "Add" form under a section; clears itself after a save. */
export function AddForm({
  action,
  children,
  submit,
}: {
  action: Action;
  children: ReactNode;
  submit: string;
}) {
  const { state, onSubmit, pending } = useSubmit(action);
  return (
    <form
      key={state.ok ? state.message : "add"}
      onSubmit={onSubmit}
      className="mt-3 space-y-3 rounded border border-dashed border-neutral-300 p-3"
    >
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <Submit pending={pending} quiet>
        {submit}
      </Submit>
    </form>
  );
}

/** A small form with one confirmed button (e.g. remove a holiday). */
export function ConfirmButton({
  action,
  label,
  question,
}: {
  action: Action;
  label: string;
  question: string;
}) {
  const [state, act] = useActionState<FormState, FormData>(action, {});
  return (
    <form
      action={act}
      onSubmit={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      <Messages state={state} />
      <button type="submit" className="text-sm text-red-800 underline">
        {label}
      </button>
    </form>
  );
}

export function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
