import type { Metadata } from "next";
import { Suspense } from "react";
import { todayIn } from "@/domain/clock";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { formOptions } from "@/server/read/options";
import { NewFileForm } from "../file-forms";

export const metadata: Metadata = { title: "New file · OGSERC Registry" };

export default function NewFilePage() {
  return (
    <main>
      <h1 className="mb-6 text-2xl font-semibold">Add to File Index</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Form />
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
