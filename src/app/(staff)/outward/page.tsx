import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColourKey, StatusBadge } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { Icon } from "@/app/_components/ui/icons";
import { PageHeader } from "@/app/_components/ui/page-header";
import { PreviewButton, PreviewRow } from "@/app/_components/ui/preview-row";
import { formatDate } from "@/domain/format";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireRegisterReader } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { formOptions } from "@/server/read/options";
import {
  OUTWARD_STATUSES,
  outwardRegister,
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
import { OutwardDrawer } from "./outward-drawer";

export const metadata: Metadata = {
  title: "Outward register · OGSERC Registry",
};

export default function OutwardRegisterPage({
  searchParams,
}: PageProps<"/outward">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Outward Register
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
  const r = await outwardRegister(db, user, filters, now);
  // Chip counts: the same search, unit, type and dates, any status.
  const base = (
    await outwardRegister(
      db,
      user,
      { ...filters, status: undefined, flagged: false, page: undefined },
      now,
      { all: true },
    )
  ).rows;
  const chips = [
    { label: "All", count: base.length },
    ...OUTWARD_STATUSES.map((s) => ({
      label: s,
      status: s,
      count: base.filter((x) => x.derived.status === s).length,
    })).filter((c) => c.label !== "Void" || c.count > 0),
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
      <PageHeader
        title="Outward Register"
        intro="Every letter the Commission sends, from numbering to dispatch, delivery and reply."
        actions={
          <>
            <a href={exportHref("/outward", params)} className={buttonClass()}>
              Export CSV
            </a>
            {can(user, "registers.write") && (
              <Link href="/outward/new" className={buttonClass("primary")}>
                <Icon name="plus" className="h-4 w-4" />
                Log outward
              </Link>
            )}
          </>
        }
      />

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
              <OutwardDrawer
                db={db}
                user={user}
                id={open}
                now={now}
                closeHref={`/outward${query(params, { item: undefined })}`}
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
                base="/outward"
                params={params}
                statuses={OUTWARD_STATUSES}
                units={options.units}
                types={options.outgoingTypes}
                dateLabel="Document date"
                searchHint="No., addressee, subject, tracking ref."
                exportLink={false}
              />
            </div>
          </details>

          <section
            aria-label="Outward items"
            className="border-border-subtle bg-surface rounded-panel relative mt-4 overflow-x-auto border"
          >
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-border-subtle border-b">
                  <SortHeader
                    label="Outward No."
                    sort="number"
                    params={params}
                  />
                  <SortHeader label="Date" sort="date" params={params} />
                  <SortHeader
                    label="Addressee · Subject"
                    sort="addressee"
                    params={params}
                  />
                  <SortHeader label="Unit" sort="unit" params={params} />
                  <SortHeader
                    label="Dispatched"
                    sort="dispatched"
                    params={params}
                  />
                  <SortHeader label="Reply due" sort="due" params={params} />
                  <SortHeader label="Status" sort="status" params={params} />
                  <th scope="col" className="w-12">
                    <span className="sr-only">Preview</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border-subtle divide-y">
                {r.rows.map((row) => {
                  const href = `/outward${query(params, { item: row.id })}`;
                  return (
                    <PreviewRow
                      key={row.id}
                      href={href}
                      selected={open === row.id}
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <Link
                          href={`/outward/${row.id}`}
                          className="hover:text-accent rounded font-mono text-[13px] font-medium hover:underline"
                        >
                          {row.number}
                        </Link>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {formatDate(fromDbDate(row.documentDate))}
                      </td>
                      <td className="px-5 py-4">
                        <span className="block font-semibold">
                          {row.addressee}
                        </span>
                        <span className="text-text-muted block">
                          {row.subject}
                        </span>
                        <span className="text-text-faint block text-xs">
                          {row.type.name}
                        </span>
                      </td>
                      <td className="text-text-muted px-5 py-4">
                        {row.originatingUnit.name}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {formatDate(fromDbDate(row.dateDispatched))}
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

          <div className="mt-4">
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
