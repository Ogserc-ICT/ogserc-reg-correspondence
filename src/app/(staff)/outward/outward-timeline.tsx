// An outward item's progress: dated and signed, dispatched, delivered, and
// the response. Shared by the register drawer and the item page.
import { formatDate } from "@/domain/format";
import { OUTWARD_FLAGS, type OutwardDerived } from "@/domain/outward";
import { Timeline, type Step } from "@/app/_components/ui/timeline";

export function OutwardTimeline({
  row,
  derived,
  dispatchTargetDays,
  needsDeliveryProof,
}: {
  row: {
    documentDate: string;
    dateDispatched: string | null;
    dateDelivered: string | null;
    deliveryConfirmed: boolean | null;
    dispatchMode: { label: string };
    dispatchedBy: { name: string } | null;
    signer: string;
    voided: boolean;
  };
  derived: OutwardDerived;
  dispatchTargetDays: number;
  /** False for modes that never need proof of delivery. */
  needsDeliveryProof: boolean;
}) {
  const steps: Step[] = [
    {
      title: "Logged and numbered",
      detail: `Dated ${formatDate(row.documentDate)} · signed by ${row.signer}`,
      tone: "closed",
      done: true,
    },
  ];
  if (row.voided) return <Timeline steps={steps} />;

  if (row.dateDispatched)
    steps.push({
      title: `Dispatched by ${row.dispatchMode.label}`,
      detail: `${formatDate(row.dateDispatched)}${row.dispatchedBy ? ` · ${row.dispatchedBy.name}` : ""}`,
      tone: "info",
      done: true,
    });
  else
    steps.push({
      title: "Dispatch",
      detail: `Waiting ${derived.workingDaysToDispatch} working day${derived.workingDaysToDispatch === 1 ? "" : "s"} · target ${dispatchTargetDays}`,
      tone: derived.flags.includes(OUTWARD_FLAGS.notDispatched)
        ? "overdue"
        : "awaiting",
      done: false,
    });

  if (row.deliveryConfirmed)
    steps.push({
      title: "Delivery confirmed",
      detail: formatDate(row.dateDelivered),
      tone: "closed",
      done: true,
    });
  else if (row.dateDispatched && needsDeliveryProof)
    steps.push({
      title: "Confirm delivery",
      detail: "Proof of delivery not yet recorded",
      tone: derived.flags.includes(OUTWARD_FLAGS.deliveryNotConfirmed)
        ? "overdue"
        : "awaiting",
      done: false,
    });

  if (derived.responseInward)
    steps.push({
      title: `Response received: ${derived.responseInward.number}`,
      detail: formatDate(derived.responseReceivedOn),
      tone: "closed",
      done: true,
    });
  else if (derived.responseDue)
    steps.push({
      title: "Response due",
      detail: formatDate(derived.responseDue),
      tone: derived.status === "Response overdue" ? "overdue" : "none",
      done: false,
    });
  return <Timeline steps={steps} />;
}
