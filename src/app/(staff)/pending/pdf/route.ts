// Pending Actions PDF (SPEC §8.3): ?unit=<id> or all units.
import type { NextRequest } from "next/server";
import { appNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { pendingActionsPdf } from "@/server/pdf/reports";
import { pdfResponse, userFor } from "@/server/pdf/response";
import { pendingActions } from "@/server/read/reports";

export async function GET(request: NextRequest) {
  const user = await userFor(request, "reports.print");
  if (user instanceof Response) return user;
  const unit = request.nextUrl.searchParams.get("unit") ?? "";
  const unitId = /^[0-9a-f-]{36}$/i.test(unit) ? unit : undefined;
  const p = await pendingActions(getDb(), user, unitId, appNow());
  return pdfResponse(
    await pendingActionsPdf(p),
    `Pending Actions ${p.today}.pdf`,
    request.nextUrl.searchParams.get("download") === "1",
  );
}
