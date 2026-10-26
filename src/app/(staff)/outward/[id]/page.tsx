import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/app/_components/status";
import {
  BLANK,
  formatDate,
  formatDateTime,
  formatYesNo,
} from "@/domain/format";
import { can, canVoid } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { outwardDetail } from "@/server/read/items";
import { nameMap } from "@/server/read/names";
import { formOptions } from "@/server/read/options";
import { OUTWARD_LABELS } from "@/server/workflows/outward";
import { Detail, Flags, History, Panel } from "../../item-ui";
import {
  EditOutwardForm,
  OutwardActions,
  UpdateOutwardForm,
} from "./item-forms";

export const metadata: Metadata = { title: "Outward item · OGSERC Registry" };

export default function OutwardItemPage({
  params,
}: PageProps<"/outward/[id]">) {
  return (
    <main>
      <Link
        href="/outward"
        className="text-sm text-neutral-600 hover:underline"
      >
        ← Outward register
      </Link>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Loading…</p>}>
        <Item params={params} />
      </Suspense>
    </main>
  );
}

const text = (v: string | null | undefined) => v || BLANK;
const yn = (v: boolean | null) => (v === null ? "" : v ? "Y" : "N");

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  const d = await outwardDetail(db, user, id, appNow());
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
    documentDate: fromDbDate(row.documentDate),
    typeId: row.typeId,
    subject: row.subject,
    addressee: row.addressee,
    recipientCategoryId: row.recipientCategoryId,
    recipientContact: row.recipientContact ?? "",
    inReplyToInwardId: row.inReplyToInwardId ?? "",
    inReplyToInwardIdLabel: d.inReplyTo?.number ?? "",
    relatedOgsercNo: row.relatedOgsercNo ?? "",
    fileId: row.fileId ?? "",
    fileIdLabel: d.file?.reference ?? "",
    originatingUnitId: row.originatingUnitId,
    preparedBy: row.preparedBy ?? "",
    signedById: row.signedById ?? "",
    signatoryDesignation: row.signatoryDesignation,
    dispatchModeId: row.dispatchModeId,
    dateDispatched: fromDbDate(row.dateDispatched) ?? "",
    dispatchedById: row.dispatchedById ?? "",
    trackingRef: row.trackingRef ?? "",
    responseExpectedOverride: yn(row.responseExpectedOverride),
    responseDueOverride: fromDbDate(row.responseDueOverride) ?? "",
    remarks: row.remarks ?? "",
    deliveryConfirmed: yn(row.deliveryConfirmed),
    dateDelivered: fromDbDate(row.dateDelivered) ?? "",
    receivedByRecipient: row.receivedByRecipient ?? "",
  };

  return (
    <div className="mt-2 space-y-6">
      <header>
        <p className="text-sm text-neutral-600">Outward No.</p>
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
        <OutwardActions
          id={row.id}
          number={row.number}
          canDispatch={!row.dateDispatched}
          canDeliver={!row.deliveryConfirmed}
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
            <Detail label="Date of document">
              {formatDate(fromDbDate(row.documentDate))}
            </Detail>
            <Detail label="Document type">{row.type.name}</Detail>
            <Detail label="Subject">{row.subject}</Detail>
            <Detail label="Addressee">{row.addressee}</Detail>
            <Detail label="Recipient category">
              {row.recipientCategory.label}
            </Detail>
            <Detail label="Address / email">
              {text(row.recipientContact)}
            </Detail>
            <Detail label="In reply to">
              {d.inReplyTo ? (
                <>
                  <Link
                    href={`/inward/${d.inReplyTo.id}`}
                    className="font-mono underline"
                  >
                    {d.inReplyTo.number}
                  </Link>{" "}
                  <span className="text-neutral-600">
                    (from {d.inReplyTo.sender})
                  </span>
                </>
              ) : (
                BLANK
              )}
            </Detail>
            <Detail label="Related OGSERC No.">
              {text(row.relatedOgsercNo)}
            </Detail>
            <Detail label="File">
              {d.file ? `${d.file.reference} — ${d.file.title}` : BLANK}
            </Detail>
            <Detail label="Originating unit">{row.originatingUnit.name}</Detail>
            <Detail label="Prepared by">{text(row.preparedBy)}</Detail>
            <Detail label="Signed by">
              {row.signedBy?.name ?? row.signedByText ?? BLANK} —{" "}
              {row.signatoryDesignation}
            </Detail>
          </dl>
        </Panel>

        <Panel title="Dispatch, delivery and response">
          <dl>
            <Detail label="Dispatch mode">{row.dispatchMode.label}</Detail>
            <Detail label="Date dispatched">
              {formatDate(fromDbDate(row.dateDispatched))}
            </Detail>
            <Detail label="Dispatched by">
              {text(row.dispatchedBy?.name)}
            </Detail>
            <Detail label="Tracking ref.">{text(row.trackingRef)}</Detail>
            <Detail label="Delivery confirmed">
              {formatYesNo(row.deliveryConfirmed)}
            </Detail>
            <Detail label="Date delivered">
              {formatDate(fromDbDate(row.dateDelivered))}
            </Detail>
            <Detail label="Received by (recipient)">
              {text(row.receivedByRecipient)}
            </Detail>
            <Detail label="Response expected">
              {formatYesNo(derived.responseExpected)}
            </Detail>
            <Detail label="Response due">
              {formatDate(derived.responseDue)}
            </Detail>
            <Detail label="Response received">
              {derived.responseInward
                ? `${derived.responseInward.number} on ${formatDate(derived.responseReceivedOn)}`
                : BLANK}
            </Detail>
            <Detail label="Working days to dispatch">
              {derived.workingDaysToDispatch}
            </Detail>
            <Detail label="Remarks">{text(row.remarks)}</Detail>
          </dl>
        </Panel>
      </div>

      <Panel title="Responses received">
        {d.responses.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No inward item quotes this letter yet.
          </p>
        ) : (
          <ul className="text-sm">
            {d.responses.map((r) => (
              <li key={r.id}>
                <Link href={`/inward/${r.id}`} className="font-mono underline">
                  {r.number}
                </Link>{" "}
                from {r.sender}, deemed received{" "}
                {formatDate(fromDbDate(r.deemedReceiptDate))}
                {r.voidedAt && " (void)"}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {writable && options && (
        <Panel title="Update item">
          <UpdateOutwardForm id={row.id} options={options} values={values} />
        </Panel>
      )}

      {writable && options && can(user, "items.editAny") && (
        <details className="rounded border border-neutral-200 p-4">
          <summary className="cursor-pointer text-base font-semibold">
            Edit registered details (Head of Registry)
          </summary>
          <div className="mt-4">
            <EditOutwardForm id={row.id} options={options} values={values} />
          </div>
        </details>
      )}

      <Panel title="History">
        <History
          entries={d.history}
          labels={{
            ...OUTWARD_LABELS,
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
