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
import { buttonClass } from "@/app/_components/ui/button";

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
      className={buttonClass(quiet ? "secondary" : "primary")}
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
      className={`inline-flex h-10 items-center rounded-full border px-4 text-sm transition-colors ${
        path === href
          ? "border-text bg-text text-bg font-semibold"
          : "border-border bg-surface text-text hover:border-text-faint"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Reference data">
      {tab("/admin/types", "Types")}
      {tab("/admin/lists", "Lists")}
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
    <details className="rounded-control border-border-subtle open:bg-surface-raised/50 border">
      <summary className="hover:bg-surface-raised/50 flex min-h-11 cursor-pointer items-center px-3.5 py-2 text-sm">
        {summary}
      </summary>
      <div className="border-border-subtle space-y-3 border-t p-3.5">
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
      className="rounded-control border-border mt-4 space-y-3 border border-dashed p-3.5"
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
      <button
        type="submit"
        className="text-overdue min-h-11 rounded text-sm hover:underline"
      >
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
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="accent-accent h-4 w-4"
      />
      {label}
    </label>
  );
}
