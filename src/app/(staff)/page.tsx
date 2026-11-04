// Registry Desk (SPEC §8.4 tiles, §7 buttons). Counts are within the user's
// scope, so a unit officer sees their unit's figures. The panels only show
// what the registers already derive (statuses, flags, due dates).
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import type { IsoDate } from "@/domain/calendar";
import { todayIn } from "@/domain/clock";
import { FILE_FLAGS } from "@/domain/files";
import { formatDate } from "@/domain/format";
import { INWARD_FLAGS } from "@/domain/inward";
import { OUTWARD_FLAGS } from "@/domain/outward";
import { can, readScope } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { loadFullDashboard } from "@/server/dashboard";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { upcomingUnconfirmedHolidays } from "@/server/jobs";
import { fileIndex } from "@/server/read/files";
import { inwardRegister, outwardRegister } from "@/server/read/registers";
import { latestInwardNumber } from "@/server/read/reports";
import { loadRules } from "@/server/rules";
import { inputClass } from "@/app/_components/ui/input";
import { StatusBadge, TONES, type Tone } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { DataTable } from "@/app/_components/ui/data-table";
import { Icon, type IconName } from "@/app/_components/ui/icons";
import { Panel } from "@/app/_components/ui/panel";
import { StatTile } from "@/app/_components/ui/stat-tile";
import { DeskVolume } from "./desk-volume";

export const metadata: Metadata = { title: "Registry Desk · OGSERC Registry" };

export default function Desk() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Registry Desk
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
        <DeskContent />
      </Suspense>
    </main>
  );
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Tone for a counter: coloured only when there is something to act on. */
const when = (n: number, tone: Tone): Tone | undefined =>
  n > 0 ? tone : undefined;

type Attention = {
  key: string;
  tone: Tone;
  icon: IconName;
  number: string;
  title: string;
  detail: string;
  href: string;
  /** Oldest first within a tone. */
  since: string;
};

const TONE_ORDER: Tone[] = ["overdue", "awaiting", "flagged"];

async function DeskContent() {
  const user = await requireUser();
  // Front desk officers work from the Front Desk only (SPEC-v2 C12).
  if (can(user, "frontdesk.write") && readScope(user).kind === "none")
    redirect("/front-desk");
  const now = appNow();
  const today = todayIn(now);
  const db = getDb();
  const { summary: s, breakdowns } = await loadFullDashboard(db, now, user);
  const rules = await loadRules(db);
  const inward = (await inwardRegister(db, user, {}, now, { all: true })).rows;
  const outward = (await outwardRegister(db, user, {}, now, { all: true }))
    .rows;
  const files = can(user, "files.read")
    ? (await fileIndex(db, user, { overdue: true }, now)).rows
    : [];
  const printing = can(user, "reports.print");
  const latest = printing ? await latestInwardNumber(db, user) : null;
  const holidays =
    can(user, "reference.manage") || can(user, "settings.manage")
      ? await upcomingUnconfirmedHolidays(db, today)
      : [];
  const q = (status: string) => `?status=${encodeURIComponent(status)}`;

  const nextDue = inward
    .filter((r) => r.derived.status === "Open" && r.derived.responseDue)
    .map((r) => r.derived.responseDue as IsoDate)
    .sort()[0];

  // Needs attention: items the registers already flag, most urgent first.
  const attention: Attention[] = [
    ...inward.flatMap((r): Attention[] => {
      const d = r.derived;
      const unit = r.routedUnit.name;
      if (d.status === "Overdue")
        return [
          {
            key: r.id,
            tone: "overdue",
            icon: "inbox",
            number: r.number,
            title: `${r.type.name}: response overdue`,
            detail: `${unit} · response was due ${formatDate(d.responseDue)}`,
            href: `/inward/${r.id}`,
            since: d.responseDue ?? "",
          },
        ];
      if (d.flags.includes(INWARD_FLAGS.notForwarded))
        return [
          {
            key: r.id,
            tone: "awaiting",
            icon: "inbox",
            number: r.number,
            title: `${r.type.name}: not forwarded, ${plural(d.workingDaysAtRegistry, "working day")} at Registry`,
            detail: `${unit} · response due ${formatDate(d.responseDue)}`,
            href: `/inward/${r.id}`,
            since: d.deemedReceiptDate,
          },
        ];
      return [];
    }),
    ...outward.flatMap((r): Attention[] => {
      const d = r.derived;
      const flag = [
        OUTWARD_FLAGS.responseOverdue,
        OUTWARD_FLAGS.notDispatched,
        OUTWARD_FLAGS.deliveryNotConfirmed,
      ].find((f) => d.flags.includes(f));
      if (!flag) return [];
      const dispatched = fromDbDate(r.dateDispatched);
      return [
        {
          key: r.id,
          tone: flag === OUTWARD_FLAGS.responseOverdue ? "overdue" : "awaiting",
          icon: "send",
          number: r.number,
          title: `${r.addressee}: ${flag.toLowerCase()}`,
          detail: `${r.originatingUnit.name} · ${
            dispatched
              ? `dispatched ${formatDate(dispatched)}`
              : `dated ${formatDate(fromDbDate(r.documentDate))}`
          }`,
          href: `/outward/${r.id}`,
          since: dispatched ?? fromDbDate(r.documentDate),
        },
      ];
    }),
    ...files
      .filter((f) => f.derived.flags.includes(FILE_FLAGS.outBeyondReturn))
      .map((f): Attention => ({
        key: f.id,
        tone: "overdue",
        icon: "folder",
        number: f.reference,
        title: `File out with ${f.derived.currentlyWith}: past its return date`,
        detail: `${f.owningUnit?.name ?? "Registry"} · out ${plural(f.derived.workingDaysOut ?? 0, "working day")}`,
        href: `/files/${f.id}`,
        since: f.derived.outSince ?? "",
      })),
  ]
    .sort(
      (a, b) =>
        TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone) ||
        a.since.localeCompare(b.since),
    )
    .slice(0, 4);

  // Recent activity: the latest items in either register.
  const recent = [
    ...inward.map((r) => ({
      id: r.id,
      href: `/inward/${r.id}`,
      number: r.number,
      party: r.sender,
      type: r.type.name,
      date: r.derived.deemedReceiptDate,
      deemed: r.derived.afterHoursOrNonWorkingDay,
      status: r.derived.status,
      flags: r.derived.flags as readonly string[],
      at: r.createdAt.getTime(),
    })),
    ...outward.map((r) => ({
      id: r.id,
      href: `/outward/${r.id}`,
      number: r.number,
      party: r.addressee,
      type: r.type.name,
      date: fromDbDate(r.documentDate),
      deemed: false,
      status: r.derived.status,
      flags: r.derived.flags as readonly string[],
      at: r.createdAt.getTime(),
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
    .slice(0, 5);

  // The last six months that have anything in them.
  const months = breakdowns.byMonth.slice(-6);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">
            Registry Desk
          </h1>
          <p className="text-text-muted mt-1.5">
            Everything that came in, went out, or left the Registry today.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {can(user, "registers.write") && (
            <>
              <Link href="/inward/new" className={buttonClass("primary")}>
                <Icon name="plus" className="h-4 w-4" />
                Log inward
              </Link>
              <Link href="/outward/new" className={buttonClass("secondary")}>
                Log outward
              </Link>
            </>
          )}
          {can(user, "files.write") && (
            <Link href="/files" className={buttonClass("secondary")}>
              Issue file
            </Link>
          )}
        </div>
      </div>

      {holidays.length > 0 && (
        <div
          role="note"
          className="rounded-card border-gold/40 bg-status-gold mt-6 border p-4 text-sm"
        >
          <p className="text-gold font-semibold">Public holidays to confirm</p>
          <p className="text-text-muted mt-1">
            These count as non-working days but are not yet confirmed by the
            Federal Government. If a date changes, deadlines move with it:
          </p>
          <ul className="mt-2 list-disc pl-5">
            {holidays.map((h) => (
              <li key={h.date}>
                {formatDate(h.date)}: {h.name} ({h.status.toLowerCase()})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile
          label="Received today"
          value={s.incoming.receivedToday}
          sub={`${s.incoming.receivedLast7Days} in the last 7 days`}
        />
        <StatTile
          label="Dispatched today"
          value={s.outgoing.dispatchedToday}
          sub={`${s.outgoing.dispatchedLast7Days} in the last 7 days`}
        />
        <StatTile
          label="Awaiting routing / forwarding"
          value={s.incoming.awaitingRoutingOrForwarding}
          href="/pending"
          tone={when(s.incoming.awaitingRoutingOrForwarding, "awaiting")}
          sub={`Target: ${plural(rules.registryForwardingTargetDays, "working day")}`}
        />
        <StatTile
          label="Incoming overdue"
          value={s.incoming.responseOverdue}
          href={`/inward${q("Overdue")}`}
          tone={when(s.incoming.responseOverdue, "overdue")}
          sub={nextDue ? `Next due ${formatDate(nextDue)}` : "Nothing open"}
        />
        <StatTile
          label="Not yet dispatched"
          value={s.outgoing.notYetDispatched}
          href={`/outward${q("Not yet dispatched")}`}
          tone={when(s.outgoing.notYetDispatched, "awaiting")}
          sub={`${s.outgoing.dispatchOverdue} past dispatch target`}
        />
        <StatTile
          label="Replies overdue to us"
          value={s.outgoing.responseOverdue}
          href={`/outward${q("Response overdue")}`}
          tone={when(s.outgoing.responseOverdue, "overdue")}
          sub={`${plural(s.outgoing.responsesReceived, "response")} received`}
        />
        <StatTile
          label="Files out"
          value={s.files.outWithOfficers}
          href={can(user, "files.read") ? "/files?out=1" : undefined}
          tone={
            s.files.overdue > 0
              ? "overdue"
              : when(s.files.outWithOfficers, "awaiting")
          }
          sub={`${s.files.overdue} past return date`}
        />
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel
          title="Needs attention"
          link={
            printing
              ? { href: "/pending", label: "Open Pending Actions" }
              : undefined
          }
        >
          {attention.length === 0 ? (
            <p className="text-text-muted px-[22px] pb-5 text-sm">
              Nothing is late or past its target.
            </p>
          ) : (
            <ul className="space-y-3 px-[22px] pb-[22px]">
              {attention.map((a) => (
                <li key={a.key}>
                  <AttentionItem item={a} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <DeskVolume data={months} />
      </div>

      <Panel
        title="Recent activity"
        link={{ href: "/inward", label: "View registers" }}
        className="mt-5 pb-2"
      >
        <DataTable
          label="Recent activity"
          rows={recent}
          rowKey={(r) => r.id}
          empty="Nothing logged yet."
          columns={[
            {
              header: "Number",
              cell: (r) => (
                <Link
                  href={r.href}
                  className="hover:text-accent rounded font-mono text-[13px] font-medium whitespace-nowrap hover:underline"
                >
                  {r.number}
                </Link>
              ),
            },
            { header: "Party", cell: (r) => r.party, className: "font-medium" },
            {
              header: "Type",
              cell: (r) => r.type,
              className: "text-text-muted",
            },
            {
              header: "Date",
              cell: (r) => (
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {formatDate(r.date)}
                  {r.deemed && (
                    <span
                      title="Deemed receipt date (para 10(3))"
                      className="border-gold/40 text-gold rounded border px-1.5 text-[11px]"
                    >
                      deemed
                    </span>
                  )}
                </span>
              ),
            },
            {
              header: "Status",
              cell: (r) => <StatusBadge status={r.status} flags={r.flags} />,
            },
          ]}
        />
      </Panel>

      {printing && (
        // PRINT/SAVE SLIP: defaults to the latest item (SPEC §7).
        <Panel title="Acknowledgement slip" className="mt-5">
          <form
            action="/slip"
            method="get"
            target="_blank"
            className="flex flex-wrap items-end gap-3 px-[22px] pb-[22px]"
          >
            <label className="block min-w-[16rem] flex-1 text-sm sm:max-w-sm">
              <span className="text-text-muted block">
                Acknowledgement slip for
              </span>
              <input
                name="no"
                defaultValue={latest ?? ""}
                placeholder="OGSERC/ACK/2026/00001"
                className={`${inputClass} mt-2 font-mono`}
              />
            </label>
            <button type="submit" className={buttonClass("primary")}>
              Print slip
            </button>
            <button
              type="submit"
              name="download"
              value="1"
              className={buttonClass("secondary")}
            >
              Save PDF
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}

function AttentionItem({ item }: { item: Attention }): ReactNode {
  const t = TONES[item.tone];
  return (
    <Link
      href={item.href}
      className="rounded-card bg-surface-raised hover:border-border flex gap-3.5 border border-transparent p-3.5 transition-colors"
    >
      <span
        aria-hidden
        className={`rounded-control grid h-9 w-9 shrink-0 place-items-center ${t.pill}`}
      >
        <Icon name={item.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="text-text-muted block font-mono text-[13px]">
          {item.number}
        </span>
        <span className="mt-0.5 block font-semibold">{item.title}</span>
        <span className="text-text-faint mt-0.5 block text-xs">
          {item.detail}
        </span>
      </span>
    </Link>
  );
}
