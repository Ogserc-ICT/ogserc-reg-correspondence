// Cron entry point: POST /api/jobs/<job> with "Authorization: Bearer
// $CRON_SECRET". Runs in Lagos time via the app clock.
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { appNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { isJobName, runJob } from "@/server/jobs";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/jobs/[job]">,
) {
  if (!process.env.CRON_SECRET?.trim())
    return Response.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  if (!authorised(request))
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  const { job } = await params;
  if (!isJobName(job))
    return Response.json({ error: `No job called ${job}.` }, { status: 404 });
  const run = await runJob(getDb(), job, appNow(), null);
  return Response.json(
    { job, ok: run.ok, summary: run.summary },
    { status: run.ok ? 200 : 500 },
  );
}
