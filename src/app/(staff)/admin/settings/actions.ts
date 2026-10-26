"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/_components/form";
import { formError, formValues } from "@/server/action-errors";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { settingsSchema, updateSettings } from "@/server/settings";

const BOOLEANS = [
  "effectiveDateIsPlaceholder",
  "deadlineRollsToNextWorkingDay",
  "headMayVoidOwnItems",
] as const;

export async function saveSettingsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireCan("settings.manage");
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(settingsSchema.shape))
    input[key] = String(form.get(key) ?? "");
  for (const key of BOOLEANS) input[key] = form.get(key) === "on";

  try {
    await updateSettings(getDb(), admin, input, appNow());
  } catch (err) {
    return formError(err, formValues(form));
  }
  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: "Settings saved. The change is in the audit log.",
  };
}
