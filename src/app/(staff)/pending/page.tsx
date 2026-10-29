// Pending Actions (SPEC §8.3): one definition of pending (R12), unit filter,
// then print or save the PDF.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inputClass } from "@/app/_components/ui/input";
import { StatusBadge } from "@/app/_components/status";
import { formatDate } from "@/domain/format";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { pendingActions } from "@/server/read/reports";

export const metadata: Metadata = {
  title: "Pending Actions · OGSERC Registry",
};

export default function PendingPage({ searchParams }: PageProps<"/pending">) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Pending Actions</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Pending searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Pending({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("reports.print");
  const sp = await searchParams;
  const asked = typeof sp.unit === "string" ? sp.unit : "";
  const unitId = /^[0-9a-f-]{36}$/i.test(asked) ? asked : undefined;
  const db = getDb();
  const p = await pendingActions(db, user, unitId, appNow());
  const units = await db.unit.findMany({ orderBy: { sortOrder: "asc" } });
  const pdf = `/pending/pdf${unitId ? `?unit=${unitId}` : ""}`;
  const join = pdf.includes("?") ? "&" : "?";

  return (
    <>
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 text-sm"
      >
        <label>
          <span className="block text-xs text-neutral-600">Unit</span>
          <select
            name="unit"
            defaultValue={unitId ?? ""}
            className={inputClass}
          >
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded border border-neutral-300 px-4 py-2"
        >
          Show
        </button>
        <a
          href={pdf}
          target="_blank"
          rel="noopener"
          className="bg-brand-green rounded px-4 py-2 text-white"
        >
          Print
        </a>
        <a
          href={`${pdf}${join}download=1`}
          className="rounded border border-neutral-300 px-4 py-2"
        >
          Save PDF
        </a>
      </form>

      <p className="mb-4 text-sm">
        {p.unit} · Pending: {p.counts.pending} · Overdue: {p.counts.overdue} ·
        Awaiting forwarding: {p.counts.awaitingForwarding}
      </p>

      {p.rows.length === 0 ? (
        <p className="text-sm text-neutral-600">Nothing is pending.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-300 text-left text-neutral-600">
              <tr>
                <th className="py-1 pr-3 font-medium">Inward No.</th>
                <th className="py-1 pr-3 font-medium">Deemed receipt</th>
                <th className="py-1 pr-3 font-medium">Sender</th>
                <th className="py-1 pr-3 font-medium">Subject</th>
                <th className="py-1 pr-3 font-medium">Unit</th>
                <th className="py-1 pr-3 font-medium">Response due</th>
                <th className="py-1 pr-3 font-medium">Days open</th>
                <th className="py-1 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100">
                  <td className="py-1 pr-3 font-mono">
                    <Link href={`/inward/${r.id}`} className="underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="py-1 pr-3">
                    {formatDate(r.derived.deemedReceiptDate)}
                  </td>
                  <td className="py-1 pr-3">{r.sender}</td>
                  <td className="py-1 pr-3">{r.subject}</td>
                  <td className="py-1 pr-3">{r.routedUnit.name}</td>
                  <td className="py-1 pr-3">
                    {formatDate(r.derived.responseDue)}
                  </td>
                  <td className="py-1 pr-3">{r.derived.workingDaysOpen}</td>
                  <td className="py-1 pr-3">
                    <StatusBadge
                      status={r.derived.status}
                      flags={r.derived.flags}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
