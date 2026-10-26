import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColourKey, StatusBadge } from "@/app/_components/status";
import { can } from "@/domain/permissions";
import { formatDate, formatDateTime } from "@/domain/format";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { formOptions } from "@/server/read/options";
import {
  INWARD_STATUSES,
  inwardRegister,
  parseFilters,
} from "@/server/read/registers";
import { FilterBar, flatParams, Paging, SortHeader } from "../register-ui";

export const metadata: Metadata = {
  title: "Inward register · OGSERC Registry",
};

export default function InwardRegisterPage({
  searchParams,
}: PageProps<"/inward">) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Inward register</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Register searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Register({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = flatParams(await searchParams);
  const db = getDb();
  const options = await formOptions(db);
  const r = await inwardRegister(db, user, parseFilters(params), appNow());

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {can(user, "registers.write") && (
          <Link
            href="/inward/new"
            className="bg-brand-green rounded px-4 py-2 text-sm text-white"
          >
            New inward item
          </Link>
        )}
        <ColourKey />
      </div>
      <FilterBar
        base="/inward"
        params={params}
        statuses={["Pending", ...INWARD_STATUSES]}
        units={options.units}
        types={options.incomingTypes}
        dateLabel="Deemed receipt"
        searchHint="No., sender, subject, CAC No., ref."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-neutral-600">
            <tr>
              <SortHeader label="Inward No." sort="number" params={params} />
              <SortHeader label="Received" sort="received" params={params} />
              <SortHeader label="Deemed" sort="deemed" params={params} />
              <SortHeader label="Sender" sort="sender" params={params} />
              <th className="py-2 pr-3 text-left font-medium">Subject</th>
              <th className="py-2 pr-3 text-left font-medium">Type</th>
              <SortHeader label="Unit" sort="unit" params={params} />
              <SortHeader label="Response due" sort="due" params={params} />
              <SortHeader label="Status" sort="status" params={params} />
              <th className="py-2 pr-3 text-left font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-neutral-100 align-top"
              >
                <td className="py-2 pr-3 font-mono whitespace-nowrap">
                  <Link
                    href={`/inward/${row.id}`}
                    className="text-brand-green underline"
                  >
                    {row.number}
                  </Link>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDateTime(row.receivedAt)}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDate(row.derived.deemedReceiptDate)}
                </td>
                <td className="py-2 pr-3">{row.sender}</td>
                <td className="py-2 pr-3">{row.subject}</td>
                <td className="py-2 pr-3">{row.type.name}</td>
                <td className="py-2 pr-3">{row.routedUnit.name}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDate(row.derived.responseDue)}
                </td>
                <td className="py-2 pr-3">
                  <StatusBadge
                    status={row.derived.status}
                    flags={row.derived.flags}
                  />
                </td>
                <td className="py-2 pr-3 text-xs text-neutral-700">
                  {row.derived.flags.join("; ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.rows.length === 0 && (
          <p className="py-6 text-neutral-500">No items match.</p>
        )}
      </div>
      <Paging params={params} page={r.page} pages={r.pages} total={r.total} />
    </>
  );
}
