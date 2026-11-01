// Dashboard (SPEC §8.4). Counts are within the user's scope and computed from
// today's date; "pending" means the same thing in every table (§9 R12).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TONES, type Tone } from "@/app/_components/status";
import { formatDate } from "@/domain/format";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { loadFullDashboard } from "@/server/dashboard";
import { getDb } from "@/server/db";
import { MonthlyChart, PendingByUnitChart } from "./charts";

export const metadata: Metadata = { title: "Dashboard · OGSERC Registry" };

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="text-[28px] font-semibold tracking-tight">Dashboard</h1>
      <Suspense fallback={<p className="text-text-muted mt-2">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

/** A figure and its label. Coloured only when it needs attention. */
function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number | string;
  href?: string;
  tone?: Tone;
}) {
  const t = tone && value !== 0 ? TONES[tone] : null;
  const body = (
    <>
      <span
        className={`block font-mono text-2xl font-semibold tabular-nums ${t ? t.text : "text-text"}`}
      >
        {value}
      </span>
      <span className="text-text-muted mt-1 block text-xs leading-snug">
        {label}
      </span>
    </>
  );
  const cls = `block rounded-card border bg-surface-raised/40 p-3.5 ${t ? "border-border" : "border-border-subtle"}`;
  return href ? (
    <Link
      href={href}
      className={`${cls} hover:border-text-faint transition-colors`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border-border-subtle bg-surface mt-5 border p-[22px]">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {children}
      </div>
    </section>
  );
}

function Table<T extends { label: string }>({
  title,
  rows,
  columns,
  empty = "Nothing yet.",
}: {
  title: string;
  rows: readonly T[];
  columns: { header: string; value: (r: T) => number }[];
  empty?: string;
}) {
  return (
    <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-text-muted text-sm">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-text-faint text-left text-xs tracking-wider uppercase">
              <tr className="border-border-subtle border-b">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  <span className="sr-only">{title}</span>
                </th>
                {columns.map((c) => (
                  <th
                    key={c.header}
                    scope="col"
                    className="py-2 pl-3 text-right font-semibold"
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.label}
                  className="border-border-subtle border-b last:border-b-0"
                >
                  <td className="py-2 pr-3">{r.label}</td>
                  {columns.map((c) => (
                    <td
                      key={c.header}
                      className="py-2 pl-3 text-right font-mono tabular-nums"
                    >
                      {c.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

async function Dashboard() {
  const user = await requireCan("dashboard.view");
  const d = await loadFullDashboard(getDb(), appNow(), user);
  const { incoming: i, outgoing: o, files: f } = d.summary;
  const b = d.breakdowns;
  const q = (s: string) => `?status=${encodeURIComponent(s)}`;

  return (
    <>
      <p className="text-text-muted mt-1.5">
        As at {formatDate(d.today)}. Voided items are left out of every figure
        except &ldquo;voided&rdquo;.
      </p>

      <Group title="Incoming">
        <Stat label="Items logged" value={i.logged} href="/inward" />
        <Stat label="Received today" value={i.receivedToday} />
        <Stat label="Received in the last 7 days" value={i.receivedLast7Days} />
        <Stat
          label="Pending"
          value={i.pending}
          href={`/inward${q("Pending")}`}
        />
        <Stat
          label="Awaiting forwarding"
          tone="awaiting"
          value={i.awaitingForwarding}
          href={`/inward${q("Awaiting forwarding")}`}
        />
        <Stat
          label="Forwarding overdue"
          tone="overdue"
          value={i.forwardingOverdue}
        />
        <Stat label="Open" value={i.open} href={`/inward${q("Open")}`} />
        <Stat
          label="Response overdue"
          tone="overdue"
          value={i.responseOverdue}
          href={`/inward${q("Overdue")}`}
        />
        <Stat label="Closed" value={i.closed} href={`/inward${q("Closed")}`} />
        <Stat
          label="Noted / filed"
          value={i.notedFiled}
          href={`/inward${q("Noted / filed")}`}
        />
        <Stat label="Closed on time" value={pct(i.closedOnTimePct)} />
        <Stat
          label="Acknowledgements not yet issued"
          tone="awaiting"
          value={i.ackNotYetIssued}
        />
        <Stat
          label="Received after hours / non-working day"
          value={i.afterHoursOrNonWorkingDay}
        />
        <Stat
          label="REG-01 filed after the registration deadline"
          value={i.reg01FiledAfterDeadline}
        />
        <Stat
          label="Items with flags"
          tone="flagged"
          value={i.withFlags}
          href="/inward?flagged=1"
        />
        <Stat label="Voided" value={i.voided} href={`/inward${q("Void")}`} />
      </Group>

      <Group title="Outgoing">
        <Stat label="Items logged" value={o.logged} href="/outward" />
        <Stat label="Dispatched today" value={o.dispatchedToday} />
        <Stat
          label="Dispatched in the last 7 days"
          value={o.dispatchedLast7Days}
        />
        <Stat
          label="Not yet dispatched"
          value={o.notYetDispatched}
          href={`/outward${q("Not yet dispatched")}`}
        />
        <Stat
          label="Dispatch overdue"
          tone="overdue"
          value={o.dispatchOverdue}
        />
        <Stat
          label="Delivery not confirmed"
          tone="awaiting"
          value={o.deliveryNotConfirmed}
        />
        <Stat
          label="Awaiting response"
          value={o.awaitingResponse}
          href={`/outward${q("Awaiting response")}`}
        />
        <Stat
          label="Recipient response overdue"
          tone="overdue"
          value={o.responseOverdue}
          href={`/outward${q("Response overdue")}`}
        />
        <Stat
          label="Responses received"
          value={o.responsesReceived}
          href={`/outward${q("Response received")}`}
        />
        <Stat label="Replies to inward items" value={o.repliesToInward} />
        <Stat
          label="Items with flags"
          tone="flagged"
          value={o.withFlags}
          href="/outward?flagged=1"
        />
        <Stat label="Voided" value={o.voided} href={`/outward${q("Void")}`} />
      </Group>

      <Group title="Files">
        <Stat label="Files in the index" value={f.inIndex} href="/files" />
        <Stat label="Open files" value={f.open} href="/files?status=OPEN" />
        <Stat
          label="Files out with officers"
          value={f.outWithOfficers}
          href="/files?out=1"
        />
        <Stat
          label="Files overdue"
          tone="overdue"
          value={f.overdue}
          href="/files?overdue=1"
        />
        <Stat
          label="Movements logged"
          value={f.movementsLogged}
          href="/files?view=movements"
        />
        <Stat label="Files with flags" tone="flagged" value={f.withFlags} />
      </Group>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <MonthlyChart data={b.byMonth} />
        <PendingByUnitChart
          data={b.byUnit.map((u) => ({
            label: u.label,
            pending: u.pending,
            overdue: u.overdue,
          }))}
        />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Table
          title="By unit"
          rows={b.byUnit}
          columns={[
            { header: "Inward routed", value: (r) => r.inwardRouted },
            { header: "Pending", value: (r) => r.pending },
            { header: "Overdue", value: (r) => r.overdue },
            { header: "Closed", value: (r) => r.closed },
            { header: "Outward originated", value: (r) => r.outwardOriginated },
          ]}
        />
        <Table
          title="Incoming by category"
          rows={b.byCategory}
          columns={[
            { header: "Received", value: (r) => r.received },
            { header: "Pending", value: (r) => r.pending },
            { header: "Overdue", value: (r) => r.overdue },
          ]}
        />
        <Table
          title="Incoming by correspondent"
          rows={b.byCorrespondent.inward}
          columns={[{ header: "Received", value: (r) => r.received }]}
        />
        <Table
          title="Outgoing by correspondent"
          rows={b.byCorrespondent.outward}
          columns={[{ header: "Sent", value: (r) => r.sent }]}
        />
        <Table
          title="Incoming by type"
          rows={b.incomingByType}
          columns={[
            { header: "Received", value: (r) => r.received },
            { header: "Pending", value: (r) => r.pending },
            { header: "Overdue", value: (r) => r.overdue },
            { header: "Closed", value: (r) => r.closed },
          ]}
        />
        <Table
          title="Outgoing by document type"
          rows={b.outgoingByType}
          columns={[
            { header: "Logged", value: (r) => r.logged },
            { header: "Not yet dispatched", value: (r) => r.notYetDispatched },
            { header: "Response overdue", value: (r) => r.responseOverdue },
          ]}
        />
        <Table
          title="Incoming by principal LGA"
          rows={b.incomingByLga}
          columns={[{ header: "Received", value: (r) => r.received }]}
          empty="No item has a principal LGA yet."
        />
      </div>
    </>
  );
}
