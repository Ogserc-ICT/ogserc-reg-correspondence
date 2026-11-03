// CSV of the inward register with the on-screen filters (SPEC §8).
import { readScope } from "@/domain/permissions";
import type { NextRequest } from "next/server";
import {
  formatDate,
  formatDateTime,
  formatNaira,
  formatYesNo,
} from "@/domain/format";
import { appNow } from "@/server/clock";
import { getCurrentUser } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { toCsv, type Column } from "@/server/read/csv";
import {
  inwardRegister,
  parseFilters,
  type InwardRegisterRow,
} from "@/server/read/registers";

const COLUMNS: Column<InwardRegisterRow>[] = [
  { header: "Inward No.", value: (r) => r.number },
  { header: "Received", value: (r) => formatDateTime(r.receivedAt) },
  {
    header: "Deemed receipt",
    value: (r) => formatDate(r.derived.deemedReceiptDate),
  },
  { header: "Mode", value: (r) => r.mode.label },
  { header: "Type", value: (r) => r.type.name },
  { header: "Category", value: (r) => r.derived.category },
  { header: "Order ref.", value: (r) => r.derived.orderRef },
  { header: "Sender", value: (r) => r.sender },
  { header: "Sender category", value: (r) => r.senderCategory.label },
  { header: "Subject", value: (r) => r.subject },
  { header: "Sender's ref.", value: (r) => r.senderRef },
  { header: "Related OGSERC No.", value: (r) => r.relatedOgsercNo },
  { header: "CAC No.", value: (r) => r.cacNo },
  { header: "Principal LGA", value: (r) => r.principalLga?.label },
  { header: "Volumes", value: (r) => r.volumes },
  { header: "Schedule 2 docs", value: (r) => r.schedule2DocsAttached },
  { header: "Fee evidence", value: (r) => formatYesNo(r.feeEvidenceAttached) },
  { header: "Payment ref.", value: (r) => r.paymentRef },
  {
    header: "Amount shown",
    value: (r) =>
      r.amountShownKobo === null ? "" : formatNaira(r.amountShownKobo),
  },
  { header: "Received by", value: (r) => r.receivedBy.name },
  { header: "File", value: (r) => r.file?.reference },
  { header: "Unit", value: (r) => r.routedUnit.name },
  { header: "Ack. issued via", value: (r) => r.ackIssuedVia.label },
  { header: "Action required", value: (r) => r.actionRequired?.label },
  { header: "Priority", value: (r) => r.priority?.label ?? "Normal" },
  { header: "Action officer", value: (r) => r.actionOfficer },
  {
    header: "Date forwarded",
    value: (r) => formatDate(fromDbDate(r.dateForwarded)),
  },
  { header: "Response due", value: (r) => formatDate(r.derived.responseDue) },
  { header: "Closed on", value: (r) => formatDate(r.derived.closedOn) },
  {
    header: "Closed by",
    value: (r) =>
      r.derived.replyOutward?.number ??
      (r.dateClosedManual ? "Closed without letter" : ""),
  },
  { header: "Status", value: (r) => r.derived.status },
  {
    header: "Working days at Registry",
    value: (r) => r.derived.workingDaysAtRegistry,
  },
  { header: "Working days open", value: (r) => r.derived.workingDaysOpen },
  {
    header: "Closed on time",
    value: (r) => formatYesNo(r.derived.closedOnTime),
  },
  {
    header: "Filed after registration deadline",
    value: (r) => formatYesNo(r.derived.filedAfterRegistrationDeadline),
  },
  { header: "Flags", value: (r) => r.derived.flags.join("; ") },
  { header: "Void reason", value: (r) => r.voidReason },
  { header: "Remarks", value: (r) => r.remarks },
];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (readScope(user).kind === "none")
    return new Response("Forbidden.", { status: 403 });
  const filters = parseFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const now = appNow();
  const r = await inwardRegister(getDb(), user, filters, now, { all: true });
  return new Response(toCsv(r.rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Inward register ${r.today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
