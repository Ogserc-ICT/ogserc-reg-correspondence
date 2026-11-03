// Pending Actions (SPEC §8.3): one definition of pending (R12), unit filter,
// then print or save the PDF.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { DataTable } from "@/app/_components/ui/data-table";
import { inputClass } from "@/app/_components/ui/input";
import { PageHeader } from "@/app/_components/ui/page-header";
import { Panel } from "@/app/_components/ui/panel";
import { StatTile } from "@/app/_components/ui/stat-tile";
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
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Pending Actions
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
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
      <PageHeader
        title="Pending Actions"
        intro="Inward items still open, overdue or waiting to be forwarded, oldest first."
        actions={
          <>
            <a href={`${pdf}${join}download=1`} className={buttonClass()}>
              Save PDF
            </a>
            <a
              href={pdf}
              target="_blank"
              rel="noopener"
              className={buttonClass("primary")}
            >
              Print
            </a>
          </>
        }
      />

      <form
        method="get"
        className="rounded-card border-border-subtle bg-surface mt-6 flex flex-wrap items-end gap-3 border p-4"
      >
        <label className="min-w-56 flex-1 text-sm sm:flex-none">
          <span className="text-text-muted block pb-1.5 text-xs">Unit</span>
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
        <button type="submit" className={buttonClass()}>
          Show
        </button>
      </form>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Pending"
          value={p.counts.pending}
          sub={p.unit}
          tone={p.counts.pending ? "awaiting" : undefined}
        />
        <StatTile
          label="Overdue"
          value={p.counts.overdue}
          sub="Past their response date"
          tone={p.counts.overdue ? "overdue" : undefined}
        />
        <StatTile
          label="Awaiting routing / fwd"
          value={p.counts.awaitingRoutingOrForwarding}
          sub="Still at the Registry"
          tone={p.counts.awaitingRoutingOrForwarding ? "awaiting" : undefined}
        />
      </div>

      <Panel title={`Pending items · ${p.unit}`} className="mt-5">
        <DataTable
          label="Pending items"
          rows={p.rows}
          rowKey={(r) => r.id}
          empty="Nothing is pending."
          minWidth="56rem"
          columns={[
            {
              header: "Inward No.",
              className: "whitespace-nowrap",
              cell: (r) => (
                <Link
                  href={`/inward/${r.id}`}
                  className="hover:text-accent font-mono text-[13px] font-medium hover:underline"
                >
                  {r.number}
                </Link>
              ),
            },
            {
              header: "Deemed receipt",
              className: "whitespace-nowrap",
              cell: (r) => formatDate(r.derived.deemedReceiptDate),
            },
            {
              header: "Sender · Subject",
              cell: (r) => (
                <>
                  <span className="block font-semibold">{r.sender}</span>
                  <span className="text-text-muted block">{r.subject}</span>
                </>
              ),
            },
            {
              header: "Unit",
              className: "text-text-muted",
              cell: (r) => r.routedUnit.name,
            },
            {
              header: "Due",
              className: "whitespace-nowrap",
              cell: (r) => formatDate(r.derived.responseDue),
            },
            {
              header: "Days open",
              className: "font-mono tabular-nums",
              cell: (r) => r.derived.workingDaysOpen,
            },
            {
              header: "Status",
              cell: (r) => (
                <StatusBadge
                  status={r.derived.status}
                  flags={r.derived.flags}
                />
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
