import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/app/_components/ui/page-header";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { newOutwardDefaults } from "@/server/read/defaults";
import { formOptions } from "@/server/read/options";
import { NewOutwardForm } from "./new-outward-form";

export const metadata: Metadata = { title: "New outward · OGSERC Registry" };

export default function NewOutwardPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        back={{ href: "/outward", label: "Outward Register" }}
        title="Log outward item"
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
      <NewOutwardForm
        options={options}
        defaults={newOutwardDefaults(options, user, appNow())}
      />
    </div>
  );
}
