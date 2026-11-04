// CSV of the outward register with the on-screen filters (SPEC §8).
import { signerName } from "@/domain/outward";
import { readScope } from "@/domain/permissions";
import type { NextRequest } from "next/server";
import { formatDate, formatYesNo } from "@/domain/format";
import { appNow } from "@/server/clock";
import { getCurrentUser } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { toCsv, type Column } from "@/server/read/csv";
import {
  outwardRegister,
  parseFilters,
  type OutwardRegisterRow,
} from "@/server/read/registers";

const COLUMNS: Column<OutwardRegisterRow>[] = [
  { header: "Outward No.", value: (r) => r.number },
  {
    header: "Date of document",
    value: (r) => formatDate(fromDbDate(r.documentDate)),
  },
  { header: "Document type", value: (r) => r.type.name },
  { header: "Subject", value: (r) => r.subject },
  { header: "Addressee", value: (r) => r.addressee },
  { header: "Recipient category", value: (r) => r.recipientCategory.label },
  { header: "Address / email", value: (r) => r.recipientContact },
  { header: "In reply to", value: (r) => r.inReplyToInward?.number },
  { header: "In reply to (sender)", value: (r) => r.inReplyToInward?.sender },
  { header: "Related OGSERC No.", value: (r) => r.relatedOgsercNo },
  { header: "File", value: (r) => r.file?.reference },
  { header: "Originating unit", value: (r) => r.originatingUnit.name },
  { header: "Prepared by", value: (r) => r.preparedBy },
  { header: "Signed by", value: (r) => signerName(r) },
  { header: "Designation", value: (r) => r.signatoryDesignation },
  { header: "Dispatch mode", value: (r) => r.dispatchMode.label },
  {
    header: "Date dispatched",
    value: (r) => formatDate(fromDbDate(r.dateDispatched)),
  },
  { header: "Dispatched by", value: (r) => r.dispatchedBy?.name },
  { header: "Tracking ref.", value: (r) => r.trackingRef },
  {
    header: "Delivery confirmed",
    value: (r) => formatYesNo(r.deliveryConfirmed),
  },
  {
    header: "Date delivered",
    value: (r) => formatDate(fromDbDate(r.dateDelivered)),
  },
  {
    header: "Response expected",
    value: (r) => formatYesNo(r.derived.responseExpected),
  },
  { header: "Response due", value: (r) => formatDate(r.derived.responseDue) },
  {
    header: "Response received",
    value: (r) => r.derived.responseInward?.number,
  },
  {
    header: "Response received on",
    value: (r) => formatDate(r.derived.responseReceivedOn),
  },
  { header: "Status", value: (r) => r.derived.status },
  {
    header: "Working days to dispatch",
    value: (r) => r.derived.workingDaysToDispatch,
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
  const r = await outwardRegister(getDb(), user, filters, appNow(), {
    all: true,
  });
  return new Response(toCsv(r.rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Outward register ${r.today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
