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
    <main>
      <Link
        href="/admin/users"
        className="text-sm text-neutral-600 hover:underline"
      >
        ← Users
      </Link>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Loading…</p>}>
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
      <h1 className="mt-2 mb-6 text-2xl font-semibold">{user.name}</h1>
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

      <h2 className="mt-10 mb-2 text-lg font-semibold">Sign-in</h2>
      {locked ? (
        <form action={unlockAction.bind(null, user.id)} className="mb-6">
          <p className="bg-status-overdue mb-2 rounded p-3 text-sm">
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
            className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Unlock now
          </button>
        </form>
      ) : (
        <p className="mb-6 text-sm text-neutral-600">Not locked.</p>
      )}
      <ResetPasswordForm id={user.id} suggestedPassword={temporaryPassword()} />
    </>
  );
}
