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
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="mb-6 text-[28px] font-semibold tracking-tight">
        Scheduled jobs
      </h1>
      <Suspense fallback={<p className="text-text-faint">Loading…</p>}>
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
              className="rounded-panel border-border-subtle bg-surface border p-[22px]"
            >
              <h2 className="font-semibold">{job.title}</h2>
              <p className="text-text-muted mt-1 text-sm">{job.description}</p>
              <p className="text-text-muted mt-2 text-xs">
                Last run: {outcome}
              </p>
              <div className="mt-3">
                <RunButton job={name} />
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-panel border-border-subtle bg-surface mt-6 border p-[22px] text-sm">
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
        <pre className="rounded-control border-border bg-input mt-2 overflow-x-auto border p-3 text-xs">
          {CRON_EXAMPLE}
        </pre>
      </section>

      <section className="rounded-panel border-border-subtle bg-surface mt-6 overflow-x-auto border p-[22px]">
        <h2 className="mb-3 font-semibold">Recent runs</h2>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-border-subtle text-text-faint border-b text-left text-xs tracking-wider uppercase">
            <tr>
              <th className="py-1 pr-3 font-semibold">Started</th>
              <th className="py-1 pr-3 font-semibold">Job</th>
              <th className="py-1 pr-3 font-semibold">By</th>
              <th className="py-1 pr-3 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr
                key={r.id}
                className="border-border-subtle border-b align-top"
              >
                <td className="py-1 pr-3 whitespace-nowrap">
                  {formatDateTime(r.startedAt)}
                </td>
                <td className="py-1 pr-3">{r.job}</td>
                <td className="py-1 pr-3">
                  {r.triggeredBy?.name ?? "Scheduler"}
                </td>
                <td
                  className={`py-1 pr-3 ${r.ok === false ? "text-overdue" : ""}`}
                >
                  {r.ok === false ? "FAILED: " : ""}
                  {r.summary ?? "…"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && (
          <p className="text-text-muted py-4 text-sm">No runs yet.</p>
        )}
      </section>
    </>
  );
}
