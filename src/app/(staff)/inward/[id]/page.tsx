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
import { buttonClass } from "@/app/_components/ui/button";
import { DetailList } from "@/app/_components/ui/detail-drawer";
import { PageHeader } from "@/app/_components/ui/page-header";
import {
  Detail,
  Flags,
  History,
  Panel,
  SubHeading,
  VoidedNote,
} from "../../item-ui";
import { InwardTimeline } from "../inward-timeline";
import { EditInwardForm, InwardActions, UpdateInwardForm } from "./item-forms";

export const metadata: Metadata = { title: "Inward item · OGSERC Registry" };

export default function InwardItemPage({ params }: PageProps<"/inward/[id]">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <Link
              href="/inward"
              className="text-accent rounded text-sm hover:underline"
            >
              ← Inward Register
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

  const slipLinks = can(user, "reports.print") && (
    <>
      <a
        href={`/inward/${row.id}/slip`}
        target="_blank"
        rel="noopener"
        className={buttonClass("secondary")}
      >
        Print slip
      </a>
      <a
        href={`/inward/${row.id}/slip?download=1`}
        className={buttonClass("ghost")}
      >
        Save slip PDF
      </a>
    </>
  );

  return (
    <>
      <PageHeader
        back={{ href: "/inward", label: "Inward Register" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{row.number}</span>
            <StatusBadge status={derived.status} flags={derived.flags} />
          </span>
        }
        intro={`${row.type.name} · ${row.sender}`}
        actions={slipLinks || undefined}
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
                  label: "Deemed received",
                  value: formatDate(derived.deemedReceiptDate),
                  tone: derived.afterHoursOrNonWorkingDay
                    ? "text-gold"
                    : undefined,
                },
                {
                  label: "Due",
                  value: formatDate(derived.responseDue),
                  tone:
                    derived.status === "Overdue" ? "text-overdue" : undefined,
                },
                { label: "Routed to", value: row.routedUnit.name },
              ]}
            />
            {writable && (
              <div className="border-border-subtle mt-5 border-t pt-5">
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
              </div>
            )}
          </section>
          <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
            <SubHeading>Timeline</SubHeading>
            <InwardTimeline
              row={row}
              derived={derived}
              forwarded={fromDbDate(row.dateForwarded)}
              forwardingTargetDays={settings.registryForwardingTargetDays}
            />
          </section>
        </aside>

        <div className="min-w-0 space-y-5 lg:order-1">
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
              <Detail label="Sender category">
                {row.senderCategory.label}
              </Detail>
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
                    className="text-accent font-mono text-[13px] hover:underline"
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
              <Detail label="Delivered / sent by">
                {text(row.deliveredBy)}
              </Detail>
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
            </dl>
          </Panel>

          <Panel title="Handling and status">
            <dl>
              <Detail label="Forward to">{row.routedUnit.name}</Detail>
              <Detail label="Acknowledgement issued via">
                {row.ackIssuedVia.label}
              </Detail>
              <Detail label="Action required">
                {row.actionRequired.label}
              </Detail>
              <Detail label="Priority">
                {row.priority?.label ?? "Normal"}
              </Detail>
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
              <Detail label="Working days open">
                {derived.workingDaysOpen}
              </Detail>
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

          <Panel title="Replies and linked letters">
            {d.replies.length === 0 ? (
              <p className="text-text-muted text-sm">
                No outward letter quotes this item yet.
              </p>
            ) : (
              <div className="-mx-[22px] overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-text-faint border-border-subtle border-b text-left text-xs tracking-wider uppercase">
                    <tr>
                      <th
                        scope="col"
                        className="px-[22px] py-2.5 font-semibold"
                      >
                        Outward No.
                      </th>
                      <th
                        scope="col"
                        className="px-[22px] py-2.5 font-semibold"
                      >
                        Type
                      </th>
                      <th
                        scope="col"
                        className="px-[22px] py-2.5 font-semibold"
                      >
                        Subject
                      </th>
                      <th
                        scope="col"
                        className="px-[22px] py-2.5 font-semibold"
                      >
                        Closes this item?
                      </th>
                      <th
                        scope="col"
                        className="px-[22px] py-2.5 font-semibold"
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.replies.map((r) => (
                      <tr
                        key={r.id}
                        className="border-border-subtle border-b last:border-b-0"
                      >
                        <td className="px-[22px] py-3 font-mono text-[13px] whitespace-nowrap">
                          <Link
                            href={`/outward/${r.id}`}
                            className="text-accent hover:underline"
                          >
                            {r.number}
                          </Link>
                        </td>
                        <td className="px-[22px] py-3">{r.type}</td>
                        <td className="px-[22px] py-3">{r.subject}</td>
                        <td className="px-[22px] py-3">
                          {r.closesInwardItem
                            ? "Yes, once dispatched"
                            : "No (holding reply)"}
                        </td>
                        <td className="px-[22px] py-3">
                          <StatusBadge status={r.status} flags={[]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {writable && options && (
            <Panel title="Update item">
              <UpdateInwardForm id={row.id} options={options} values={values} />
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
      </div>
    </>
  );
}
