// Frame for every signed-in screen. The user bar reads the session, so it
// streams in behind a Suspense boundary (Cache Components).
import Link from "next/link";
import { Suspense } from "react";
import { can, ROLE_LABELS } from "@/domain/permissions";
import { requireUser } from "@/server/current-user";
import { logoutAction } from "./actions";

export default function StaffLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-brand-green font-semibold">
            OGSERC Registry
          </Link>
          <Suspense
            fallback={<span className="text-sm text-neutral-400">…</span>}
          >
            <UserBar />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </div>
    </>
  );
}

async function UserBar() {
  const user = await requireUser({ allowTemporaryPassword: true });
  const registers = user.role !== "ADMIN";
  const links = [
    registers && { href: "/inward", label: "Inward" },
    registers && { href: "/outward", label: "Outward" },
    can(user, "files.read") && { href: "/files", label: "Files" },
    can(user, "reports.print") && { href: "/pending", label: "Pending" },
    can(user, "reports.print") && { href: "/daily", label: "Daily Register" },
    can(user, "users.manage") && { href: "/admin/users", label: "Users" },
    can(user, "settings.manage") && {
      href: "/admin/settings",
      label: "Settings",
    },
  ].filter((l): l is { href: string; label: string } => !!l);
  return (
    <>
      <nav className="flex gap-4 text-sm">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-neutral-700 hover:underline"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-4 text-sm">
        <span className="text-neutral-600">
          {user.name} · {ROLE_LABELS[user.role]}
        </span>
        <Link
          href="/account/password"
          className="text-neutral-700 hover:underline"
        >
          Change password
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="text-neutral-700 hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
