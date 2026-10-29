"use client";
// A register row that opens the item's details drawer when clicked. Clicks
// on the row's own links and buttons keep their usual behaviour; keyboard
// users get the explicit Preview button.
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./icons";

export function PreviewRow({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as Element).closest("a, button, input, select, textarea"))
          return;
        router.push(href, { scroll: false });
      }}
      className={`cursor-pointer align-middle transition-colors ${
        selected
          ? "bg-surface-raised shadow-[inset_3px_0_0_var(--color-accent)]"
          : "hover:bg-surface-raised/60"
      }`}
    >
      {children}
    </tr>
  );
}

export function PreviewButton({
  href,
  number,
}: {
  href: string;
  number: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href, { scroll: false })}
      aria-label={`Preview ${number}`}
      className="text-text-muted hover:text-text hover:bg-surface rounded-control grid h-9 w-9 place-items-center"
    >
      <Icon name="panel" className="h-4 w-4" />
    </button>
  );
}
