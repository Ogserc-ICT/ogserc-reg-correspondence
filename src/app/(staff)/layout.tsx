// Frame for every signed-in screen: sidebar (a top menu on narrow screens),
// top bar, then the page. The parts that read the session stream in behind
// Suspense boundaries (Cache Components).
import Link from "next/link";
import { Suspense } from "react";
import { todayIn } from "@/domain/clock";
import { formatDate } from "@/domain/format";
import { can, readScope, ROLE_LABELS } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { SearchBox } from "@/app/_components/ui/search-box";
import { Sidebar, type NavGroup } from "@/app/_components/ui/sidebar";
import { logoutAction } from "./actions";

export default function StaffLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <Suspense
        fallback={
          <div className="border-border-subtle bg-sidebar h-16 border-b lg:h-screen lg:w-[248px] lg:border-r lg:border-b-0" />
        }
      >
        <AppSidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border-subtle flex min-h-[82px] items-center gap-4 border-b px-4 py-[18px] sm:px-8">
          <Suspense fallback={null}>
            <TopBar />
          </Suspense>
        </div>
        <div className="flex-1 px-4 py-8 sm:px-8">{children}</div>
      </div>
    </div>
  );
}

async function TopBar() {
  const user = await requireUser({ allowTemporaryPassword: true });
  const today = todayIn(appNow());
  return (
    <>
      {readScope(user).kind !== "none" && <SearchBox />}
      <p className="text-text-muted ml-auto text-sm whitespace-nowrap">
        <time dateTime={today}>{formatDate(today)}</time>
        <span className="hidden sm:inline"> · Africa/Lagos</span>
      </p>
    </>
  );
}

async function AppSidebar() {
  const user = await requireUser({ allowTemporaryPassword: true });
  // Admin and Front desk officer read no items (C12).
  const registers = readScope(user).kind !== "none";
  const groups: NavGroup[] = [
    {
      title: "Workspace",
      links: [
        { href: "/", label: "Registry Desk", icon: "grid" },
        registers && { href: "/inward", label: "Inward", icon: "inbox" },
        registers && { href: "/outward", label: "Outward", icon: "send" },
        can(user, "files.read") && {
          href: "/files",
          label: "File Desk",
          icon: "folder",
        },
        can(user, "reports.print") && {
          href: "/pending",
          label: "Pending Actions",
          icon: "clock",
        },
      ],
    },
    {
      title: "Reports",
      links: [
        can(user, "reports.print") && {
          href: "/daily",
          label: "Daily Register",
          icon: "calendar",
        },
        can(user, "dashboard.view") && {
          href: "/dashboard",
          label: "Dashboard",
          icon: "chart",
        },
      ],
    },
    {
      title: "Admin",
      links: [
        can(user, "users.manage") && {
          href: "/admin/users",
          label: "Users",
          icon: "users",
        },
        can(user, "reference.manage") && {
          href: "/admin/types",
          label: "Reference lists",
          icon: "list",
        },
        can(user, "audit.view") && {
          href: "/admin/audit",
          label: "Audit log",
          icon: "shield",
        },
        can(user, "settings.manage") && {
          href: "/admin/jobs",
          label: "Jobs",
          icon: "play",
        },
        can(user, "settings.manage") && {
          href: "/admin/settings",
          label: "Settings",
          icon: "settings",
        },
      ],
    },
  ]
    .map((g) => ({
      title: g.title,
      links: g.links.filter((l): l is NavGroup["links"][number] => !!l),
    }))
    .filter((g) => g.links.length > 0);

  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar
      groups={groups}
      userCard={
        <div className="rounded-card border-border-subtle bg-surface border p-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="bg-status-closed text-accent grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
            >
              {initials}
            </span>
            {/* One text run reads "Name · Role" (the sign-in tests look for it). */}
            <p className="min-w-0 text-sm leading-tight">
              <span className="block truncate font-semibold">{user.name}</span>
              <span className="sr-only"> · </span>
              <span className="text-text-muted block truncate text-xs">
                {ROLE_LABELS[user.role]}
              </span>
            </p>
          </div>
          <div className="border-border-subtle mt-3 flex gap-2 border-t pt-3 text-xs">
            <Link
              href="/account/password"
              className="rounded-control text-text-muted hover:bg-surface-raised hover:text-text flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap"
            >
              Change password
            </Link>
            <form action={logoutAction} className="flex flex-1">
              <button
                type="submit"
                className="rounded-control text-text-muted hover:bg-surface-raised hover:text-text flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      }
    />
  );
}
