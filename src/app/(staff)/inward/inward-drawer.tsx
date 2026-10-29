// Inward Register side panel: the item's key facts, its timeline so far and
// the one-click actions. Everything comes from inwardDetail (same access
// checks as the item page); the full record stays one click away.
import Link from "next/link";
import { BLANK, formatDate, formatDateTime } from "@/domain/format";
import { INWARD_FLAGS } from "@/domain/inward";
import { can, type Principal } from "@/domain/permissions";
import { fromDbDate } from "@/server/dates";
import type { Db } from "@/server/db";
import { inwardDetail } from "@/server/read/items";
import { loadRules } from "@/server/rules";
import {
  StatusBadge,
  StatusPill,
  TONES,
  type Tone,
} from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { DetailDrawer, DetailList } from "@/app/_components/ui/detail-drawer";
import { InwardActions } from "./[id]/item-forms";

type Step = { title: string; detail: string; tone: Tone; done: boolean };

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
  const finished = ["Closed", "Noted / filed", "Void"].includes(derived.status);

  const steps: Step[] = [
    {
      title: "Logged at Registry",
      detail: `${formatDateTime(row.receivedAt)} · ${row.receivedBy.name} · Acknowledgement: ${row.ackIssuedVia.label}${
        derived.flags.includes(INWARD_FLAGS.ackNotIssued)
          ? " (not yet issued)"
          : ""
      }`,
      tone: "closed",
      done: true,
    },
  ];
  if (derived.afterHoursOrNonWorkingDay)
    steps.push({
      title: "Deemed received (para 10(3))",
      detail: formatDate(derived.deemedReceiptDate),
      tone: "gold",
      done: true,
    });
  if (forwarded)
    steps.push({
      title: `Forwarded to ${unit}`,
      detail: formatDate(forwarded),
      tone: "closed",
      done: true,
    });
  else if (!finished)
    steps.push({
      title: `Forward to ${unit}`,
      detail: `Waiting ${derived.workingDaysAtRegistry} working day${derived.workingDaysAtRegistry === 1 ? "" : "s"} · target ${rules.registryForwardingTargetDays}`,
      tone: derived.flags.includes(INWARD_FLAGS.notForwarded)
        ? "overdue"
        : "awaiting",
      done: false,
    });
  if (derived.closedOn)
    steps.push({
      title: derived.replyOutward
        ? `Closed by ${derived.replyOutward.number}`
        : "Closed",
      detail: formatDate(derived.closedOn),
      tone: "closed",
      done: true,
    });
  else if (derived.responseDue && !voided)
    steps.push({
      title: "Response due",
      detail: formatDate(derived.responseDue),
      tone: derived.status === "Overdue" ? "overdue" : "none",
      done: false,
    });

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
        <ol className="mt-4 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-3">
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="bg-border absolute top-4 left-[5px] h-[calc(100%+4px)] w-px"
                />
              )}
              <span
                aria-hidden
                className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full ${
                  s.done
                    ? TONES[s.tone].dot
                    : `bg-surface border-2 ${toneBorder[s.tone]}`
                }`}
              />
              <div>
                <p
                  className={`text-sm font-semibold ${s.done ? "" : TONES[s.tone].text}`}
                >
                  {s.title}
                  {!s.done && <span className="sr-only"> (to do)</span>}
                </p>
                <p className="text-text-muted mt-0.5 text-xs">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </DetailDrawer>
  );
}

const toneBorder: Record<Tone, string> = {
  overdue: "border-overdue",
  awaiting: "border-awaiting",
  closed: "border-closed",
  info: "border-info",
  flagged: "border-flagged",
  gold: "border-gold",
  void: "border-text-faint",
  none: "border-text-faint",
};
