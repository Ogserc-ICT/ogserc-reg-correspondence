import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
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

export const metadata: Metadata = { title: "File · OGSERC Registry" };

export default function FilePage({ params }: PageProps<"/files/[id]">) {
  return (
    <main>
      <Link href="/files" className="text-sm text-neutral-600 hover:underline">
        ← File Desk
      </Link>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Loading…</p>}>
        <FileView params={params} />
      </Suspense>
    </main>
  );
}

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

  return (
    <div className="mt-2 space-y-6">
      <header>
        <p className="text-sm text-neutral-600">File</p>
        <h1 className="font-mono text-2xl font-semibold">{row.reference}</h1>
        <p className="text-lg">{row.title}</p>
        <p className="mt-2 text-sm">
          Currently with:{" "}
          <strong
            className={`rounded px-1.5 py-0.5 ${derived.isOut ? (derived.latestMovementStatus === "Overdue" ? "bg-status-overdue" : "bg-status-awaiting") : "bg-status-closed"}`}
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
        </p>
        <Flags flags={derived.flags} />
      </header>

      {writable && options && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Issue file">
            <IssueFileForm id={row.id} options={options} />
          </Panel>
          <Panel title="Record return">
            <ReturnFileForm
              id={row.id}
              reference={row.reference}
              holder={out?.derived.holder ?? null}
            />
          </Panel>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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

        <Panel title="Letters on this file">
          {d.inward.length + d.outward.length === 0 ? (
            <p className="text-sm text-neutral-600">None yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.inward.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/inward/${i.id}`}
                    className="font-mono underline"
                  >
                    {i.number}
                  </Link>{" "}
                  {i.sender} — {i.subject}
                  {i.voidedAt && " (void)"}
                </li>
              ))}
              {d.outward.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/outward/${o.id}`}
                    className="font-mono underline"
                  >
                    {o.number}
                  </Link>{" "}
                  {o.addressee} — {o.subject}
                  {o.voidedAt && " (void)"}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Movements">
        {d.movements.length === 0 ? (
          <p className="text-sm text-neutral-600">
            This file has not left the Registry.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-600">
              <tr>
                <th className="py-1 pr-3 font-medium">Out</th>
                <th className="py-1 pr-3 font-medium">Issued to</th>
                <th className="py-1 pr-3 font-medium">Purpose</th>
                <th className="py-1 pr-3 font-medium">Return due</th>
                <th className="py-1 pr-3 font-medium">Returned</th>
                <th className="py-1 pr-3 font-medium">Days out</th>
                <th className="py-1 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.movements.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-neutral-100 align-top"
                >
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {formatDateTime(m.outAt)}
                  </td>
                  <td className="py-1 pr-3">{m.derived.holder}</td>
                  <td className="py-1 pr-3">{m.purpose ?? "—"}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {formatDate(m.derived.returnDue)}
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {formatDate(fromDbDate(m.dateReturned))}
                    {m.receivedBackBy && ` (${m.receivedBackBy.name})`}
                  </td>
                  <td className="py-1 pr-3">{m.derived.workingDaysOut}</td>
                  <td className="py-1 pr-3">
                    {m.derived.status}
                    {m.derived.flags.length > 0 && (
                      <span className="bg-status-flagged ml-1 rounded px-1 text-xs">
                        {m.derived.flags.join("; ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {writable && options && (
        <details className="rounded border border-neutral-200 p-4">
          <summary className="cursor-pointer text-base font-semibold">
            Update file details
          </summary>
          <div className="mt-4">
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
  );
}
