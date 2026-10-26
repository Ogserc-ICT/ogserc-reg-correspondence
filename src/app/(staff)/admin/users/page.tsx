import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isLocked } from "@/domain/passwords";
import { ROLE_LABELS } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { temporaryPassword } from "@/server/temp-password";
import { listUsers } from "@/server/users";
import { CreateUserForm } from "./create-user-form";

export const metadata: Metadata = { title: "Users · OGSERC Registry" };

export default function UsersPage() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Users</h1>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Loading…</p>}>
        <Users />
      </Suspense>
    </main>
  );
}

async function Users() {
  const admin = await requireCan("users.manage");
  const db = getDb();
  const users = await listUsers(db, admin);
  const units = await db.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const now = appNow();

  return (
    <>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-300 text-neutral-600">
            <tr>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Unit</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const status = !u.active
                ? "Inactive"
                : isLocked(u.lockedUntil, now)
                  ? "Locked"
                  : u.mustChangePassword
                    ? "Must change password"
                    : "Active";
              return (
                <tr key={u.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-brand-green underline"
                    >
                      {u.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{ROLE_LABELS[u.role]}</td>
                  <td className="py-2 pr-4">{u.unit?.name ?? "—"}</td>
                  <td className="py-2 pr-4">{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold">Add a user</h2>
      <CreateUserForm units={units} suggestedPassword={temporaryPassword()} />
    </>
  );
}
