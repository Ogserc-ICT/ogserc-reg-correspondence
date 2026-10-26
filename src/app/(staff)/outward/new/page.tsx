import type { Metadata } from "next";
import { Suspense } from "react";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { newOutwardDefaults } from "@/server/read/defaults";
import { formOptions } from "@/server/read/options";
import { NewOutwardForm } from "./new-outward-form";

export const metadata: Metadata = { title: "New outward · OGSERC Registry" };

export default function NewOutwardPage() {
  return (
    <main>
      <h1 className="mb-1 text-2xl font-semibold">New outward item</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Log the letter before it is signed, then quote its number on the
        document.
      </p>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  const user = await requireCan("registers.write");
  const options = await formOptions(getDb());
  return (
    <NewOutwardForm
      options={options}
      defaults={newOutwardDefaults(options, user, appNow())}
    />
  );
}
