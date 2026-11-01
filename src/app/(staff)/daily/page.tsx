// Daily Register (SPEC §8.2): pick a date (default today), check it on
// screen, then print or save the PDF for sign-off.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/app/_components/ui/button";
import { DataTable } from "@/app/_components/ui/data-table";
import { inputClass } from "@/app/_components/ui/input";
import { PageHeader } from "@/app/_components/ui/page-header";
import { Panel } from "@/app/_components/ui/panel";
import { addDays, isIsoDate } from "@/domain/calendar";
import { todayIn } from "@/domain/clock";
import { formatDate, formatTime } from "@/domain/format";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { dailyRegister } from "@/server/read/reports";

export const metadata: Metadata = { title: "Daily Register · OGSERC Registry" };

export default function DailyPage({ searchParams }: PageProps<"/daily">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Daily Register
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
        <Daily searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const numberLink = (href: string, number: string) => (
  <Link
    href={href}
    className="hover:text-accent font-mono text-[13px] font-medium hover:underline"
  >
    {number}
  </Link>
);

async function Daily({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("reports.print");
  const sp = await searchParams;
  const today = todayIn(appNow());
  const asked = typeof sp.date === "string" ? sp.date : "";
  const date = isIsoDate(asked) ? asked : today;
  const d = await dailyRegister(getDb(), user, date);
  const pdf = `/daily/pdf?date=${date}`;
  const step = (n: number) => `/daily?date=${addDays(date, n)}`;

  return (
    <>
      <PageHeader
        title="Daily Register"
        intro="Everything received and dispatched on one day, for sign-off."
        actions={
          <>
            <a href={`${pdf}&download=1`} className={buttonClass()}>
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

      <div className="rounded-card border-border-subtle bg-surface mt-6 flex flex-wrap items-end justify-between gap-4 border p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-text-muted block pb-1.5 text-xs">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonClass()}>
            Show
          </button>
        </form>
        <nav aria-label="Day" className="flex gap-2">
          <Link href={step(-1)} className={buttonClass("ghost")}>
            ← Previous day
          </Link>
          {date !== today && (
            <Link href="/daily" className={buttonClass("ghost")}>
              Today
            </Link>
          )}
          <Link href={step(1)} className={buttonClass("ghost")}>
            Next day →
          </Link>
        </nav>
      </div>

      <p className="text-text-muted mt-5 text-sm">
        <strong className="text-text text-base">{formatDate(date)}</strong> ·
        Items received: {d.received.length} · Items dispatched:{" "}
        {d.dispatched.length}
      </p>

      <Panel title={`Received · ${d.received.length}`} className="mt-4">
        <DataTable
          label="Items received"
          rows={d.received}
          rowKey={(r) => r.id}
          empty="Nothing received on this day."
          columns={[
            { header: "#", cell: (r) => d.received.indexOf(r) + 1 },
            {
              header: "Inward No.",
              className: "whitespace-nowrap",
              cell: (r) => numberLink(`/inward/${r.id}`, r.number),
            },
            {
              header: "Time",
              className: "whitespace-nowrap",
              cell: (r) => formatTime(r.receivedAt),
            },
            { header: "Mode", cell: (r) => r.mode.label },
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
              header: "Forward to",
              className: "text-text-muted",
              cell: (r) => r.routedUnit.name,
            },
          ]}
        />
      </Panel>

      <Panel title={`Dispatched · ${d.dispatched.length}`} className="mt-5">
        <DataTable
          label="Items dispatched"
          rows={d.dispatched}
          rowKey={(r) => r.id}
          empty="Nothing dispatched on this day."
          columns={[
            { header: "#", cell: (r) => d.dispatched.indexOf(r) + 1 },
            {
              header: "Outward No.",
              className: "whitespace-nowrap",
              cell: (r) => numberLink(`/outward/${r.id}`, r.number),
            },
            {
              header: "Addressee · Subject",
              cell: (r) => (
                <>
                  <span className="block font-semibold">{r.addressee}</span>
                  <span className="text-text-muted block">{r.subject}</span>
                </>
              ),
            },
            { header: "Dispatch mode", cell: (r) => r.dispatchMode.label },
            {
              header: "Originating unit",
              className: "text-text-muted",
              cell: (r) => r.originatingUnit.name,
            },
          ]}
        />
      </Panel>
    </>
  );
}
