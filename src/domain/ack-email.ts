// Acknowledgement email (SPEC-v2 C6): who gets it, whether it is sent, and
// its wording. Pure; the server queues, sends and records it (EmailLog).
//
// Agreed on review (docs/V2_GAP_REPORT.md C6):
// - a routing email goes to the full resolved list, not just new addresses;
// - addresses in an email still waiting for review count as covered, and a
//   new email for the item supersedes any still waiting;
// - Off sends and records nothing;
// - ackEmailedTo/At change only on an actual send (E1).
import type { IsoDate } from "./calendar";
import { dateIn } from "./clock";
import { formatDate, formatDateTime, BLANK } from "./format";
import { slipFileName } from "./numbering";

export type AckEmailMode = "OFF" | "REVIEW" | "SEND";
export type AckEmailKind = "ack" | "routing" | "resend";

const key = (a: string) => a.trim().toLowerCase();

/** Adds `add` to `already`, case-insensitively, keeping first spellings in order. */
export function mergeAddresses(
  already: readonly string[],
  add: readonly string[],
): string[] {
  const out = [...already];
  const seen = new Set(already.map(key));
  for (const a of add) {
    const k = key(a);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(a.trim());
    }
  }
  return out;
}

/** True if every address in `to` is already in `covered` (ignoring case). */
export function allCovered(
  to: readonly string[],
  covered: readonly string[],
): boolean {
  const c = new Set(covered.map(key));
  return to.every((a) => c.has(key(a)));
}

/**
 * C6.2: `to` = the unit's addresses ∪ its division's (deduplicated, ignoring
 * case); `cc` = settings.ackEmailCc, minus anything already in `to`.
 */
export function resolveRecipients(input: {
  unitEmails: readonly string[];
  divisionEmails: readonly string[];
  /** settings.ackEmailCc: may hold several, separated by , or ; */
  cc: string;
}): { to: string[]; cc: string[] } {
  const to = mergeAddresses(
    [],
    [...input.unitEmails, ...input.divisionEmails].map(key),
  );
  const ccList = input.cc
    .split(/[,;\s]+/)
    .map(key)
    .filter(Boolean);
  return { to, cc: mergeAddresses([], ccList).filter((a) => !to.includes(a)) };
}

export type PendingReviewEmail = { id: string; to: readonly string[] };

export type AckEmailPlan =
  | {
      action: "none";
      /** Line for the confirmation message; null = say nothing (C6.1). */
      line: string | null;
    }
  | {
      action: "send" | "review";
      to: string[];
      cc: string[];
      /** Emails still waiting for review that this one replaces. */
      supersede: string[];
    };

/** Decides what happens to the acknowledgement email for one event (C6.1–C6.3). */
export function planAckEmail(input: {
  mode: AckEmailMode;
  kind: AckEmailKind;
  unit: string;
  to: readonly string[];
  cc: readonly string[];
  /** Addresses actually sent to before (InwardItem.ackEmailedTo). */
  emailedTo: readonly string[];
  /** This item's emails still waiting for review. */
  pendingReview: readonly PendingReviewEmail[];
}): AckEmailPlan {
  if (input.mode === "OFF")
    return {
      action: "none",
      line: input.kind === "resend" ? ACK_EMAIL_OFF : null,
    };
  if (input.to.length === 0)
    return { action: "none", line: noAddressLine(input.unit) };
  if (input.kind === "routing") {
    const covered = input.pendingReview.reduce(
      (acc, p) => mergeAddresses(acc, p.to),
      [...input.emailedTo],
    );
    // Routing to the same unit sends nothing (C6.1, V2, V3).
    if (allCovered(input.to, covered)) return { action: "none", line: null };
  }
  return {
    action: input.mode === "SEND" ? "send" : "review",
    to: [...input.to],
    cc: [...input.cc],
    supersede: input.pendingReview.map((p) => p.id),
  };
}

// ---------------------------------------------------------------- messages

export const ACK_EMAIL_OFF =
  "Acknowledgement email is switched off (Admin › Settings, 'Acknowledgement email').";

export function noAddressLine(unit: string): string {
  return `Acknowledgement not emailed: no email address is set for '${unit}' or its division. Add one in Admin › Units.`;
}

export function emailedLine(unit: string, to: readonly string[]): string {
  return `Acknowledgement emailed to ${unit} (${to.join("; ")}).`;
}

export function reviewLine(unit: string): string {
  return `Acknowledgement email to ${unit} is waiting under 'Emails to review' on the Registry Desk.`;
}

/** C6.5: keeps the workbook's meaning. */
export function notEmailedLine(reason: string): string {
  return `Acknowledgement not emailed: ${reason}. Use RESEND ACK EMAIL on the Registry Desk.`;
}

/** C6.1 confirm before a resend of an item already emailed. */
export function resendPrompt(
  no: string,
  emailedAt: Date,
  emailedTo: readonly string[],
  tz: string,
): string {
  return `${no} was emailed on ${formatDateTime(emailedAt, tz)} to ${emailedTo.join("; ")}. Send it again?`;
}

// ----------------------------------------------------------------- content

export type AckEmailContent = {
  no: string;
  type: string;
  sender: string;
  subject: string;
  receivedAt: Date;
  deemedReceiptDate: IsoDate;
  receivedBy: string;
  unit: string;
  division: string | null;
  /** Present for a routing email. */
  routing?: {
    routedBy: string;
    actionRequired: string | null;
    priority: string | null;
    actionOfficer: string | null;
    responseDue: IsoDate | null;
    fileReference: string | null;
  };
};

const v = (s: string | null | undefined) => (s?.trim() ? s.trim() : BLANK);

/** C6.4 subject, body and slip attachment name (wording kept from the workbook). */
export function composeAckEmail(
  kind: AckEmailKind,
  c: AckEmailContent,
  tz: string,
): { subject: string; body: string; attachmentName: string } {
  const routing = kind === "routing" ? c.routing : undefined;
  const subject = routing
    ? `Routed to ${c.unit}: ${c.no} - ${c.sender}`
    : `Acknowledgement ${c.no} - ${c.type} from ${c.sender}`;
  const lines = [
    "The Registry has received and acknowledged the item below.",
    "",
    `Inward / Ack. No.:  ${c.no}`,
    `Type:  ${v(c.type)}`,
    `Sender:  ${v(c.sender)}`,
    `Subject:  ${v(c.subject)}`,
    `Received:  ${formatDateTime(c.receivedAt, tz)}  (deemed ${formatDate(c.deemedReceiptDate)})`,
    `Received by:  ${v(c.receivedBy)}`,
    `Unit:  ${v(c.unit)}`,
    `Division:  ${v(c.division)}`,
    "",
    ...(routing
      ? [
          `Routed by:  ${v(routing.routedBy)}`,
          `Action required:  ${v(routing.actionRequired)}`,
          `Priority:  ${v(routing.priority)}`,
          `Action officer:  ${v(routing.actionOfficer)}`,
          `Response due:  ${formatDate(routing.responseDue)}`,
          `File reference:  ${v(routing.fileReference)}`,
        ]
      : [
          "Routing, file reference and handling will follow from the Secretary to the Commission / Head of Administration.",
        ]),
    "",
    "The acknowledgement slip is attached.",
    "",
    "OGSERC Registry",
  ];
  return {
    subject,
    body: lines.join("\r\n"),
    attachmentName: slipFileName(c.no),
  };
}

// ------------------------------------------------- re-routing notice (Q-V2-2)

/**
 * Q-V2-2 (agreed): when routing moves an item to another unit, tell the
 * previous unit — but only the addresses that actually received the earlier
 * email, and not those the new unit's email goes to anyway. Off, or the
 * setting off: nothing.
 */
export function planRerouteNotice(input: {
  mode: AckEmailMode;
  enabled: boolean;
  unitChanged: boolean;
  /** The previous unit's addresses (unit ∪ division). */
  previousTo: readonly string[];
  /** InwardItem.ackEmailedTo: addresses actually sent to. */
  emailedTo: readonly string[];
  /** Addresses the new unit's email goes to. */
  newTo: readonly string[];
}): { action: "none" } | { action: "send" | "review"; to: string[] } {
  if (input.mode === "OFF" || !input.enabled || !input.unitChanged)
    return { action: "none" };
  const sent = new Set(input.emailedTo.map(key));
  const skip = new Set(input.newTo.map(key));
  const to = input.previousTo.filter(
    (a) => sent.has(key(a)) && !skip.has(key(a)),
  );
  if (!to.length) return { action: "none" };
  return { action: input.mode === "SEND" ? "send" : "review", to };
}

export function rerouteNoticeLine(
  unit: string,
  outcome: { sent: readonly string[] } | { review: true } | { failed: string },
): string {
  if ("review" in outcome)
    return `The notice to ${unit} that the item has moved is waiting under 'Emails to review'.`;
  if ("failed" in outcome)
    return `${unit} was not told the item has moved: ${outcome.failed}.`;
  return `${unit} told the item has moved (${outcome.sent.join("; ")}).`;
}

/** Q-V2-2 notice wording (agreed with the Registry). */
export function composeRerouteNotice(
  c: {
    no: string;
    type: string;
    sender: string;
    subject: string;
    previousUnit: string;
    newUnit: string;
    acknowledgedAt: Date;
    routedAt: Date;
    routedBy: string;
  },
  tz: string,
): { subject: string; body: string } {
  const on = (d: Date) => formatDate(dateIn(d, tz));
  return {
    subject: `Re-routed: ${c.no} - ${c.sender} is now with ${c.newUnit}`,
    body: [
      `${c.no} (${v(c.type)} from ${v(c.sender)}: "${v(c.subject)}") was acknowledged to ${c.previousUnit} on ${on(c.acknowledgedAt)}.`,
      `On ${on(c.routedAt)} it was routed to ${c.newUnit} by ${v(c.routedBy)}.`,
      `No action is needed from ${c.previousUnit}. If you already hold the document or have started on it, please pass it to ${c.newUnit}.`,
      "",
      "OGSERC Registry",
    ].join("\r\n"),
  };
}
