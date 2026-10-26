// Acknowledgement slip PDF (SPEC §8.1). ?download=1 saves it ("Slip …pdf").
import type { NextRequest } from "next/server";
import { slipFileName } from "@/domain/numbering";
import { getDb } from "@/server/db";
import { pdfResponse, userFor } from "@/server/pdf/response";
import { slipPdf } from "@/server/pdf/slip";
import { slipFor } from "@/server/read/reports";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/inward/[id]/slip">,
) {
  const user = await userFor(request, "reports.print");
  if (user instanceof Response) return user;
  const { id } = await params;
  const content = await slipFor(getDb(), user, id);
  if (!content) return new Response("Not found.", { status: 404 });
  return pdfResponse(
    await slipPdf(content),
    slipFileName(content.number),
    request.nextUrl.searchParams.get("download") === "1",
  );
}
