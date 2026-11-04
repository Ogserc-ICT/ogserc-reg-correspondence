import { signerName } from "@/domain/outward";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/app/_components/status";
import { BLANK, formatDate, formatYesNo } from "@/domain/format";
import { can, canVoid } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireRegisterReader } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { outwardDetail } from "@/server/read/items";
import { nameMap } from "@/server/read/names";
import { formOptions } from "@/server/read/options";
import { OUTWARD_LABELS } from "@/server/workflows/outward";
import { DetailList } from "@/app/_components/ui/detail-drawer";
import { PageHeader } from "@/app/_components/ui/page-header";
import { loadRules } from "@/server/rules";
import {
  Detail,
  Flags,
  History,
  Panel,
  SubHeading,
  VoidedNote,
} from "../../item-ui";
import { OutwardTimeline } from "../outward-timeline";
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
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <Link
              href="/outward"
              className="text-accent rounded text-sm hover:underline"
            >
              ← Outward Register
            </Link>
            <p className="text-text-muted mt-4">Loading…</p>
          </>
        }
      >
        <Item params={params} />
      </Suspense>
    </main>
  );
}

const text = (v: string | null | undefined) => v || BLANK;
const yn = (v: boolean | null) => (v === null ? "" : v ? "Y" : "N");

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRegisterReader();
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
    signatoryId: row.signatoryId ?? "",
    signedByText: row.signedByText ?? "",
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

  const rules = await loadRules(db);

  return (
    <>
      <PageHeader
        back={{ href: "/outward", label: "Outward Register" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{row.number}</span>
            <StatusBadge status={derived.status} flags={derived.flags} />
          </span>
        }
        intro={`${row.type.name} · ${row.addressee}`}
      />
      {derived.flags.length > 0 && (
        <div className="mt-4">
          <Flags flags={derived.flags} />
        </div>
      )}
      {voided && (
        <div className="mt-4">
          <VoidedNote
            at={row.voidedAt}
            by={row.voidedBy?.name}
            reason={row.voidReason}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="space-y-5 lg:order-2">
          <section className="rounded-panel border-border bg-surface border p-[22px]">
            <DetailList
              items={[
                {
                  label: "Dated",
                  value: formatDate(fromDbDate(row.documentDate)),
                },
                {
                  label: "Sent",
                  value: formatDate(fromDbDate(row.dateDispatched)),
                },
                { label: "From unit", value: row.originatingUnit.name },
                {
                  label: "Reply due",
                  value: formatDate(derived.responseDue),
                  tone:
                    derived.status === "Response overdue"
                      ? "text-overdue"
                      : undefined,
                },
              ]}
            />
            {writable && (
              <div className="border-border-subtle mt-5 border-t pt-5">
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
              </div>
            )}
          </section>
          <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
            <SubHeading>Timeline</SubHeading>
            <OutwardTimeline
              row={{
                documentDate: fromDbDate(row.documentDate),
                dateDispatched: fromDbDate(row.dateDispatched),
                dateDelivered: fromDbDate(row.dateDelivered),
                deliveryConfirmed: row.deliveryConfirmed,
                dispatchMode: row.dispatchMode,
                dispatchedBy: row.dispatchedBy,
                signer: signerName(row) ?? BLANK,
                voided,
              }}
              derived={derived}
              dispatchTargetDays={rules.dispatchTargetDays}
              needsDeliveryProof={
                !rules.noDeliveryConfirmationModes.includes(row.dispatchModeId)
              }
            />
          </section>
        </aside>

        <div className="min-w-0 space-y-5 lg:order-1">
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
                      className="text-accent font-mono text-[13px] hover:underline"
                    >
                      {d.inReplyTo.number}
                    </Link>{" "}
                    <span className="text-text-muted">
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
                {d.file ? (
                  <Link
                    href={`/files/${d.file.id}`}
                    className="text-accent hover:underline"
                  >
                    <span className="font-mono text-[13px]">
                      {d.file.reference}
                    </span>{" "}
                    — {d.file.title}
                  </Link>
                ) : (
                  BLANK
                )}
              </Detail>
              <Detail label="Originating unit">
                {row.originatingUnit.name}
              </Detail>
              {/* SPEC-v2 C7: division from the originating unit. */}
              <Detail label="Division">
                {row.originatingUnit.division?.name ?? BLANK}
              </Detail>
              <Detail label="Prepared by">{text(row.preparedBy)}</Detail>
              <Detail label="Signed by">
                {signerName(row) ?? BLANK} — {row.signatoryDesignation}
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

          <Panel title="Responses received">
            {d.responses.length === 0 ? (
              <p className="text-text-muted text-sm">
                No inward item quotes this letter yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.responses.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/inward/${r.id}`}
                      className="text-accent font-mono text-[13px] hover:underline"
                    >
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
              <UpdateOutwardForm
                id={row.id}
                options={options}
                values={values}
              />
            </Panel>
          )}

          {writable && options && can(user, "items.editAny") && (
            <details className="group rounded-panel border-border-subtle bg-surface border">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-[22px] py-3">
                <span className="font-semibold">
                  Edit registered details{" "}
                  <span className="text-text-muted font-normal">
                    (Head of Registry)
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-text-muted text-lg transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="px-[22px] pb-[22px]">
                <EditOutwardForm
                  id={row.id}
                  options={options}
                  values={values}
                />
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
      </div>
    </>
  );
}
