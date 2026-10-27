// Cron entry point: /api/jobs/<job> with "Authorization: Bearer $CRON_SECRET".
// POST for any scheduler; GET for Vercel Cron, which calls with GET and sends
// the project's CRON_SECRET as the bearer token. Runs in Lagos time.
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

/** A full status refresh can take a while on a large register. */
export const maxDuration = 300;

async function handle(request: NextRequest, job: string) {
  if (!process.env.CRON_SECRET?.trim())
    return Response.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  if (!authorised(request))
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  if (!isJobName(job))
    return Response.json({ error: `No job called ${job}.` }, { status: 404 });
  const run = await runJob(getDb(), job, appNow(), null);
  return Response.json(
    { job, ok: run.ok, summary: run.summary },
    { status: run.ok ? 200 : 500 },
  );
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/jobs/[job]">,
) {
  return handle(request, (await params).job);
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/jobs/[job]">,
) {
  return handle(request, (await params).job);
}
