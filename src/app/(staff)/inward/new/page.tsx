import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/app/_components/ui/page-header";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { newInwardDefaults } from "@/server/read/defaults";
import { formOptions } from "@/server/read/options";
import { NewInwardForm } from "./new-inward-form";

export const metadata: Metadata = { title: "Log inward · OGSERC Registry" };

export default function NewInwardPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        back={{ href: "/inward", label: "Inward Register" }}
        title="Log inward item"
        intro="Fields marked * are required. The number is issued when you save."
      />
      <Suspense fallback={<p className="text-text-muted mt-6">Loading…</p>}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  const user = await requireCan("registers.write");
  const options = await formOptions(getDb());
  return (
    <div className="mt-6">
      <NewInwardForm
        options={options}
        defaults={newInwardDefaults(options, user, appNow())}
      />
    </div>
  );
}
