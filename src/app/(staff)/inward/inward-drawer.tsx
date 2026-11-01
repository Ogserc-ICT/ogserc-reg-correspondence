// Inward Register side panel: the item's key facts, its timeline so far and
// the one-click actions. Everything comes from inwardDetail (same access
// checks as the item page); the full record stays one click away.
import Link from "next/link";
import { BLANK, formatDate, formatDateTime } from "@/domain/format";
import { can, type Principal } from "@/domain/permissions";
import { fromDbDate } from "@/server/dates";
import type { Db } from "@/server/db";
import { inwardDetail } from "@/server/read/items";
import { loadRules } from "@/server/rules";
import { StatusBadge, StatusPill } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { DetailDrawer, DetailList } from "@/app/_components/ui/detail-drawer";
import { InwardActions } from "./[id]/item-forms";
import { InwardTimeline } from "./inward-timeline";

export async function InwardDrawer({
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
  const d = await inwardDetail(db, user, id, now);
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
  const unit = row.routedUnit.name;
  const forwarded = fromDbDate(row.dateForwarded);

  return (
    <DetailDrawer
      title={row.number}
      subtitle={`${row.type.name} · ${row.sender}`}
      closeHref={closeHref}
      footer={
        <div className="space-y-3">
          {writable && (
            <InwardActions
              id={row.id}
              number={row.number}
              canForward={!row.dateForwarded && derived.status !== "Closed"}
              canClose={derived.status !== "Closed"}
              canVoid={false}
            />
          )}
          <div className="flex flex-wrap gap-3">
            {can(user, "reports.print") && (
              <a
                href={`/inward/${row.id}/slip`}
                target="_blank"
                rel="noopener"
                className={buttonClass("secondary", "flex-1")}
              >
                Print slip
              </a>
            )}
            <Link
              href={`/inward/${row.id}`}
              className={buttonClass("ghost", "flex-1")}
            >
              Open full record
            </Link>
          </div>
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
              label: "Received",
              value: `${formatDateTime(row.receivedAt)} · ${row.mode.label}`,
            },
            {
              label: "Deemed receipt",
              value: formatDate(derived.deemedReceiptDate),
              tone: derived.afterHoursOrNonWorkingDay ? "text-gold" : undefined,
            },
            { label: "Route to", value: unit },
            {
              label: "Response due",
              value: derived.responseDue
                ? `${formatDate(derived.responseDue)} · ${derived.targetDays} working days`
                : BLANK,
            },
            {
              label: "In response to",
              value: row.inResponseToOutward ? (
                <Link
                  href={`/outward/${row.inResponseToOutward.id}`}
                  className="text-accent font-mono text-[13px] hover:underline"
                >
                  {row.inResponseToOutward.number}
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

      {voided && (
        <p className="bg-surface-raised rounded-card mt-5 p-3 text-sm">
          Voided {formatDateTime(row.voidedAt)} by {row.voidedBy?.name}:{" "}
          {row.voidReason}
        </p>
      )}

      <div className="border-border-subtle mt-5 border-t pt-5">
        <h3 className="text-text-faint text-xs font-semibold tracking-wider uppercase">
          Timeline
        </h3>
        <div className="mt-4">
          <InwardTimeline
            row={row}
            derived={derived}
            forwarded={forwarded}
            forwardingTargetDays={rules.registryForwardingTargetDays}
          />
        </div>
      </div>
    </DetailDrawer>
  );
}
