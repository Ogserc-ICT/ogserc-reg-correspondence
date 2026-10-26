import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColourKey, StatusBadge } from "@/app/_components/status";
import { formatDate } from "@/domain/format";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { formOptions } from "@/server/read/options";
import {
  OUTWARD_STATUSES,
  outwardRegister,
  parseFilters,
} from "@/server/read/registers";
import { FilterBar, flatParams, Paging, SortHeader } from "../register-ui";

export const metadata: Metadata = {
  title: "Outward register · OGSERC Registry",
};

export default function OutwardRegisterPage({
  searchParams,
}: PageProps<"/outward">) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Outward register</h1>
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
  const r = await outwardRegister(db, user, parseFilters(params), appNow());

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {can(user, "registers.write") && (
          <Link
            href="/outward/new"
            className="bg-brand-green rounded px-4 py-2 text-sm text-white"
          >
            New outward item
          </Link>
        )}
        <ColourKey />
      </div>
      <FilterBar
        base="/outward"
        params={params}
        statuses={OUTWARD_STATUSES}
        units={options.units}
        types={options.outgoingTypes}
        dateLabel="Document date"
        searchHint="No., addressee, subject, tracking ref."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-neutral-600">
            <tr>
              <SortHeader label="Outward No." sort="number" params={params} />
              <SortHeader label="Date" sort="date" params={params} />
              <SortHeader label="Addressee" sort="addressee" params={params} />
              <th className="py-2 pr-3 text-left font-medium">Subject</th>
              <th className="py-2 pr-3 text-left font-medium">Type</th>
              <SortHeader label="Unit" sort="unit" params={params} />
              <SortHeader
                label="Dispatched"
                sort="dispatched"
                params={params}
              />
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
                    href={`/outward/${row.id}`}
                    className="text-brand-green underline"
                  >
                    {row.number}
                  </Link>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDate(fromDbDate(row.documentDate))}
                </td>
                <td className="py-2 pr-3">{row.addressee}</td>
                <td className="py-2 pr-3">{row.subject}</td>
                <td className="py-2 pr-3">{row.type.name}</td>
                <td className="py-2 pr-3">{row.originatingUnit.name}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDate(fromDbDate(row.dateDispatched))}
                </td>
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
