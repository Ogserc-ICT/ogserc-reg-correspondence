import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isLocked } from "@/domain/passwords";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { temporaryPassword } from "@/server/temp-password";
import { unlockAction } from "../actions";
import { EditUserForm, ResetPasswordForm } from "./edit-forms";

export const metadata: Metadata = { title: "Edit user · OGSERC Registry" };

export default function EditUserPage({
  params,
}: PageProps<"/admin/users/[id]">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Link
        href="/admin/users"
        className="text-accent rounded text-sm hover:underline"
      >
        ← Users
      </Link>
      <Suspense fallback={<p className="text-text-faint mt-4">Loading…</p>}>
        <EditUser params={params} />
      </Suspense>
    </main>
  );
}

async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("users.manage");
  const { id } = await params;
  const db = getDb();
  const user = /^[0-9a-f-]{36}$/i.test(id)
    ? await db.user.findUnique({ where: { id } })
    : null;
  if (!user) notFound();
  const units = await db.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const locked = isLocked(user.lockedUntil, appNow());

  return (
    <>
      <h1 className="mt-2 mb-6 text-[28px] font-semibold tracking-tight">
        {user.name}
      </h1>
      <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
        <EditUserForm
          id={user.id}
          units={units}
          values={{
            name: user.name,
            email: user.email,
            role: user.role,
            unitId: user.unitId ?? "",
            isSignatory: user.isSignatory,
            designation: user.designation ?? "",
            active: user.active,
          }}
        />
      </section>

      <section className="rounded-panel border-border-subtle bg-surface mt-5 border p-[22px]">
        <h2 className="mb-3 text-lg font-semibold">Sign-in</h2>
        {locked ? (
          <form action={unlockAction.bind(null, user.id)} className="mb-6">
            <p className="rounded-card border-overdue/40 bg-status-overdue mb-3 border p-4 text-sm">
              Locked after repeated failed sign-ins until{" "}
              {user.lockedUntil!.toLocaleTimeString("en-GB", {
                timeZone: "Africa/Lagos",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
            <button
              type="submit"
              className="rounded-control border-border bg-surface text-text hover:bg-surface-raised inline-flex h-11 items-center justify-center border px-4 text-sm font-semibold"
            >
              Unlock now
            </button>
          </form>
        ) : (
          <p className="text-text-muted mb-6 text-sm">Not locked.</p>
        )}
        <ResetPasswordForm
          id={user.id}
          suggestedPassword={temporaryPassword()}
        />
      </section>
    </>
  );
}
