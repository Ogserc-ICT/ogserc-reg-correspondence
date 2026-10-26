"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { isJobName, runJob } from "@/server/jobs";

/** "Run now" on the Jobs screen (Admin). */
export async function runJobAction(job: string): Promise<FormState> {
  const admin = await requireCan("settings.manage");
  if (!isJobName(job)) return { errors: [`No job called ${job}.`] };
  const run = await runJob(getDb(), job, appNow(), admin.id);
  revalidatePath("/admin/jobs");
  return run.ok
    ? { ok: true, message: run.summary ?? "Done." }
    : { errors: [run.summary ?? "The job failed."] };
}
