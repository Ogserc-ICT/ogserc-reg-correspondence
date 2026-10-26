// PDF responses for the route handlers: shown in the browser (to print) or
// downloaded, never cached.
import { NextResponse } from "next/server";
import { can, type Capability } from "@/domain/permissions";
import { getCurrentUser } from "../current-user";
import type { SessionUser } from "../session";

export function pdfResponse(
  bytes: Uint8Array,
  fileName: string,
  download: boolean,
) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** The signed-in user with `cap`, or the response to send instead. */
export async function userFor(
  request: Request,
  cap: Capability,
): Promise<SessionUser | Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user, cap))
    return new Response("You can't print reports.", { status: 403 });
  return user;
}
