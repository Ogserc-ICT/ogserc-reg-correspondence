// PRINT/SAVE SLIP from the Registry Desk: an inward number → its slip.
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { userFor } from "@/server/pdf/response";
import { inwardIdByNumber } from "@/server/read/reports";

export async function GET(request: NextRequest) {
  const user = await userFor(request, "reports.print");
  if (user instanceof Response) return user;
  const no = request.nextUrl.searchParams.get("no") ?? "";
  const id = await inwardIdByNumber(getDb(), user, no);
  if (!id)
    return new Response(
      `${no.trim() || "That number"} is not in the inward register.`,
      {
        status: 404,
      },
    );
  const download = request.nextUrl.searchParams.get("download") === "1";
  return NextResponse.redirect(
    new URL(`/inward/${id}/slip${download ? "?download=1" : ""}`, request.url),
  );
}
