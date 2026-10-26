import type { Metadata } from "next";
import { Suspense } from "react";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { newInwardDefaults } from "@/server/read/defaults";
import { formOptions } from "@/server/read/options";
import { NewInwardForm } from "./new-inward-form";

export const metadata: Metadata = { title: "New inward · OGSERC Registry" };

export default function NewInwardPage() {
  return (
    <main>
      <h1 className="mb-1 text-2xl font-semibold">New inward item</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Log everything that arrives. The acknowledgement number is assigned when
        you save.
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
    <NewInwardForm
      options={options}
      defaults={newInwardDefaults(options, user, appNow())}
    />
  );
}
