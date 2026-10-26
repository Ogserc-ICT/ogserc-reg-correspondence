// Daily Register PDF (SPEC §8.2): ?date=YYYY-MM-DD, default today.
import type { NextRequest } from "next/server";
import { isIsoDate } from "@/domain/calendar";
import { todayIn } from "@/domain/clock";
import { appNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { dailyRegisterPdf } from "@/server/pdf/reports";
import { pdfResponse, userFor } from "@/server/pdf/response";
import { dailyRegister } from "@/server/read/reports";

export async function GET(request: NextRequest) {
  const user = await userFor(request, "reports.print");
  if (user instanceof Response) return user;
  const asked = request.nextUrl.searchParams.get("date") ?? "";
  const date = isIsoDate(asked) ? asked : todayIn(appNow());
  const bytes = await dailyRegisterPdf(
    await dailyRegister(getDb(), user, date),
  );
  return pdfResponse(
    bytes,
    `Daily Register ${date}.pdf`,
    request.nextUrl.searchParams.get("download") === "1",
  );
}
