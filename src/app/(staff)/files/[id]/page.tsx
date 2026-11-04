import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusPill } from "@/app/_components/status";
import { PageHeader } from "@/app/_components/ui/page-header";
import { formatDate, formatDateTime } from "@/domain/format";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { fileDetail } from "@/server/read/files";
import { nameMap } from "@/server/read/names";
import { formOptions } from "@/server/read/options";
import { FILE_LABELS } from "@/server/workflows/files";
import { Detail, Flags, History, Panel } from "../../item-ui";
import { IssueFileForm, ReturnFileForm, UpdateFileForm } from "../file-forms";
import { MOVEMENT_TONE } from "../movement-tone";

export const metadata: Metadata = { title: "File · OGSERC Registry" };

export default function FilePage({ params }: PageProps<"/files/[id]">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <Link
              href="/files"
              className="text-accent rounded text-sm hover:underline"
            >
              ← Internal File Desk
            </Link>
            <p className="text-text-muted mt-4">Loading…</p>
          </>
        }
      >
        <FileView params={params} />
      </Suspense>
    </main>
  );
}

const TH =
  "text-text-faint px-[22px] py-2.5 text-left text-xs font-semibold tracking-wider whitespace-nowrap uppercase";
const TD = "px-[22px] py-3";

async function FileView({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("files.read");
  const { id } = await params;
  const db = getDb();
  const d = await fileDetail(db, user, id, appNow());
  if (!d) notFound();
  const { row, derived } = d;
  const writable = can(user, "files.write");
  const options = writable ? await formOptions(db) : null;
  const names = await nameMap(db, user);
  const out = d.movements.find((m) => !m.dateReturned);
  const overdue = derived.isOut && derived.latestMovementStatus === "Overdue";

  return (
    <>
      <header>
        <PageHeader
          back={{ href: "/files", label: "Internal File Desk" }}
          title={<span className="font-mono">{row.reference}</span>}
          intro={row.title}
        />
        <p className="rounded-card border-border bg-surface mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border p-4 text-sm">
          <span>
            Currently with:{" "}
            <strong
              className={
                derived.isOut
                  ? overdue
                    ? "text-overdue"
                    : "text-awaiting"
                  : "text-closed"
              }
            >
              {derived.currentlyWith}
            </strong>
            {derived.isOut && (
              <>
                {" "}
                since {formatDate(derived.outSince)} ({derived.workingDaysOut}{" "}
                working days)
              </>
            )}
          </span>
          {derived.isOut && (
            <StatusPill tone={overdue ? "overdue" : "awaiting"}>
              {overdue ? "Overdue" : "Out"}
            </StatusPill>
          )}
        </p>
        {derived.flags.length > 0 && (
          <div className="mt-4">
            <Flags flags={derived.flags} />
          </div>
        )}
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {writable && options && (
          <aside className="space-y-5 lg:order-2">
            <Panel title="Record return">
              <ReturnFileForm
                id={row.id}
                reference={row.reference}
                holder={out?.derived.holder ?? null}
              />
            </Panel>
            <Panel title="Issue file">
              <IssueFileForm id={row.id} options={options} />
            </Panel>
          </aside>
        )}

        <div
          className={`min-w-0 space-y-5 lg:order-1 ${writable && options ? "" : "lg:col-span-2"}`}
        >
          <Panel title="File details">
            <dl>
              <Detail label="Class">{row.fileClass?.label ?? "—"}</Detail>
              <Detail label="Owning unit">{row.owningUnit?.name ?? "—"}</Detail>
              <Detail label="Security">{row.security.label}</Detail>
              <Detail label="Status">{row.fileStatus.label}</Detail>
              <Detail label="Date opened">
                {formatDate(fromDbDate(row.dateOpened))}
              </Detail>
              <Detail label="Current volume">{row.currentVolume}</Detail>
              <Detail label="Date closed / archived">
                {formatDate(fromDbDate(row.dateClosedOrArchived))}
              </Detail>
              <Detail label="Inward items">{derived.inwardCount}</Detail>
              <Detail label="Outward items">{derived.outwardCount}</Detail>
              <Detail label="Last correspondence">
                {formatDate(derived.lastCorrespondence)}
              </Detail>
              <Detail label="Remarks">{row.remarks ?? "—"}</Detail>
            </dl>
          </Panel>

          <Panel title="Movements">
            {d.movements.length === 0 ? (
              <p className="text-text-muted text-sm">
                This file has not left the Registry.
              </p>
            ) : (
              <div className="-mx-[22px] overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-border-subtle border-b">
                      {[
                        "Out",
                        "Issued to",
                        "Purpose",
                        "Return due",
                        "Returned",
                        "Days out",
                        "Status",
                      ].map((h) => (
                        <th key={h} scope="col" className={TH}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-border-subtle divide-y">
                    {d.movements.map((m) => (
                      <tr key={m.id}>
                        <td className={`${TD} whitespace-nowrap`}>
                          {formatDateTime(m.outAt)}
                        </td>
                        <td className={TD}>{m.derived.holder}</td>
                        <td className={`${TD} text-text-muted`}>
                          {m.purpose ?? "—"}
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>
                          {formatDate(m.derived.returnDue)}
                        </td>
                        <td className={TD}>
                          <span className="whitespace-nowrap">
                            {formatDate(fromDbDate(m.dateReturned))}
                          </span>
                          {m.receivedBackBy && (
                            <span className="text-text-faint block text-xs">
                              {m.receivedBackBy.name}
                            </span>
                          )}
                        </td>
                        <td className={`${TD} font-mono tabular-nums`}>
                          {m.derived.workingDaysOut}
                        </td>
                        <td className={TD}>
                          <StatusPill tone={MOVEMENT_TONE[m.derived.status]}>
                            {m.derived.status}
                          </StatusPill>
                          {m.derived.flags.length > 0 && (
                            <span className="text-flagged mt-1 block text-xs">
                              {m.derived.flags.join("; ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Letters on this file">
            {d.inward.length + d.outward.length === 0 ? (
              <p className="text-text-muted text-sm">None yet.</p>
            ) : (
              <ul className="divide-border-subtle divide-y text-sm">
                {[
                  ...d.inward.map((i) => ({
                    id: i.id,
                    href: `/inward/${i.id}`,
                    number: i.number,
                    party: i.sender,
                    subject: i.subject,
                    voided: i.voidedAt !== null,
                  })),
                  ...d.outward.map((o) => ({
                    id: o.id,
                    href: `/outward/${o.id}`,
                    number: o.number,
                    party: o.addressee,
                    subject: o.subject,
                    voided: o.voidedAt !== null,
                  })),
                ].map((l) => (
                  <li key={l.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={l.href}
                      className="text-accent font-mono text-[13px] hover:underline"
                    >
                      {l.number}
                    </Link>
                    {l.voided && (
                      <span className="text-text-faint ml-2 text-xs">
                        (void)
                      </span>
                    )}
                    <span className="block">
                      <span className="font-medium">{l.party}</span>
                      <span className="text-text-muted"> — {l.subject}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {writable && options && (
            <details className="group rounded-panel border-border-subtle bg-surface border">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-[22px] py-3 font-semibold">
                Update file details
                <span
                  aria-hidden
                  className="text-text-muted text-lg font-normal transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="px-[22px] pb-[22px]">
                <UpdateFileForm
                  id={row.id}
                  options={options}
                  values={{
                    title: row.title,
                    fileClassId: row.fileClassId ?? "",
                    owningUnitId: row.owningUnitId ?? "",
                    securityId: row.securityId,
                    dateOpened: fromDbDate(row.dateOpened),
                    currentVolume: String(row.currentVolume),
                    fileStatusId: row.fileStatusId,
                    dateClosedOrArchived:
                      fromDbDate(row.dateClosedOrArchived) ?? "",
                    remarks: row.remarks ?? "",
                  }}
                />
              </div>
            </details>
          )}

          <Panel title="History">
            <History
              entries={d.history}
              labels={{
                ...FILE_LABELS,
                holder: "Holder",
                outAt: "Out",
                unit: "Unit",
                issuedWhileOut: "Issued while still out",
              }}
              names={names}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
