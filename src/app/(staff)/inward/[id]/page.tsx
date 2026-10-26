import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/app/_components/status";
import { dateIn } from "@/domain/clock";
import {
  BLANK,
  formatTime,
  formatDate,
  formatDateTime,
  formatNaira,
  formatYesNo,
} from "@/domain/format";
import { can, canVoid } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { inwardDetail } from "@/server/read/items";
import { nameMap } from "@/server/read/names";
import { formOptions } from "@/server/read/options";
import { INWARD_LABELS } from "@/server/workflows/inward";
import { Detail, Flags, History, Panel } from "../../item-ui";
import { EditInwardForm, InwardActions, UpdateInwardForm } from "./item-forms";

export const metadata: Metadata = { title: "Inward item · OGSERC Registry" };

export default function InwardItemPage({ params }: PageProps<"/inward/[id]">) {
  return (
    <main>
      <Link href="/inward" className="text-sm text-neutral-600 hover:underline">
        ← Inward register
      </Link>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Loading…</p>}>
        <Item params={params} />
      </Suspense>
    </main>
  );
}

const text = (v: string | null | undefined) => v || BLANK;

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  const d = await inwardDetail(db, user, id, appNow());
  if (!d) notFound();
  const { row, derived } = d;
  const voided = row.voidedAt !== null;
  const writable = can(user, "registers.write") && !voided;
  const settings = await db.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  const options = writable ? await formOptions(db) : null;
  const names = await nameMap(db, user);

  const values: Record<string, string> = {
    receivedDate: dateIn(row.receivedAt),
    receivedTime: formatTime(row.receivedAt),
    modeId: row.modeId,
    typeId: row.typeId,
    sender: row.sender,
    senderCategoryId: row.senderCategoryId,
    subject: row.subject,
    senderRef: row.senderRef ?? "",
    documentDate: fromDbDate(row.documentDate) ?? "",
    relatedOgsercNo: row.relatedOgsercNo ?? "",
    inResponseToOutwardId: row.inResponseToOutwardId ?? "",
    inResponseToOutwardIdLabel: row.inResponseToOutward?.number ?? "",
    cacNo: row.cacNo ?? "",
    principalLgaId: row.principalLgaId ?? "",
    contactPerson: row.contactPerson ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    deliveredBy: row.deliveredBy ?? "",
    volumes: row.volumes?.toString() ?? "",
    schedule2DocsAttached: row.schedule2DocsAttached?.toString() ?? "",
    feeEvidenceAttached:
      row.feeEvidenceAttached === null
        ? ""
        : row.feeEvidenceAttached
          ? "Y"
          : "N",
    paymentRef: row.paymentRef ?? "",
    amountShown:
      row.amountShownKobo === null
        ? ""
        : formatNaira(row.amountShownKobo).slice(1),
    multiState: row.multiState ? "on" : "",
    receivedById: row.receivedById,
    fileId: row.fileId ?? "",
    fileIdLabel: d.file?.reference ?? "",
    unitOverrideId: row.unitOverrideId ?? "",
    ackIssuedViaId: row.ackIssuedViaId,
    actionRequiredId: row.actionRequiredId,
    priorityId: row.priorityId ?? "",
    actionOfficer: row.actionOfficer ?? "",
    responseDueOverride: fromDbDate(row.responseDueOverride) ?? "",
    remarks: row.remarks ?? "",
    dateForwarded: fromDbDate(row.dateForwarded) ?? "",
    receivedByUnitOfficer: row.receivedByUnitOfficer ?? "",
    dateClosedManual: fromDbDate(row.dateClosedManual) ?? "",
    closingNote: row.closingNote ?? "",
  };

  return (
    <div className="mt-2 space-y-6">
      <header>
        <p className="text-sm text-neutral-600">Inward / Ack. No.</p>
        <h1 className="flex flex-wrap items-center gap-3 font-mono text-2xl font-semibold">
          {row.number}
          <StatusBadge status={derived.status} flags={derived.flags} />
        </h1>
        {voided && (
          <p className="mt-2 rounded bg-neutral-100 p-3 text-sm">
            Voided {formatDateTime(row.voidedAt)} by {row.voidedBy?.name}:{" "}
            {row.voidReason}
          </p>
        )}
        <Flags flags={derived.flags} />
      </header>

      {writable && (
        <InwardActions
          id={row.id}
          number={row.number}
          canForward={!row.dateForwarded && derived.status !== "Closed"}
          canClose={derived.status !== "Closed"}
          canVoid={canVoid(
            user,
            { createdById: row.createdById, voided },
            settings.headMayVoidOwnItems,
          )}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Registered details">
          <dl>
            <Detail label="Date & time received">
              {formatDateTime(row.receivedAt)}
            </Detail>
            <Detail label="Deemed receipt date">
              {formatDate(derived.deemedReceiptDate)}
            </Detail>
            <Detail label="Mode of receipt">{row.mode.label}</Detail>
            <Detail label="Type">{row.type.name}</Detail>
            <Detail label="Category">{text(derived.category)}</Detail>
            <Detail label="Order reference">{text(derived.orderRef)}</Detail>
            <Detail label="Sender">{row.sender}</Detail>
            <Detail label="Sender category">{row.senderCategory.label}</Detail>
            <Detail label="Subject">{row.subject}</Detail>
            <Detail label="Sender's ref. no.">{text(row.senderRef)}</Detail>
            <Detail label="Date of the letter">
              {formatDate(fromDbDate(row.documentDate))}
            </Detail>
            <Detail label="Related OGSERC No.">
              {text(row.relatedOgsercNo)}
            </Detail>
            <Detail label="In response to our ref.">
              {row.inResponseToOutward &&
              names.has(row.inResponseToOutward.id) ? (
                <Link
                  href={`/outward/${row.inResponseToOutward.id}`}
                  className="font-mono underline"
                >
                  {row.inResponseToOutward.number}
                </Link>
              ) : (
                BLANK
              )}
            </Detail>
            <Detail label="CAC No.">{text(row.cacNo)}</Detail>
            <Detail label="Principal LGA">
              {text(row.principalLga?.label)}
            </Detail>
            <Detail label="Contact">
              {[row.contactPerson, row.phone, row.email]
                .filter(Boolean)
                .join(" · ") || BLANK}
            </Detail>
            <Detail label="Delivered / sent by">{text(row.deliveredBy)}</Detail>
            <Detail label="Files / volumes">{row.volumes ?? BLANK}</Detail>
            <Detail label="Schedule 2 documents">
              {row.schedule2DocsAttached ?? BLANK}
            </Detail>
            <Detail label="Fee evidence attached">
              {formatYesNo(row.feeEvidenceAttached)}
            </Detail>
            <Detail label="Payment reference">{text(row.paymentRef)}</Detail>
            <Detail label="Amount shown">
              {formatNaira(row.amountShownKobo)}
            </Detail>
            <Detail label="Received by">{row.receivedBy.name}</Detail>
            <Detail label="File">
              {d.file ? `${d.file.reference} — ${d.file.title}` : BLANK}
            </Detail>
          </dl>
        </Panel>

        <Panel title="Handling and status">
          <dl>
            <Detail label="Forward to">{row.routedUnit.name}</Detail>
            <Detail label="Acknowledgement issued via">
              {row.ackIssuedVia.label}
            </Detail>
            <Detail label="Action required">{row.actionRequired.label}</Detail>
            <Detail label="Priority">{row.priority?.label ?? "Normal"}</Detail>
            <Detail label="Action officer">{text(row.actionOfficer)}</Detail>
            <Detail label="Date forwarded">
              {formatDate(fromDbDate(row.dateForwarded))}
            </Detail>
            <Detail label="Received in unit by">
              {text(row.receivedByUnitOfficer)}
            </Detail>
            <Detail label="Response due">
              {formatDate(derived.responseDue)}
            </Detail>
            <Detail label="Closed on">
              {formatDate(derived.closedOn)}
              {derived.replyOutward && ` (by ${derived.replyOutward.number})`}
              {row.dateClosedManual &&
                row.closingNote &&
                ` — ${row.closingNote}`}
            </Detail>
            <Detail label="Working days at Registry">
              {derived.workingDaysAtRegistry}
            </Detail>
            <Detail label="Working days open">{derived.workingDaysOpen}</Detail>
            <Detail label="Closed on time">
              {formatYesNo(derived.closedOnTime)}
            </Detail>
            {derived.filedAfterRegistrationDeadline !== null && (
              <Detail label="Filed after registration deadline">
                {formatYesNo(derived.filedAfterRegistrationDeadline)}
              </Detail>
            )}
            <Detail label="Remarks">{text(row.remarks)}</Detail>
          </dl>
        </Panel>
      </div>

      <Panel title="Replies and linked letters">
        {d.replies.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No outward letter quotes this item yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-600">
              <tr>
                <th className="py-1 pr-3 font-medium">Outward No.</th>
                <th className="py-1 pr-3 font-medium">Type</th>
                <th className="py-1 pr-3 font-medium">Subject</th>
                <th className="py-1 pr-3 font-medium">Closes this item?</th>
                <th className="py-1 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.replies.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="py-1 pr-3 font-mono">
                    <Link href={`/outward/${r.id}`} className="underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="py-1 pr-3">{r.type}</td>
                  <td className="py-1 pr-3">{r.subject}</td>
                  <td className="py-1 pr-3">
                    {r.closesInwardItem
                      ? "Yes, once dispatched"
                      : "No (holding reply)"}
                  </td>
                  <td className="py-1 pr-3">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {writable && options && (
        <Panel title="Update item">
          <UpdateInwardForm id={row.id} options={options} values={values} />
        </Panel>
      )}

      {writable && options && can(user, "items.editAny") && (
        <details className="rounded border border-neutral-200 p-4">
          <summary className="cursor-pointer text-base font-semibold">
            Edit registered details (Head of Registry)
          </summary>
          <div className="mt-4">
            <EditInwardForm id={row.id} options={options} values={values} />
          </div>
        </details>
      )}

      <Panel title="History">
        <History
          entries={d.history}
          labels={{
            ...INWARD_LABELS,
            voidedAt: "Voided",
            voidedById: "Voided by",
            voidReason: "Void reason",
          }}
          names={names}
        />
      </Panel>
    </div>
  );
}
