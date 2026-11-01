// An inward item's progress: logged, deemed received, forwarded, closed or
// due. Shared by the register drawer and the item page.
import { formatDate, formatDateTime } from "@/domain/format";
import { INWARD_FLAGS, type InwardDerived } from "@/domain/inward";
import { Timeline, type Step } from "@/app/_components/ui/timeline";

export function InwardTimeline({
  row,
  derived,
  forwardingTargetDays,
  forwarded,
}: {
  row: {
    receivedAt: Date;
    receivedBy: { name: string };
    ackIssuedVia: { label: string };
    routedUnit: { name: string };
    voidedAt: Date | null;
  };
  derived: InwardDerived;
  forwardingTargetDays: number;
  forwarded: string | null;
}) {
  const unit = row.routedUnit.name;
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
      detail: `Waiting ${derived.workingDaysAtRegistry} working day${derived.workingDaysAtRegistry === 1 ? "" : "s"} · target ${forwardingTargetDays}`,
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
  else if (derived.responseDue && row.voidedAt === null)
    steps.push({
      title: "Response due",
      detail: formatDate(derived.responseDue),
      tone: derived.status === "Overdue" ? "overdue" : "none",
      done: false,
    });
  return <Timeline steps={steps} />;
}
