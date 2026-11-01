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
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="text-[28px] font-semibold tracking-tight">Users</h1>
      <Suspense fallback={<p className="text-text-faint mt-4">Loading…</p>}>
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
      <section
        aria-label="Users"
        className="rounded-panel border-border-subtle bg-surface mt-6 overflow-x-auto border p-[22px]"
      >
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-border-subtle text-text-faint border-b text-left text-xs tracking-wider uppercase">
            <tr>
              <th scope="col" className="py-2.5 pr-4 font-semibold">
                Name
              </th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">
                Email
              </th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">
                Role
              </th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">
                Unit
              </th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">
                Status
              </th>
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
                <tr
                  key={u.id}
                  className="border-border-subtle border-b last:border-b-0"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-accent hover:underline"
                    >
                      {u.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{u.email}</td>
                  <td className="py-3 pr-4">{ROLE_LABELS[u.role]}</td>
                  <td className="py-3 pr-4">{u.unit?.name ?? "—"}</td>
                  <td className="py-3 pr-4">{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-panel border-border-subtle bg-surface mt-5 border p-[22px]">
        <h2 className="mb-4 text-lg font-semibold">Add a user</h2>
        <CreateUserForm units={units} suggestedPassword={temporaryPassword()} />
      </section>
    </>
  );
}
