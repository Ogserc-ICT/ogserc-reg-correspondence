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
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="mb-6 text-[28px] font-semibold tracking-tight">
        Audit log
      </h1>
      <Suspense fallback={<p className="text-text-faint">Loading…</p>}>
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
        className="rounded-card border-border-subtle bg-surface mb-4 flex flex-wrap items-end gap-3 border p-4 text-sm"
      >
        <label>
          <span className="text-text-muted block text-xs">
            Number or file reference
          </span>
          <input name="q" defaultValue={params.q} className={small} />
        </label>
        <label>
          <span className="text-text-muted block text-xs">Record</span>
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
          <span className="text-text-muted block text-xs">Action</span>
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
          <span className="text-text-muted block text-xs">By</span>
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
          <span className="text-text-muted block text-xs">From</span>
          <input
            type="date"
            name="from"
            defaultValue={params.from}
            className={small}
          />
        </label>
        <label>
          <span className="text-text-muted block text-xs">To</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to}
            className={small}
          />
        </label>
        <button
          type="submit"
          className="rounded-control bg-accent text-on-accent inline-flex h-11 items-center justify-center px-4 text-sm font-semibold hover:brightness-110"
        >
          Apply
        </button>
        <Link
          href="/admin/audit"
          className="text-text-muted hover:text-text rounded-control inline-flex h-11 items-center px-3 text-sm font-semibold"
        >
          Reset
        </Link>
      </form>

      <div className="rounded-panel border-border-subtle bg-surface overflow-x-auto border p-[22px]">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-border-subtle text-text-faint border-b text-left text-xs tracking-wider uppercase">
            <tr>
              <th className="py-2 pr-3 font-semibold">When</th>
              <th className="py-2 pr-3 font-semibold">Who</th>
              <th className="py-2 pr-3 font-semibold">Action</th>
              <th className="py-2 pr-3 font-semibold">Record</th>
              <th className="py-2 pr-3 font-semibold">Changes</th>
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
                  className="border-border-subtle border-b align-top"
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDateTime(r.at)}
                  </td>
                  <td className="py-2 pr-3">{r.user?.name ?? "System"}</td>
                  <td className="py-2 pr-3">{r.action}</td>
                  <td className="py-2 pr-3">
                    <span className="text-text-faint text-xs">
                      {r.entityType}
                    </span>{" "}
                    {r.target.href ? (
                      <Link
                        href={r.target.href}
                        className="text-accent font-mono hover:underline"
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
                      <p className="text-text-muted">Note: {r.note}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav className="mt-4 flex items-center gap-4 text-sm" aria-label="Pages">
        <span className="text-text-muted">{total} entries</span>
        {f.page > 1 && (
          <Link
            href={query(params, { page: String(f.page - 1) })}
            className="text-accent hover:underline"
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
            className="text-accent hover:underline"
          >
            Older →
          </Link>
        )}
      </nav>
    </>
  );
}
