// A titled group of form fields (RECEIPT, SENDER, HANDLING on New Inward).
import type { ReactNode } from "react";

const GRID = "grid gap-x-4 gap-y-5 sm:grid-cols-2";

export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-panel border-border-subtle bg-surface border px-[22px] pt-2 pb-[22px]">
      <legend className="text-text-muted px-1.5 text-xs font-semibold tracking-wider uppercase">
        {title}
      </legend>
      <div className={`mt-2 ${GRID}`}>{children}</div>
    </fieldset>
  );
}

/**
 * A group of less-used fields that folds away. Folded fields are still in the
 * form, so their values are always submitted.
 */
export function FoldSection({
  title,
  summary,
  open,
  children,
}: {
  title: string;
  /** One line under the title saying what is inside. */
  summary?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className="group rounded-panel border-border-subtle bg-surface border"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-[22px] py-3">
        <span>
          <span className="text-text-muted block text-xs font-semibold tracking-wider uppercase">
            {title}
          </span>
          {summary && (
            <span className="text-text-faint mt-0.5 block text-xs">
              {summary}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="text-text-muted text-lg transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className={`px-[22px] pt-1 pb-[22px] ${GRID}`}>{children}</div>
    </details>
  );
}

/** Spans both columns of a section's grid. */
export function Wide({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}
