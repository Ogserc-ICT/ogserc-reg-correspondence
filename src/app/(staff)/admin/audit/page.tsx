// Audit log viewer: who did what, when, with old → new values.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inputClass } from "@/app/_components/ui/input";
import { formatDateTime } from "@/domain/format";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { auditLog, parseAuditFilters } from "@/server/read/audit";
import { nameMap } from "@/server/read/names";
import { flatParams, query } from "../../register-ui";

export const metadata: Metadata = { title: "Audit log · OGSERC Registry" };

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Audit log</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function show(v: unknown, names: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return names.get(v) ?? v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function Audit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("audit.view");
  const params = flatParams(await searchParams);
  const db = getDb();
  const f = parseAuditFilters(params);
  const { rows, total, pages, facets } = await auditLog(db, user, f);
  const names = await nameMap(db, user);
  const small = `${inputClass} py-1.5`;

  return (
    <>
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 text-sm"
      >
        <label>
          <span className="block text-xs text-neutral-600">
            Number or file reference
          </span>
          <input name="q" defaultValue={params.q} className={small} />
        </label>
        <label>
          <span className="block text-xs text-neutral-600">Record</span>
          <select
            name="type"
            defaultValue={params.type ?? ""}
            className={small}
          >
            <option value="">Any</option>
            {facets.types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs text-neutral-600">Action</span>
          <select
            name="action"
            defaultValue={params.action ?? ""}
            className={small}
          >
            <option value="">Any</option>
            {facets.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs text-neutral-600">By</span>
          <select
            name="user"
            defaultValue={params.user ?? ""}
            className={small}
          >
            <option value="">Anyone</option>
            {facets.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs text-neutral-600">From</span>
          <input
            type="date"
            name="from"
            defaultValue={params.from}
            className={small}
          />
        </label>
        <label>
          <span className="block text-xs text-neutral-600">To</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to}
            className={small}
          />
        </label>
        <button
          type="submit"
          className="bg-brand-green rounded px-4 py-1.5 text-white"
        >
          Apply
        </button>
        <Link href="/admin/audit" className="px-2 py-1.5 underline">
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-neutral-600">
            <tr>
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Who</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Record</th>
              <th className="py-2 pr-3 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const before = (r.before ?? {}) as Record<string, unknown>;
              const after = (r.after ?? {}) as Record<string, unknown>;
              const keys = r.action === "create" ? [] : Object.keys(after);
              return (
                <tr
                  key={String(r.id)}
                  className="border-b border-neutral-100 align-top"
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDateTime(r.at)}
                  </td>
                  <td className="py-2 pr-3">{r.user?.name ?? "System"}</td>
                  <td className="py-2 pr-3">{r.action}</td>
                  <td className="py-2 pr-3">
                    <span className="text-xs text-neutral-500">
                      {r.entityType}
                    </span>{" "}
                    {r.target.href ? (
                      <Link
                        href={r.target.href}
                        className="font-mono underline"
                      >
                        {r.target.text}
                      </Link>
                    ) : (
                      <span className="font-mono">{r.target.text}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {keys.length > 0 && (
                      <ul>
                        {keys.map((k) => (
                          <li key={k}>
                            {k}: {show(before[k], names)} →{" "}
                            {show(after[k], names)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.note && (
                      <p className="text-neutral-600">Note: {r.note}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav className="mt-4 flex items-center gap-4 text-sm" aria-label="Pages">
        <span className="text-neutral-600">{total} entries</span>
        {f.page > 1 && (
          <Link
            href={query(params, { page: String(f.page - 1) })}
            className="underline"
          >
            ← Newer
          </Link>
        )}
        <span>
          Page {f.page} of {pages}
        </span>
        {f.page < pages && (
          <Link
            href={query(params, { page: String(f.page + 1) })}
            className="underline"
          >
            Older →
          </Link>
        )}
      </nav>
    </>
  );
}
