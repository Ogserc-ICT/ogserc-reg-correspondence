// Emails (SPEC-v2 C6): "Emails to review" in Review mode, and the email log
// of everything queued, held, sent, failed, discarded or superseded.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusPill, type Tone } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { inputClass } from "@/app/_components/ui/input";
import { PageHeader } from "@/app/_components/ui/page-header";
import { Panel } from "@/app/_components/ui/panel";
import { formatDateTime } from "@/domain/format";
import type { EmailKind, EmailStatus } from "@/generated/prisma/client";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { emailLog, emailsToReview } from "@/server/email/ack";
import { flatParams } from "../register-ui";
import { latestInwardNumber } from "@/server/read/reports";
import { ResendByNumber, ReviewArea, ReviewButtons } from "./email-buttons";

export const metadata: Metadata = { title: "Emails · OGSERC Registry" };

const STATUS: Record<EmailStatus, { label: string; tone: Tone }> = {
  QUEUED: { label: "Queued", tone: "awaiting" },
  PENDING_REVIEW: { label: "To review", tone: "awaiting" },
  SENT: { label: "Sent", tone: "closed" },
  FAILED: { label: "Failed", tone: "overdue" },
  DISCARDED: { label: "Discarded", tone: "void" },
  SUPERSEDED: { label: "Superseded", tone: "void" },
};
const KIND: Record<EmailKind, string> = {
  ACK: "Acknowledgement",
  ROUTING: "Routing",
  RESEND: "Resend",
  REROUTE: "Re-routing notice",
};

const TH =
  "text-text-faint px-5 py-3 text-left text-xs font-semibold tracking-wider whitespace-nowrap uppercase";
const TD = "px-5 py-3.5 align-top";

export default function EmailsPage({ searchParams }: PageProps<"/emails">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">Emails</h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
        <Emails searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Emails({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("ackEmail.send");
  const db = getDb();
  const params = flatParams(await searchParams);
  const status = (Object.keys(STATUS) as EmailStatus[]).find(
    (s) => s === params.status,
  );
  const [held, log, settings, latest] = await Promise.all([
    emailsToReview(db, user),
    emailLog(db, user, { status }),
    db.registrySettings.findUniqueOrThrow({ where: { id: 1 } }),
    latestInwardNumber(db, user),
  ]);
  const mode = { OFF: "Off", REVIEW: "Review", SEND: "Send" }[
    settings.ackEmailMode
  ];

  return (
    <>
      <PageHeader
        title="Emails"
        intro={`Acknowledgement emails to units. Mode: ${mode} (Admin › Settings).`}
      />

      <Panel title={`Emails to review (${held.length})`} className="mt-6">
        <ReviewArea>
          {held.length === 0 ? (
            <p className="text-text-muted px-[22px] pb-5 text-sm">
              Nothing is waiting for review.
            </p>
          ) : (
            <ul
              aria-label="Emails to review"
              className="divide-border-subtle divide-y px-[22px] pb-4"
            >
              {held.map((e) => (
                <li
                  key={e.id}
                  className="grid gap-3 py-4 text-sm lg:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{e.subject}</p>
                    <p className="text-text-muted mt-1">
                      {KIND[e.kind]} ·{" "}
                      <Link
                        href={`/inward/${e.inwardItem.id}`}
                        className="text-accent font-mono hover:underline"
                      >
                        {e.inwardItem.number}
                      </Link>{" "}
                      · held {formatDateTime(e.createdAt)}
                      {e.createdBy && ` by ${e.createdBy.name}`}
                    </p>
                    <p className="mt-1">
                      To: {e.to.join("; ")}
                      {e.cc.length > 0 && (
                        <span className="text-text-muted">
                          {" "}
                          · Cc: {e.cc.join("; ")}
                        </span>
                      )}
                    </p>
                    <details className="mt-2">
                      <summary className="text-accent cursor-pointer">
                        Show the message
                      </summary>
                      <pre className="bg-surface-raised rounded-control mt-2 overflow-x-auto p-3 text-xs whitespace-pre-wrap">
                        {e.body}
                      </pre>
                    </details>
                  </div>
                  <ReviewButtons id={e.id} />
                </li>
              ))}
            </ul>
          )}
        </ReviewArea>
      </Panel>

      <Panel title="Resend an acknowledgement" className="mt-6">
        <div id="resend" className="px-[22px] pb-[22px]">
          <ResendByNumber latest={latest} />
        </div>
      </Panel>

      <h2 className="mt-8 text-lg font-semibold">Email log</h2>
      <form
        method="get"
        className="rounded-card border-border-subtle bg-surface mt-3 flex flex-wrap items-end gap-3 border p-4 text-sm"
      >
        <label className="min-w-48">
          <span className="text-text-muted block pb-1.5 text-xs">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className={inputClass}
          >
            <option value="">Any</option>
            {(Object.keys(STATUS) as EmailStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass("primary")}>
          Apply
        </button>
      </form>
      <section
        aria-label="Email log"
        className="border-border-subtle bg-surface rounded-panel mt-4 overflow-x-auto border"
      >
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-border-subtle border-b">
              {["Queued", "Item", "Kind", "To", "Status", "Tries", "Sent"].map(
                (h) => (
                  <th key={h} scope="col" className={TH}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-border-subtle divide-y">
            {log.map((e) => (
              <tr key={e.id}>
                <td className={`${TD} whitespace-nowrap`}>
                  {formatDateTime(e.createdAt)}
                </td>
                <td className={TD}>
                  <Link
                    href={`/inward/${e.inwardItem.id}`}
                    className="hover:text-accent font-mono text-[13px] whitespace-nowrap hover:underline"
                  >
                    {e.inwardItem.number}
                  </Link>
                </td>
                <td className={TD}>{KIND[e.kind]}</td>
                <td className={`${TD} text-text-muted`}>{e.to.join("; ")}</td>
                <td className={TD}>
                  <StatusPill tone={STATUS[e.status].tone}>
                    {STATUS[e.status].label}
                  </StatusPill>
                  {e.error && (
                    <span className="text-overdue mt-1 block text-xs">
                      {e.error}
                    </span>
                  )}
                  {e.reviewedBy && (
                    <span className="text-text-faint mt-1 block text-xs">
                      by {e.reviewedBy.name}
                    </span>
                  )}
                </td>
                <td className={`${TD} font-mono tabular-nums`}>{e.attempts}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  {e.sentAt ? formatDateTime(e.sentAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {log.length === 0 && (
          <p className="text-text-muted px-5 py-6">No emails.</p>
        )}
      </section>
    </>
  );
}
