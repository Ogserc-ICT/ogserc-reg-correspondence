// Daily Register and Pending Actions: A4 landscape, header row repeated on
// each page, no blank rows (TEMPLATES §2, §3).
import type { PDFPage } from "pdf-lib";
import { isAwaitingRoutingOrForwarding } from "@/domain/inward";
import { formatDate, formatDateTime, formatTime } from "@/domain/format";
import { fromDbDate } from "../dates";
import type { DailyRegister, PendingActions } from "../read/reports";
import {
  A4_LANDSCAPE,
  createDoc,
  GREY,
  INK,
  pageNumbers,
  paragraph,
  SHADE,
  table,
  type Doc,
} from "./kit";

const M = 30;
const W = A4_LANDSCAPE.w - 2 * M;
const BOTTOM = 36;

function newPage(doc: Doc, runningHead: string): { page: PDFPage; y: number } {
  const page = doc.pdf.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h]);
  page.drawText(runningHead, {
    x: M,
    y: A4_LANDSCAPE.h - 24,
    size: 7.5,
    font: doc.regular,
    color: GREY,
  });
  return { page, y: A4_LANDSCAPE.h - 36 };
}

function heading(doc: Doc, page: PDFPage, left: string, right: string): number {
  let y = A4_LANDSCAPE.h - 30;
  if (doc.logo) {
    const h = 28;
    const w = (doc.logo.width / doc.logo.height) * h;
    page.drawImage(doc.logo, { x: M, y: y - h + 10, width: w, height: h });
    page.drawText(left, {
      x: M + w + 10,
      y,
      size: 13,
      font: doc.bold,
      color: INK,
    });
    y -= h - 6;
  } else {
    page.drawText(left, { x: M, y, size: 13, font: doc.bold, color: INK });
  }
  const rw = doc.regular.widthOfTextAtSize(right, 9);
  page.drawText(right, {
    x: A4_LANDSCAPE.w - M - rw,
    y: A4_LANDSCAPE.h - 30,
    size: 9,
    font: doc.regular,
    color: INK,
  });
  return y - 18;
}

function sectionTitle(doc: Doc, page: PDFPage, text: string, y: number) {
  page.drawText(text, { x: M, y, size: 10, font: doc.bold, color: INK });
  return y - 8;
}

export async function dailyRegisterPdf(d: DailyRegister): Promise<Uint8Array> {
  const doc = await createDoc(`Daily Register ${d.date}`);
  const head = `OGSERC Registry — Daily Register — ${formatDate(d.date)}`;
  let page = doc.pdf.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h]);
  let y = heading(
    doc,
    page,
    "OGSERC Registry — Daily Register",
    `Date: ${formatDate(d.date)}`,
  );
  page.drawText(
    `Items received: ${d.received.length}        Items dispatched: ${d.dispatched.length}`,
    { x: M, y, size: 9.5, font: doc.bold, color: INK },
  );
  y -= 22;

  const next = () => newPage(doc, head);
  const ensure = (space: number) => {
    if (y - space < BOTTOM) ({ page, y } = next());
  };

  ensure(40);
  y = sectionTitle(doc, page, "RECEIVED", y);
  if (d.received.length === 0) {
    page.drawText("None.", {
      x: M,
      y: y - 10,
      size: 8,
      font: doc.regular,
      color: GREY,
    });
    y -= 24;
  } else {
    ({ page, y } = table(
      doc,
      { page, y },
      {
        x: M,
        width: W,
        bottom: BOTTOM,
        rows: d.received,
        newPage: next,
        columns: [
          { header: "#", width: 3, value: (_, i) => String(i + 1) },
          { header: "Inward No.", width: 16, value: (r) => r.number },
          { header: "Time", width: 5, value: (r) => formatTime(r.receivedAt) },
          { header: "Mode", width: 9, value: (r) => r.mode.label },
          { header: "Type", width: 15, value: (r) => r.snapTypeName },
          { header: "Sender", width: 15, value: (r) => r.sender },
          { header: "Subject", width: 20, value: (r) => r.subject },
          {
            header: "Deemed receipt",
            width: 8,
            value: (r) => formatDate(fromDbDate(r.deemedReceiptDate)),
          },
          { header: "Received by", width: 10, value: (r) => r.receivedBy.name },
          { header: "Forward to", width: 12, value: (r) => r.routedUnit.name },
        ],
      },
    ));
    y -= 18;
  }

  ensure(40);
  y = sectionTitle(doc, page, "DISPATCHED", y);
  if (d.dispatched.length === 0) {
    page.drawText("None.", {
      x: M,
      y: y - 10,
      size: 8,
      font: doc.regular,
      color: GREY,
    });
    y -= 24;
  } else {
    ({ page, y } = table(
      doc,
      { page, y },
      {
        x: M,
        width: W,
        bottom: BOTTOM,
        rows: d.dispatched,
        newPage: next,
        columns: [
          { header: "#", width: 3, value: (_, i) => String(i + 1) },
          { header: "Outward No.", width: 16, value: (r) => r.number },
          { header: "Document type", width: 14, value: (r) => r.snapTypeName },
          { header: "Addressee", width: 15, value: (r) => r.addressee },
          { header: "Subject", width: 20, value: (r) => r.subject },
          {
            header: "Dispatch mode",
            width: 9,
            value: (r) => r.dispatchMode.label,
          },
          {
            header: "Tracking ref.",
            width: 9,
            value: (r) => r.trackingRef ?? "—",
          },
          {
            header: "Dispatched by",
            width: 10,
            value: (r) => r.dispatchedBy?.name ?? "—",
          },
          {
            header: "Originating unit",
            width: 12,
            value: (r) => r.originatingUnit.name,
          },
        ],
      },
    ));
    y -= 18;
  }

  // Sign-off block (printed only; Q-C).
  y -= 8;
  ensure(80);
  const line = (text: string, at: number) =>
    page.drawText(text, {
      x: M,
      y: at,
      size: 9,
      font: doc.regular,
      color: INK,
    });
  line("Counted and checked against the physical items and dispatch book.", y);
  line(
    "Registry officer: ____________________________     Signature / date: ________________",
    y - 22,
  );
  line(
    "Head of Registry: ____________________________     Signature / date: ________________",
    y - 44,
  );
  line(
    `For the Secretary to the Commission (${d.secretaryName || "—"})`,
    y - 66,
  );

  pageNumbers(doc);
  return doc.pdf.save();
}

export async function pendingActionsPdf(
  p: PendingActions,
): Promise<Uint8Array> {
  const doc = await createDoc(`Pending Actions ${p.today}`);
  const printed = formatDateTime(p.printedAt);
  const head = `OGSERC Registry — Pending Actions — ${p.unit} — printed ${printed}`;
  const page = doc.pdf.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h]);
  let y = heading(
    doc,
    page,
    "OGSERC Registry — Pending Actions",
    `Unit: ${p.unit}      Printed: ${printed}`,
  );
  page.drawText(
    `Pending: ${p.counts.pending}     Overdue: ${p.counts.overdue}     Awaiting routing / fwd: ${p.counts.awaitingRoutingOrForwarding}`,
    { x: M, y, size: 9.5, font: doc.bold, color: INK },
  );
  y -= 16;

  if (p.rows.length === 0) {
    paragraph(page, "Nothing is pending.", {
      x: M,
      y,
      width: W,
      font: doc.regular,
      size: 9,
      color: GREY,
    });
  } else {
    table(
      doc,
      { page, y },
      {
        x: M,
        width: W,
        bottom: BOTTOM,
        rows: p.rows,
        newPage: () => newPage(doc, head),
        shade: (r) =>
          r.derived.status === "Overdue"
            ? SHADE.overdue
            : isAwaitingRoutingOrForwarding(r.derived.status)
              ? SHADE.awaiting
              : null,
        columns: [
          { header: "#", width: 3, value: (_, i) => String(i + 1) },
          { header: "Inward No.", width: 16, value: (r) => r.number },
          {
            header: "Deemed receipt",
            width: 7,
            value: (r) => formatDate(r.derived.deemedReceiptDate),
          },
          { header: "Sender", width: 12, value: (r) => r.sender },
          { header: "Subject", width: 16, value: (r) => r.subject },
          { header: "Type", width: 12, value: (r) => r.type.name },
          { header: "Unit", width: 10, value: (r) => r.routedUnit.name },
          {
            header: "Action officer",
            width: 8,
            value: (r) => r.actionOfficer ?? "—",
          },
          {
            header: "Action",
            width: 7,
            value: (r) => r.actionRequired?.label ?? "—",
          },
          {
            header: "Priority",
            width: 5,
            value: (r) => r.priority?.label ?? "Normal",
          },
          {
            header: "Response due",
            width: 7,
            value: (r) => formatDate(r.derived.responseDue),
          },
          {
            header: "Working days open",
            width: 7,
            value: (r) => String(r.derived.workingDaysOpen),
          },
          { header: "Status", width: 8, value: (r) => r.derived.status },
        ],
      },
    );
  }
  pageNumbers(doc);
  return doc.pdf.save();
}
