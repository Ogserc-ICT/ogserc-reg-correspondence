// Registry Desk (SPEC §8.4 tiles, §7 buttons). Counts are within the user's
// scope, so a unit officer sees their unit's figures.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/domain/format";
import { can, ROLE_LABELS } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { loadDashboard } from "@/server/dashboard";
import { getDb } from "@/server/db";
import { latestInwardNumber } from "@/server/read/reports";
import { inputClass } from "@/app/_components/form";
import { todayIn } from "@/domain/clock";

export const metadata: Metadata = { title: "Registry Desk · OGSERC Registry" };

export default function Desk() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Registry Desk</h1>
      <Suspense fallback={<p className="mt-2 text-neutral-500">Loading…</p>}>
        <DeskContent />
      </Suspense>
    </main>
  );
}

function Tile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href?: string;
  tone?: string;
}) {
  const body = (
    <>
      <span className="block text-3xl font-semibold">{value}</span>
      <span className="block text-sm text-neutral-700">{label}</span>
    </>
  );
  const cls = `block rounded border border-neutral-200 p-4 ${value > 0 && tone ? tone : ""}`;
  return href ? (
    <Link href={href} className={`${cls} hover:border-neutral-400`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

async function DeskContent() {
  const user = await requireUser();
  const now = appNow();
  const today = todayIn(now);
  const db = getDb();
  const s = await loadDashboard(db, now, user);
  const printing = can(user, "reports.print");
  const latest = printing ? await latestInwardNumber(db, user) : null;
  const q = (status: string) => `?status=${encodeURIComponent(status)}`;

  return (
    <>
      <p className="mt-1 mb-6 text-sm text-neutral-600">
        {formatDate(today)} · Officer on duty: {user.name} (
        {ROLE_LABELS[user.role]})
      </p>

      {can(user, "registers.write") && (
        <div className="mb-8 flex flex-wrap gap-3">
          <Link
            href="/inward/new"
            className="bg-brand-green rounded px-4 py-2 text-white"
          >
            New inward item
          </Link>
          <Link
            href="/outward/new"
            className="bg-brand-green rounded px-4 py-2 text-white"
          >
            New outward item
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Tile label="Received today" value={s.incoming.receivedToday} />
        <Tile label="Dispatched today" value={s.outgoing.dispatchedToday} />
        <Tile
          label="Awaiting forwarding"
          value={s.incoming.awaitingForwarding}
          href={`/inward${q("Awaiting forwarding")}`}
          tone="bg-status-awaiting"
        />
        <Tile
          label="Incoming overdue"
          value={s.incoming.responseOverdue}
          href={`/inward${q("Overdue")}`}
          tone="bg-status-overdue"
        />
        <Tile
          label="Not yet dispatched"
          value={s.outgoing.notYetDispatched}
          href={`/outward${q("Not yet dispatched")}`}
          tone="bg-status-awaiting"
        />
        <Tile
          label="Replies overdue to us"
          value={s.outgoing.responseOverdue}
          href={`/outward${q("Response overdue")}`}
          tone="bg-status-overdue"
        />
        <Tile
          label="Files out"
          value={s.files.outWithOfficers}
          href={can(user, "files.read") ? "/files?out=1" : undefined}
          tone={
            s.files.overdue > 0 ? "bg-status-overdue" : "bg-status-awaiting"
          }
        />
      </div>

      {printing && (
        // PRINT/SAVE SLIP: defaults to the latest item (SPEC §7).
        <form
          action="/slip"
          method="get"
          target="_blank"
          className="mt-8 flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-4 text-sm"
        >
          <label>
            <span className="block text-xs text-neutral-600">
              Acknowledgement slip for
            </span>
            <input
              name="no"
              defaultValue={latest ?? ""}
              placeholder="OGSERC/ACK/2026/00001"
              className={`${inputClass} font-mono`}
            />
          </label>
          <button
            type="submit"
            className="bg-brand-green rounded px-4 py-2 text-white"
          >
            Print slip
          </button>
          <button
            type="submit"
            name="download"
            value="1"
            className="rounded border border-neutral-300 px-4 py-2"
          >
            Save PDF
          </button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/inward" className="underline">
          Inward register
        </Link>
        <Link href="/outward" className="underline">
          Outward register
        </Link>
        {printing && (
          <>
            <Link href="/pending" className="underline">
              Pending Actions
            </Link>
            <Link href="/daily" className="underline">
              Daily Register
            </Link>
          </>
        )}
      </div>
    </>
  );
}
