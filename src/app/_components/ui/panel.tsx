// A titled card. The optional link sits top right ("Open Pending Actions").
import Link from "next/link";
import type { ReactNode } from "react";

export function Panel({
  title,
  link,
  actions,
  children,
  className = "",
}: {
  title: string;
  link?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-panel border-border-subtle bg-surface border ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] pt-5 pb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
        {link && (
          <Link
            href={link.href}
            className="text-accent rounded text-sm hover:underline"
          >
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
