"use client";
// Sidebar on wide screens; below lg it folds into a top bar with a Menu
// button. One copy of the links and user card serves both layouts.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export type NavGroup = {
  title: string;
  links: { href: string; label: string; icon: IconName }[];
};

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  groups,
  userCard,
}: {
  groups: NavGroup[];
  userCard: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="border-border-subtle bg-sidebar sticky top-0 z-30 flex flex-col border-b lg:h-screen lg:w-[248px] lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-[22px] lg:pt-[22px] lg:pb-2">
        <Link href="/" className="rounded-control flex items-center gap-3">
          <span className="rounded-control border-border bg-surface text-gold grid h-10 w-10 place-items-center border">
            <Icon name="bolt" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold">
              OGSERC Registry
            </span>
            <span className="text-text-muted block text-xs">
              Correspondence &amp; files
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="app-nav"
          className="rounded-control border-border inline-flex h-11 items-center gap-2 border px-3 text-sm lg:hidden"
        >
          <Icon name={open ? "close" : "menu"} />
          Menu
        </button>
      </div>

      <div
        id="app-nav"
        className={`${open ? "flex" : "hidden"} max-h-[calc(100vh-4rem)] flex-1 flex-col overflow-y-auto px-3 pb-3 lg:flex lg:max-h-none`}
      >
        <nav aria-label="Main" className="flex-1">
          {groups.map((g) => (
            <div key={g.title} className="mt-5">
              <p className="text-text-faint px-3 pb-2 text-[11px] font-semibold tracking-wider uppercase">
                {g.title}
              </p>
              <ul className="space-y-1">
                {g.links.map((l) => {
                  const active = isActive(pathname, l.href);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        // Close the narrow-screen menu after choosing a page.
                        onClick={() => setOpen(false)}
                        className={`rounded-control flex h-11 items-center gap-3 px-3 text-sm transition-colors ${
                          active
                            ? "bg-surface-raised text-text font-semibold"
                            : "text-text-muted hover:bg-surface hover:text-text"
                        }`}
                      >
                        <Icon name={l.icon} />
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-6">{userCard}</div>
      </div>
    </div>
  );
}
