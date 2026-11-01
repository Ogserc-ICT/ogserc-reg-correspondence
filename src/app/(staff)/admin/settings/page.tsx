import type { Metadata } from "next";
import { Suspense } from "react";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { getSettings } from "@/server/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings · OGSERC Registry" };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
      <p className="text-text-muted mt-1 mb-6 max-w-2xl text-sm">
        Rules the Commission may still change. Every change is recorded in the
        audit log with its old and new value. The time zone is always
        Africa/Lagos.
      </p>
      <Suspense fallback={<p className="text-text-faint">Loading…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  const admin = await requireCan("settings.manage");
  return <SettingsForm initial={await getSettings(getDb(), admin)} />;
}
