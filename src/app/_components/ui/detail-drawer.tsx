// Side panel for one item next to a register. Opened and closed by URL, so it
// needs no client state and the back button works.
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

export function DetailDrawer({
  title,
  subtitle,
  closeHref,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  closeHref: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside
      aria-label={`Details of ${title}`}
      className="rounded-panel border-border bg-surface border p-[22px] lg:sticky lg:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono text-lg font-semibold break-all">{title}</h2>
          {subtitle && (
            <p className="text-text-muted mt-1 text-sm">{subtitle}</p>
          )}
        </div>
        <Link
          href={closeHref}
          aria-label="Close details"
          className="rounded-control border-border text-text-muted hover:text-text grid h-11 w-11 shrink-0 place-items-center border"
        >
          <Icon name="close" />
        </Link>
      </div>
      <div className="mt-5">{children}</div>
      {footer && (
        <div className="border-border-subtle mt-5 border-t pt-5">{footer}</div>
      )}
    </aside>
  );
}

/** Label / value pairs in the drawer or a summary card. */
export function DetailList({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-text-faint text-xs">{i.label}</dt>
          <dd className={`mt-1 ${i.tone ?? "text-text"}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
