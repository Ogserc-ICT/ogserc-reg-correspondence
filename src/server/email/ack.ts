// Acknowledgement email (SPEC-v2 C6): queued inside the transaction that saves
// or routes the item, sent straight after it commits, and retried by the
// email-retry job. Review mode holds it under "Emails to review" instead.
// The item records who was emailed only on an actual send (E1).
import {
  ACK_EMAIL_OFF,
  composeAckEmail,
  emailedLine,
  mergeAddresses,
  notEmailedLine,
  planAckEmail,
  resendPrompt,
  resolveRecipients,
  reviewLine,
  type AckEmailKind,
} from "@/domain/ack-email";
import { slipFileName } from "@/domain/numbering";
import { can, type Principal } from "@/domain/permissions";
import type { RuleContext } from "@/domain/rules";
import type { EmailKind, EmailLog } from "@/generated/prisma/client";
import { inwardWhere } from "../access";
import { audit } from "../audit";
import { fromDbDate } from "../dates";
import type { Db, Tx } from "../db";
import { assertCan, ForbiddenError, ValidationError } from "../errors";
import { slipPdf } from "../pdf/slip";
import { slipForEmail } from "../read/reports";
import { refreshInward, type Actor } from "../registers";
import { loadRuleContext } from "../rules";
import { mailTransport, NO_TRANSPORT } from "./transport";

const KIND: Record<AckEmailKind, EmailKind> = {
  ack: "ACK",
  routing: "ROUTING",
  resend: "RESEND",
};

/** Attempts before an email is left as Failed (then Resend is the way on). */
export const MAX_ATTEMPTS = 5;

export type QueuedEmail =
  | { action: "none"; line: string | null }
  | { action: "send" | "review"; emailId: string; unit: string; to: string[] };

/**
 * Plans and records the email for one event, inside the caller's transaction
 * (C6.1-C6.3). Off records nothing. A new email supersedes any of the item's
 * emails still waiting for review.
 */
export async function queueAckEmail(
  tx: Tx,
  actor: Actor,
  itemId: string,
  kind: AckEmailKind,
  ctx: RuleContext,
): Promise<QueuedEmail> {
  const settings = await tx.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  const derived = await refreshInward(tx, itemId, ctx);
  const item = await tx.inwardItem.findUniqueOrThrow({
    where: { id: itemId },
    include: {
      routedUnit: { include: { division: true } },
      receivedBy: { select: { name: true } },
      routedBy: { select: { name: true } },
      actionRequired: { select: { label: true } },
      priority: { select: { label: true } },
      file: { select: { reference: true } },
    },
  });
  const unit = item.routedUnit;
  const { to, cc } = resolveRecipients({
    unitEmails: unit.emails,
    divisionEmails: unit.division?.emails ?? [],
    cc: settings.ackEmailCc,
  });
  const pendingReview = (
    await tx.emailLog.findMany({
      where: { inwardItemId: itemId, status: "PENDING_REVIEW" },
      select: { id: true, to: true },
    })
  ).map((p) => ({ id: p.id, to: p.to }));
  const plan = planAckEmail({
    mode: settings.ackEmailMode,
    kind,
    unit: unit.name,
    to,
    cc,
    emailedTo: item.ackEmailedTo,
    pendingReview,
  });
  if (plan.action === "none") return plan;

  for (const id of plan.supersede) {
    await tx.emailLog.update({
      where: { id },
      data: { status: "SUPERSEDED" },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "email-superseded",
        entityType: "EmailLog",
        entityId: id,
        before: { status: "PENDING_REVIEW" },
        after: { status: "SUPERSEDED" },
      },
      actor.now,
    );
  }

  const content = composeAckEmail(
    kind,
    {
      no: item.number,
      type: item.snapTypeName,
      sender: item.sender,
      subject: item.subject,
      receivedAt: item.receivedAt,
      deemedReceiptDate: fromDbDate(item.deemedReceiptDate)!,
      receivedBy: item.receivedBy.name,
      unit: unit.name,
      division: unit.division?.name ?? null,
      routing: item.routedAt
        ? {
            routedBy: item.routedBy?.name ?? "",
            actionRequired: item.actionRequired?.label ?? null,
            priority: item.priority?.label ?? "Normal",
            actionOfficer: item.actionOfficer,
            responseDue: derived.responseDue,
            fileReference: item.file?.reference ?? null,
          }
        : undefined,
    },
    ctx.rules.timezone,
  );
  const status = plan.action === "send" ? "QUEUED" : "PENDING_REVIEW";
  const email = await tx.emailLog.create({
    data: {
      inwardItemId: itemId,
      kind: KIND[kind],
      status,
      to: plan.to,
      cc: plan.cc,
      subject: content.subject,
      body: content.body,
      createdById: actor.user.id,
    },
  });
  await audit(
    tx,
    {
      userId: actor.user.id,
      action: plan.action === "send" ? "email-queued" : "email-held",
      entityType: "EmailLog",
      entityId: email.id,
      after: {
        inwardItem: item.number,
        kind: email.kind,
        status,
        to: email.to,
        cc: email.cc,
      },
    },
    actor.now,
  );
  return {
    action: plan.action,
    emailId: email.id,
    unit: unit.name,
    to: plan.to,
  };
}

export type Delivery =
  | { ok: true; to: string[] }
  | { ok: false; reason: string }
  /** Someone else is sending it, or it is not queued. */
  | { ok: null };

/**
 * Sends one queued email. The row is claimed first, so the save, "Run now"
 * and the daily job never send the same email twice.
 */
export async function deliverEmail(
  db: Db,
  emailId: string,
  now: Date,
  userId: string | null,
): Promise<Delivery> {
  const lease = new Date(now.getTime() + 10 * 60_000);
  const claimed = await db.$queryRaw<EmailLog[]>`
    UPDATE "EmailLog"
    SET "attempts" = "attempts" + 1, "nextAttemptAt" = ${lease}, "updatedAt" = ${now}
    WHERE "id" = ${emailId}::uuid AND "status" = 'QUEUED'
      AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
    RETURNING *`;
  if (claimed.length === 0) return { ok: null };
  const email = claimed[0];

  let reason: string | null = null;
  const transport = mailTransport();
  if (!transport) reason = NO_TRANSPORT;
  else
    try {
      const slip = await slipForEmail(db, email.inwardItemId);
      if (!slip) throw new Error("the item has no slip");
      await transport.send({
        to: email.to,
        cc: email.cc,
        subject: email.subject,
        body: email.body,
        attachments: [
          {
            filename: slipFileName(slip.number),
            contentType: "application/pdf",
            content: await slipPdf(slip),
          },
        ],
      });
    } catch (err) {
      reason = `the email provider refused it (${err instanceof Error ? err.message : String(err)})`;
    }

  if (reason) {
    const failed = email.attempts >= MAX_ATTEMPTS;
    // Backoff: 5, 10, 20, 40 minutes; the daily job picks up whatever is due.
    const next = new Date(
      now.getTime() + 5 * 60_000 * 2 ** Math.max(0, email.attempts - 1),
    );
    await db.$transaction(async (tx) => {
      await tx.emailLog.update({
        where: { id: emailId },
        data: {
          status: failed ? "FAILED" : "QUEUED",
          error: reason,
          nextAttemptAt: failed ? null : next,
        },
      });
      await audit(
        tx,
        {
          userId,
          action: "email-failed",
          entityType: "EmailLog",
          entityId: emailId,
          after: { attempts: email.attempts, error: reason, gaveUp: failed },
        },
        now,
      );
    });
    return { ok: false, reason };
  }

  await db.$transaction(async (tx) => {
    await tx.emailLog.update({
      where: { id: emailId },
      data: { status: "SENT", sentAt: now, error: null, nextAttemptAt: null },
    });
    const item = await tx.inwardItem.findUniqueOrThrow({
      where: { id: email.inwardItemId },
      select: { ackEmailedTo: true, ackEmailedAt: true },
    });
    const ackEmailedTo = mergeAddresses(item.ackEmailedTo, email.to);
    await tx.inwardItem.update({
      where: { id: email.inwardItemId },
      data: { ackEmailedTo, ackEmailedAt: now },
    });
    await audit(
      tx,
      {
        userId,
        action: "email-sent",
        entityType: "InwardItem",
        entityId: email.inwardItemId,
        before: item,
        after: { ackEmailedTo, ackEmailedAt: now, email: emailId },
      },
      now,
    );
  });
  return { ok: true, to: email.to };
}

/** The email line for the confirmation message (C6.1, C6.5). */
export function emailLine(q: QueuedEmail, d: Delivery | null): string | null {
  if (q.action === "none") return q.line;
  if (q.action === "review") return reviewLine(q.unit);
  if (d?.ok) return emailedLine(q.unit, d.to);
  if (d?.ok === false) return notEmailedLine(d.reason);
  return null;
}

/** Queue (inside `tx`) and, after commit, send: the caller passes `queued`. */
export async function sendIfQueued(
  db: Db,
  actor: Actor,
  q: QueuedEmail,
): Promise<string | null> {
  const d =
    q.action === "send"
      ? await deliverEmail(db, q.emailId, actor.now, actor.user.id)
      : null;
  return emailLine(q, d);
}

// ------------------------------------------------------------- resend (C6.1)

/** The question asked before resending an item already emailed. */
export class ResendNeedsConfirm extends Error {
  constructor(prompt: string) {
    super(prompt);
    this.name = "ResendNeedsConfirm";
  }
}

/** RESEND ACK EMAIL (C6.1): to the item's current unit and division. */
export async function resendAckEmail(
  db: Db,
  actor: Actor,
  itemId: string,
  opts: { confirm?: boolean } = {},
) {
  assertCan(actor.user, "ackEmail.send");
  const ctx = await loadRuleContext(db, actor.now);
  const item = await db.inwardItem.findFirst({
    where: { AND: [{ id: itemId, voidedAt: null }, inwardWhere(actor.user)] },
  });
  if (!item) throw new ValidationError(["That inward item doesn't exist."]);
  const settings = await db.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  if (settings.ackEmailMode === "OFF")
    throw new ValidationError([ACK_EMAIL_OFF]);
  if (item.ackEmailedAt && !opts.confirm)
    throw new ResendNeedsConfirm(
      resendPrompt(
        item.number,
        item.ackEmailedAt,
        item.ackEmailedTo,
        ctx.rules.timezone,
      ),
    );
  const q = await db.$transaction((tx) =>
    queueAckEmail(tx, actor, itemId, "resend", ctx),
  );
  const line = await sendIfQueued(db, actor, q);
  return { message: line ?? `${item.number}: nothing to send.` };
}

// ------------------------------------------------------- Emails to review

function assertReviewer(user: Principal) {
  if (!can(user, "ackEmail.send"))
    throw new ForbiddenError("You don't have permission to do that.");
}

export async function emailsToReview(db: Db, user: Principal) {
  assertReviewer(user);
  return db.emailLog.findMany({
    where: { status: "PENDING_REVIEW" },
    include: {
      inwardItem: { select: { id: true, number: true, sender: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function countEmailsToReview(db: Db, user: Principal) {
  if (!can(user, "ackEmail.send")) return 0;
  return db.emailLog.count({ where: { status: "PENDING_REVIEW" } });
}

/** The email log, newest first, optionally one status or one item. */
export async function emailLog(
  db: Db,
  user: Principal,
  filter: { status?: EmailLog["status"]; itemId?: string } = {},
) {
  assertReviewer(user);
  return db.emailLog.findMany({
    where: {
      ...(filter.status && { status: filter.status }),
      ...(filter.itemId && { inwardItemId: filter.itemId }),
    },
    include: {
      inwardItem: { select: { id: true, number: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function takeForReview(tx: Tx, emailId: string) {
  await tx.$queryRaw`SELECT 1 FROM "EmailLog" WHERE "id" = ${emailId}::uuid FOR UPDATE`;
  const email = await tx.emailLog.findUnique({
    where: { id: emailId },
    include: { inwardItem: { select: { number: true, routedUnit: true } } },
  });
  if (!email || email.status !== "PENDING_REVIEW")
    throw new ValidationError(["That email is no longer waiting for review."]);
  return email;
}

/** "Emails to review" → Send. */
export async function sendReviewedEmail(db: Db, actor: Actor, emailId: string) {
  assertReviewer(actor.user);
  const email = await db.$transaction(async (tx) => {
    const e = await takeForReview(tx, emailId);
    await tx.emailLog.update({
      where: { id: emailId },
      data: {
        status: "QUEUED",
        reviewedById: actor.user.id,
        nextAttemptAt: null,
      },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "email-approved",
        entityType: "EmailLog",
        entityId: emailId,
        before: { status: "PENDING_REVIEW" },
        after: { status: "QUEUED" },
      },
      actor.now,
    );
    return e;
  });
  const d = await deliverEmail(db, emailId, actor.now, actor.user.id);
  const unit = email.inwardItem.routedUnit.name;
  return {
    message:
      `${email.inwardItem.number}: ` +
      (d.ok
        ? emailedLine(unit, d.to)
        : d.ok === false
          ? notEmailedLine(d.reason)
          : "the email is already being sent."),
  };
}

/** "Emails to review" → Discard. Nothing is sent; the log keeps it. */
export async function discardReviewedEmail(
  db: Db,
  actor: Actor,
  emailId: string,
) {
  assertReviewer(actor.user);
  return db.$transaction(async (tx) => {
    const e = await takeForReview(tx, emailId);
    await tx.emailLog.update({
      where: { id: emailId },
      data: { status: "DISCARDED", reviewedById: actor.user.id },
    });
    await audit(
      tx,
      {
        userId: actor.user.id,
        action: "email-discarded",
        entityType: "EmailLog",
        entityId: emailId,
        before: { status: "PENDING_REVIEW" },
        after: { status: "DISCARDED" },
      },
      actor.now,
    );
    return { message: `${e.inwardItem.number}: email discarded, not sent.` };
  });
}

// ---------------------------------------------------------------- retry job

/** email-retry job: sends every queued email that is due (C6.5). */
export async function retryEmails(db: Db, now: Date) {
  const due = await db.emailLog.findMany({
    where: {
      status: "QUEUED",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let sent = 0;
  let failed = 0;
  for (const { id } of due) {
    const d = await deliverEmail(db, id, now, null);
    if (d.ok) sent++;
    else if (d.ok === false) failed++;
  }
  const waiting = await db.emailLog.count({ where: { status: "QUEUED" } });
  return {
    summary: due.length
      ? `${sent} sent, ${failed} not sent; ${waiting} still queued.`
      : "No emails waiting to be sent.",
    result: { due: due.length, sent, failed, waiting },
  };
}
