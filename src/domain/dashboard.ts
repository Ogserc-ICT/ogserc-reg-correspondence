// Dashboard counters (SPEC §8.4). One definition of pending (§9 R12).
// Voided items count only towards "voided".
import { addDays, compareDates, type IsoDate } from "./calendar";
import { FILE_FLAGS, type FileDerived, type FileFacts } from "./files";
import type { IntakeDerived } from "./front-desk";
import {
  INWARD_FLAGS,
  isAwaitingRoutingOrForwarding,
  type InwardDerived,
  type InwardFacts,
} from "./inward";
import {
  OUTWARD_FLAGS,
  type OutwardDerived,
  type OutwardFacts,
} from "./outward";

export type DashboardInput = {
  today: IsoDate;
  inward: readonly { facts: InwardFacts; derived: InwardDerived }[];
  outward: readonly { facts: OutwardFacts; derived: OutwardDerived }[];
  files: readonly { facts: FileFacts; derived: FileDerived }[];
  /** Front desk intakes (C3, C9). */
  intakes?: readonly IntakeDerived[];
};

/** Within (today − 7, today]. */
function inLast7Days(d: IsoDate | null, today: IsoDate): boolean {
  return (
    d !== null &&
    compareDates(d, addDays(today, -7)) > 0 &&
    compareDates(d, today) <= 0
  );
}

function count<T>(xs: readonly T[], p: (x: T) => boolean): number {
  return xs.reduce((n, x) => (p(x) ? n + 1 : n), 0);
}

export function dashboardSummary({
  today,
  inward,
  outward,
  files,
  intakes = [],
}: DashboardInput) {
  const inn = inward.filter((i) => !i.facts.voided).map((i) => i.derived);
  const out = outward.filter((o) => !o.facts.voided);
  const outD = out.map((o) => o.derived);
  const fileD = files.map((f) => f.derived);

  const closedWithDue = inn.filter((d) => d.closedOnTime !== null);
  const closedOnTimePct =
    closedWithDue.length === 0
      ? null
      : (100 * count(closedWithDue, (d) => d.closedOnTime === true)) /
        closedWithDue.length;

  return {
    incoming: {
      logged: inn.length,
      voided: inward.length - inn.length,
      receivedToday: count(inn, (d) => d.receiptDate === today),
      receivedLast7Days: count(inn, (d) => inLast7Days(d.receiptDate, today)),
      pending: count(inn, (d) => d.pending),
      awaitingForwarding: count(inn, (d) => d.status === "Awaiting forwarding"),
      /** "Not yet routed" (C9). */
      awaitingRouting: count(inn, (d) => d.status === "Awaiting routing"),
      /** "Awaiting routing / forwarding" (C5.3, C9). */
      awaitingRoutingOrForwarding: count(inn, (d) =>
        isAwaitingRoutingOrForwarding(d.status),
      ),
      /** "At front desk, awaiting registry" (C9). */
      atFrontDesk: count(intakes, (d) => d.status === "Awaiting registry"),
      forwardingOverdue: count(inn, (d) =>
        d.flags.includes(INWARD_FLAGS.notForwarded),
      ),
      open: count(inn, (d) => d.status === "Open"),
      responseOverdue: count(inn, (d) => d.status === "Overdue"),
      closed: count(inn, (d) => d.status === "Closed"),
      notedFiled: count(inn, (d) => d.status === "Noted / filed"),
      closedOnTimePct,
      ackNotYetIssued: count(inn, (d) =>
        d.flags.includes(INWARD_FLAGS.ackNotIssued),
      ),
      afterHoursOrNonWorkingDay: count(inn, (d) => d.afterHoursOrNonWorkingDay),
      reg01FiledAfterDeadline: count(
        inn,
        (d) => d.filedAfterRegistrationDeadline === true,
      ),
      withFlags: count(inn, (d) => d.flags.length > 0),
    },
    outgoing: {
      logged: out.length,
      voided: outward.length - out.length,
      dispatchedToday: count(out, (o) => o.facts.dateDispatched === today),
      dispatchedLast7Days: count(out, (o) =>
        inLast7Days(o.facts.dateDispatched, today),
      ),
      notYetDispatched: count(outD, (d) => d.status === "Not yet dispatched"),
      dispatchOverdue: count(outD, (d) =>
        d.flags.includes(OUTWARD_FLAGS.notDispatched),
      ),
      deliveryNotConfirmed: count(outD, (d) =>
        d.flags.includes(OUTWARD_FLAGS.deliveryNotConfirmed),
      ),
      awaitingResponse: count(outD, (d) => d.status === "Awaiting response"),
      responseOverdue: count(outD, (d) => d.status === "Response overdue"),
      responsesReceived: count(outD, (d) => d.status === "Response received"),
      repliesToInward: count(out, (o) => o.facts.inReplyToInwardId !== null),
      withFlags: count(outD, (d) => d.flags.length > 0),
    },
    files: {
      inIndex: files.length,
      open: count(files, (f) => f.facts.fileStatus === "OPEN"),
      outWithOfficers: count(fileD, (d) => d.isOut),
      overdue: count(fileD, (d) =>
        d.flags.includes(FILE_FLAGS.outBeyondReturn),
      ),
      movementsLogged: files.reduce((n, f) => n + f.facts.movements.length, 0),
      withFlags: count(fileD, (d) => d.flags.length > 0),
    },
  };
}

export type DashboardSummary = ReturnType<typeof dashboardSummary>;
