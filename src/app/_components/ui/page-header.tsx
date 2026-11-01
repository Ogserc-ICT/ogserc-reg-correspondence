// Page title block: optional back link, the title, one line of intro, and
// buttons on the right.
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  intro,
  back,
  actions,
}: {
  title: ReactNode;
  intro?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="text-accent mb-2 inline-block rounded text-sm hover:underline"
          >
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[28px] font-semibold tracking-tight break-words">
          {title}
        </h1>
        {intro && <p className="text-text-muted mt-1.5">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
