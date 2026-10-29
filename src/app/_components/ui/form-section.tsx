// A titled group of form fields (RECEIPT, SENDER, HANDLING on New Inward).
import type { ReactNode } from "react";

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
      <div className="mt-2 grid gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
