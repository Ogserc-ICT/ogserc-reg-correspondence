// Outward Register side panel: the letter's key facts, its progress and the
// one-click actions. Everything comes from outwardDetail (same access checks
// as the item page); the full record stays one click away.
import Link from "next/link";
import { BLANK, formatDate } from "@/domain/format";
import { can, type Principal } from "@/domain/permissions";
import { fromDbDate } from "@/server/dates";
import type { Db } from "@/server/db";
import { outwardDetail } from "@/server/read/items";
import { loadRules } from "@/server/rules";
import { StatusBadge, StatusPill } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { DetailDrawer, DetailList } from "@/app/_components/ui/detail-drawer";
import { OutwardActions } from "./[id]/item-forms";
import { OutwardTimeline } from "./outward-timeline";

export async function OutwardDrawer({
  db,
  user,
  id,
  now,
  closeHref,
}: {
  db: Db;
  user: Principal;
  id: string;
  now: Date;
  closeHref: string;
}) {
  const d = await outwardDetail(db, user, id, now);
  if (!d)
    return (
      <DetailDrawer title="Not found" closeHref={closeHref}>
        <p className="text-text-muted text-sm">
          This item doesn&apos;t exist or isn&apos;t in your scope.
        </p>
      </DetailDrawer>
    );
  const { row, derived } = d;
  const rules = await loadRules(db);
  const voided = row.voidedAt !== null;
  const writable = can(user, "registers.write") && !voided;

  return (
    <DetailDrawer
      title={row.number}
      subtitle={`${row.type.name} · ${row.addressee}`}
      closeHref={closeHref}
      footer={
        <div className="space-y-3">
          {writable && (
            <OutwardActions
              id={row.id}
              number={row.number}
              canDispatch={!row.dateDispatched}
              canDeliver={!row.deliveryConfirmed}
              canVoid={false}
            />
          )}
          <Link
            href={`/outward/${row.id}`}
            className={buttonClass("ghost", "w-full")}
          >
            Open full record
          </Link>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={derived.status} flags={derived.flags} />
        {derived.flags.map((f) => (
          <StatusPill key={f} tone="flagged">
            {f}
          </StatusPill>
        ))}
      </div>

      <div className="mt-5">
        <DetailList
          items={[
            {
              label: "Document date",
              value: formatDate(fromDbDate(row.documentDate)),
            },
            {
              label: "Dispatched",
              value: row.dateDispatched
                ? `${formatDate(fromDbDate(row.dateDispatched))} · ${row.dispatchMode.label}`
                : BLANK,
            },
            { label: "From unit", value: row.originatingUnit.name },
            {
              label: "Response due",
              value: formatDate(derived.responseDue),
              tone:
                derived.status === "Response overdue"
                  ? "text-overdue"
                  : undefined,
            },
            {
              label: "In reply to",
              value: d.inReplyTo ? (
                <Link
                  href={`/inward/${d.inReplyTo.id}`}
                  className="text-accent font-mono text-[13px] hover:underline"
                >
                  {d.inReplyTo.number}
                </Link>
              ) : (
                BLANK
              ),
            },
            {
              label: "File",
              value: d.file ? (
                <Link
                  href={`/files/${d.file.id}`}
                  className="text-accent font-mono text-[13px] hover:underline"
                >
                  {d.file.reference}
                </Link>
              ) : (
                BLANK
              ),
            },
          ]}
        />
      </div>

      <div className="border-border-subtle mt-5 border-t pt-5">
        <h3 className="text-text-faint mb-4 text-xs font-semibold tracking-wider uppercase">
          Timeline
        </h3>
        <OutwardTimeline
          row={{
            documentDate: fromDbDate(row.documentDate),
            dateDispatched: fromDbDate(row.dateDispatched),
            dateDelivered: fromDbDate(row.dateDelivered),
            deliveryConfirmed: row.deliveryConfirmed,
            dispatchMode: row.dispatchMode,
            dispatchedBy: row.dispatchedBy,
            signer: row.signedBy?.name ?? row.signedByText ?? BLANK,
            voided,
          }}
          derived={derived}
          dispatchTargetDays={rules.dispatchTargetDays}
          needsDeliveryProof={
            !rules.noDeliveryConfirmationModes.includes(row.dispatchModeId)
          }
        />
      </div>
    </DetailDrawer>
  );
}
