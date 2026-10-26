// Scheduled jobs: what each does, when it last ran, and "Run now".
import type { Metadata } from "next";
import { Suspense } from "react";
import { formatDateTime } from "@/domain/format";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { JOBS, recentRuns } from "@/server/jobs";
import { RunButton } from "./run-button";

export const metadata: Metadata = { title: "Jobs · OGSERC Registry" };

export default function JobsPage() {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Scheduled jobs</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Jobs />
      </Suspense>
    </main>
  );
}

const CRON_EXAMPLE = [
  'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<registry-host>/api/jobs/refresh-status',
  'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<registry-host>/api/jobs/holiday-check',
  "# each morning, after the nightly backup (scripts/backup-db.sh):",
  'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<registry-host>/api/jobs/backup-check',
].join("\n");

async function Jobs() {
  await requireCan("settings.manage");
  const runs = await recentRuns(getDb());
  const configured = !!process.env.CRON_SECRET?.trim();

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(JOBS).map(([name, job]) => {
          const last = runs.find((r) => r.job === name);
          const outcome = !last
            ? "never"
            : `${formatDateTime(last.startedAt)}, ${last.ok ? "OK" : last.ok === false ? "FAILED" : "running"}`;
          return (
            <section
              key={name}
              className="rounded border border-neutral-200 p-4"
            >
              <h2 className="font-semibold">{job.title}</h2>
              <p className="mt-1 text-sm text-neutral-700">{job.description}</p>
              <p className="mt-2 text-xs text-neutral-600">
                Last run: {outcome}
              </p>
              <div className="mt-3">
                <RunButton job={name} />
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded border border-neutral-200 p-4 text-sm">
        <h2 className="mb-2 font-semibold">Running them on a schedule</h2>
        {configured ? (
          <p>
            Have the server&apos;s scheduler call each job, e.g. nightly at
            00:30 Lagos time:
          </p>
        ) : (
          <p className="bg-status-awaiting rounded p-2">
            CRON_SECRET is not set, so scheduled calls are refused. Set it in
            the server&apos;s environment first.
          </p>
        )}
        <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-2 text-xs">
          {CRON_EXAMPLE}
        </pre>
      </section>

      <h2 className="mt-6 mb-2 font-semibold">Recent runs</h2>
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-300 text-left text-neutral-600">
          <tr>
            <th className="py-1 pr-3 font-medium">Started</th>
            <th className="py-1 pr-3 font-medium">Job</th>
            <th className="py-1 pr-3 font-medium">By</th>
            <th className="py-1 pr-3 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-neutral-100 align-top">
              <td className="py-1 pr-3 whitespace-nowrap">
                {formatDateTime(r.startedAt)}
              </td>
              <td className="py-1 pr-3">{r.job}</td>
              <td className="py-1 pr-3">
                {r.triggeredBy?.name ?? "Scheduler"}
              </td>
              <td
                className={`py-1 pr-3 ${r.ok === false ? "text-red-800" : ""}`}
              >
                {r.ok === false ? "FAILED: " : ""}
                {r.summary ?? "…"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 && (
        <p className="py-4 text-sm text-neutral-600">No runs yet.</p>
      )}
    </>
  );
}
