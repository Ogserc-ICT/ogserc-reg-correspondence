// Daily Register (SPEC §8.2): pick a date (default today), check it on
// screen, then print or save the PDF for sign-off.
import type { Metadata } from "next";
import { Suspense } from "react";
import { inputClass } from "@/app/_components/form";
import { isIsoDate } from "@/domain/calendar";
import { todayIn } from "@/domain/clock";
import { formatDate, formatTime } from "@/domain/format";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { dailyRegister } from "@/server/read/reports";

export const metadata: Metadata = { title: "Daily Register · OGSERC Registry" };

export default function DailyPage({ searchParams }: PageProps<"/daily">) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Daily Register</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Daily searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Daily({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("reports.print");
  const sp = await searchParams;
  const asked = typeof sp.date === "string" ? sp.date : "";
  const date = isIsoDate(asked) ? asked : todayIn(appNow());
  const d = await dailyRegister(getDb(), user, date);
  const pdf = `/daily/pdf?date=${date}`;

  return (
    <>
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 text-sm"
      >
        <label>
          <span className="block text-xs text-neutral-600">Date</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className={inputClass}
          />
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
          href={`${pdf}&download=1`}
          className="rounded border border-neutral-300 px-4 py-2"
        >
          Save PDF
        </a>
      </form>

      <p className="mb-4 text-sm">
        <strong>{formatDate(date)}</strong> · Items received:{" "}
        {d.received.length} · Items dispatched: {d.dispatched.length}
      </p>

      <h2 className="mt-6 mb-2 font-semibold">Received</h2>
      {d.received.length === 0 ? (
        <p className="text-sm text-neutral-600">None.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-neutral-600">
            <tr>
              <th className="py-1 pr-3 font-medium">#</th>
              <th className="py-1 pr-3 font-medium">Inward No.</th>
              <th className="py-1 pr-3 font-medium">Time</th>
              <th className="py-1 pr-3 font-medium">Mode</th>
              <th className="py-1 pr-3 font-medium">Sender</th>
              <th className="py-1 pr-3 font-medium">Subject</th>
              <th className="py-1 pr-3 font-medium">Forward to</th>
            </tr>
          </thead>
          <tbody>
            {d.received.map((r, i) => (
              <tr key={r.id} className="border-b border-neutral-100">
                <td className="py-1 pr-3">{i + 1}</td>
                <td className="py-1 pr-3 font-mono">{r.number}</td>
                <td className="py-1 pr-3">{formatTime(r.receivedAt)}</td>
                <td className="py-1 pr-3">{r.mode.label}</td>
                <td className="py-1 pr-3">{r.sender}</td>
                <td className="py-1 pr-3">{r.subject}</td>
                <td className="py-1 pr-3">{r.routedUnit.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mt-6 mb-2 font-semibold">Dispatched</h2>
      {d.dispatched.length === 0 ? (
        <p className="text-sm text-neutral-600">None.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-neutral-600">
            <tr>
              <th className="py-1 pr-3 font-medium">#</th>
              <th className="py-1 pr-3 font-medium">Outward No.</th>
              <th className="py-1 pr-3 font-medium">Addressee</th>
              <th className="py-1 pr-3 font-medium">Subject</th>
              <th className="py-1 pr-3 font-medium">Dispatch mode</th>
              <th className="py-1 pr-3 font-medium">Originating unit</th>
            </tr>
          </thead>
          <tbody>
            {d.dispatched.map((r, i) => (
              <tr key={r.id} className="border-b border-neutral-100">
                <td className="py-1 pr-3">{i + 1}</td>
                <td className="py-1 pr-3 font-mono">{r.number}</td>
                <td className="py-1 pr-3">{r.addressee}</td>
                <td className="py-1 pr-3">{r.subject}</td>
                <td className="py-1 pr-3">{r.dispatchMode.label}</td>
                <td className="py-1 pr-3">{r.originatingUnit.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
