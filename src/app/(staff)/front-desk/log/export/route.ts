// CSV of the Front Desk Log with the on-screen filters (SPEC-v2 C3.2).
import type { NextRequest } from "next/server";
import { formatDateTime } from "@/domain/format";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { getCurrentUser } from "@/server/current-user";
import { dateIn } from "@/domain/clock";
import { getDb } from "@/server/db";
import { toCsv, type Column } from "@/server/read/csv";
import { intakeLog, parseIntakeFilters } from "@/server/workflows/front-desk";

type Row = Awaited<ReturnType<typeof intakeLog>>[number];

const COLUMNS: Column<Row>[] = [
  { header: "Intake No.", value: (r) => r.intakeNo },
  { header: "Received", value: (r) => formatDateTime(r.receivedAt) },
  { header: "Mode", value: (r) => r.mode.label },
  { header: "Type", value: (r) => r.type?.name },
  { header: "Sender", value: (r) => r.sender },
  { header: "Subject", value: (r) => r.subject },
  { header: "Delivered by", value: (r) => r.deliveredBy },
  { header: "Phone", value: (r) => r.phone },
  { header: "Volumes", value: (r) => r.volumes },
  { header: "Received by", value: (r) => r.receivedBy.name },
  { header: "Remarks", value: (r) => r.remarks },
  { header: "Status", value: (r) => r.derived.status },
  { header: "Inward No.", value: (r) => r.inwardItem?.number },
  {
    header: "Registered",
    value: (r) => (r.registeredAt ? formatDateTime(r.registeredAt) : ""),
  },
  {
    header: "Working days waiting",
    value: (r) => r.derived.workingDaysWaiting,
  },
];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "frontdesk.write") && !can(user, "frontdesk.read"))
    return new Response("Forbidden.", { status: 403 });
  const now = appNow();
  const rows = await intakeLog(
    getDb(),
    user,
    parseIntakeFilters(Object.fromEntries(request.nextUrl.searchParams)),
    now,
  );
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Front desk log ${dateIn(now)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
