import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/app/_components/ui/page-header";
import { todayIn } from "@/domain/clock";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { formOptions } from "@/server/read/options";
import { NewFileForm } from "../file-forms";

export const metadata: Metadata = { title: "New file · OGSERC Registry" };

export default function NewFilePage() {
  return (
    <main className="mx-auto w-full max-w-[900px]">
      <PageHeader
        back={{ href: "/files", label: "Internal File Desk" }}
        title="New file"
        intro="Add a physical file to the File Index. Fields marked * are required."
      />
      <Suspense fallback={<p className="text-text-muted mt-6">Loading…</p>}>
        <div className="rounded-panel border-border-subtle bg-surface mt-6 border p-[22px]">
          <Form />
        </div>
      </Suspense>
    </main>
  );
}

async function Form() {
  await requireCan("files.write");
  const options = await formOptions(getDb());
  const open = (xs: { id: string; key?: string | null }[]) =>
    xs.find((x) => x.key === "OPEN")?.id ?? "";
  return (
    <NewFileForm
      options={options}
      defaults={{
        dateOpened: todayIn(appNow()),
        currentVolume: "1",
        securityId: open(options.fileSecurity),
        fileStatusId: open(options.fileStatuses),
      }}
    />
  );
}
