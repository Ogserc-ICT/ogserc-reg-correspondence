import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColourKey, StatusBadge } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { Icon } from "@/app/_components/ui/icons";
import { PreviewButton, PreviewRow } from "@/app/_components/ui/preview-row";
import { can } from "@/domain/permissions";
import { formatDate, formatDateTime } from "@/domain/format";
import { appNow } from "@/server/clock";
import { requireRegisterReader } from "@/server/current-user";
import { getDb } from "@/server/db";
import { formOptions } from "@/server/read/options";
import {
  INWARD_STATUSES,
  inwardRegister,
  parseFilters,
} from "@/server/read/registers";
import {
  exportHref,
  FilterBar,
  flatParams,
  Paging,
  query,
  SortHeader,
  StatusChips,
} from "../register-ui";
import { InwardDrawer } from "./inward-drawer";

export const metadata: Metadata = {
  title: "Inward register · OGSERC Registry",
};

export default function InwardRegisterPage({
  searchParams,
}: PageProps<"/inward">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Inward Register
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
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
  const user = await requireRegisterReader();
  const params = flatParams(await searchParams);
  const db = getDb();
  const now = appNow();
  const options = await formOptions(db);
  const filters = parseFilters(params);
  const r = await inwardRegister(db, user, filters, now);
  // Chip counts: the same search, unit, type and dates, any status.
  const base = (
    await inwardRegister(
      db,
      user,
      { ...filters, status: undefined, flagged: false, page: undefined },
      now,
      { all: true },
    )
  ).rows;
  const count = (s: string) =>
    s === "Pending"
      ? base.filter((x) => x.derived.pending).length
      : base.filter((x) => x.derived.status === s).length;
  const chips = [
    { label: "All", count: base.length },
    ...[
      "Pending",
      "Awaiting routing",
      "Awaiting forwarding",
      "Open",
      "Overdue",
      "Closed",
      "Noted / filed",
      "Void",
    ]
      .map((s) => ({ label: s, status: s, count: count(s) }))
      .filter(
        (c) => !["Noted / filed", "Void"].includes(c.label) || c.count > 0,
      ),
    {
      label: "Flagged",
      flagged: true,
      count: base.filter((x) => x.derived.flags.length > 0).length,
    },
  ];
  const advanced = Boolean(
    params.q || params.unit || params.type || params.from || params.to,
  );
  const open = params.item;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">
            Inward Register
          </h1>
          <p className="text-text-muted mt-1.5">
            Every item received, with its deemed receipt date under para 10(3).
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={exportHref("/inward", params)} className={buttonClass()}>
            Export CSV
          </a>
          {can(user, "registers.write") && (
            <Link href="/inward/new" className={buttonClass("primary")}>
              <Icon name="plus" className="h-4 w-4" />
              Log inward
            </Link>
          )}
        </div>
      </div>

      <div
        className={`mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 ${open ? "lg:grid-cols-[minmax(0,1fr)_400px]" : ""}`}
      >
        {open && (
          <div className="lg:order-2">
            <Suspense
              fallback={
                <p className="border-border bg-surface text-text-muted rounded-panel border p-6 text-sm">
                  Loading…
                </p>
              }
            >
              <InwardDrawer
                db={db}
                user={user}
                id={open}
                now={now}
                closeHref={`/inward${query(params, { item: undefined })}`}
              />
            </Suspense>
          </div>
        )}

        <div className="min-w-0 lg:order-1">
          <StatusChips params={params} chips={chips} />

          <details
            open={advanced}
            className="border-border-subtle bg-surface rounded-card mt-4 border"
          >
            <summary className="text-text-muted hover:text-text flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm">
              <Icon name="search" className="h-4 w-4" />
              Search and filters
              {advanced && <span className="text-accent">· on</span>}
            </summary>
            <div className="border-border-subtle border-t p-4">
              <FilterBar
                base="/inward"
                params={params}
                statuses={["Pending", ...INWARD_STATUSES]}
                units={options.units}
                types={options.incomingTypes}
                dateLabel="Deemed receipt"
                searchHint="No., sender, subject, CAC No., ref."
                exportLink={false}
              />
            </div>
          </details>

          <section
            aria-label="Inward items"
            className="border-border-subtle bg-surface rounded-panel relative mt-4 overflow-x-auto border"
          >
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-border-subtle border-b">
                  <SortHeader
                    label="Inward No."
                    sort="number"
                    params={params}
                  />
                  <SortHeader
                    label="Deemed receipt"
                    sort="deemed"
                    params={params}
                  />
                  <SortHeader
                    label="Sender · Subject"
                    sort="sender"
                    params={params}
                  />
                  <SortHeader label="Unit" sort="unit" params={params} />
                  <SortHeader label="Due" sort="due" params={params} />
                  <SortHeader label="Status" sort="status" params={params} />
                  <th scope="col" className="w-12">
                    <span className="sr-only">Preview</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border-subtle divide-y">
                {r.rows.map((row) => {
                  const href = `/inward${query(params, { item: row.id })}`;
                  return (
                    <PreviewRow
                      key={row.id}
                      href={href}
                      selected={open === row.id}
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <Link
                          href={`/inward/${row.id}`}
                          className="hover:text-accent rounded font-mono text-[13px] font-medium hover:underline"
                        >
                          {row.number}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <span className="block whitespace-nowrap">
                          {formatDate(row.derived.deemedReceiptDate)}
                        </span>
                        {row.derived.afterHoursOrNonWorkingDay && (
                          <span className="text-gold block text-xs">
                            {row.mode.label} {formatDateTime(row.receivedAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="block font-semibold">
                          {row.sender}
                        </span>
                        <span className="text-text-muted block">
                          {row.subject}
                        </span>
                        <span className="text-text-faint block text-xs">
                          {row.type.name}
                        </span>
                      </td>
                      <td className="text-text-muted px-5 py-4">
                        {row.routedUnit.name}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {formatDate(row.derived.responseDue)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge
                          status={row.derived.status}
                          flags={row.derived.flags}
                        />
                        {row.derived.flags.length > 0 && (
                          <span className="text-flagged mt-1 block text-xs">
                            {row.derived.flags.join("; ")}
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-3">
                        <PreviewButton href={href} number={row.number} />
                      </td>
                    </PreviewRow>
                  );
                })}
              </tbody>
            </table>
            {r.rows.length === 0 && (
              <p className="text-text-muted px-5 py-6">No items match.</p>
            )}
          </section>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <ColourKey />
          </div>
          <Paging
            params={params}
            page={r.page}
            pages={r.pages}
            total={r.total}
          />
        </div>
      </div>
    </>
  );
}
