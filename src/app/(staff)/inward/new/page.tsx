import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/app/_components/ui/page-header";
import { formatDateTime } from "@/domain/format";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { newInwardDefaults } from "@/server/read/defaults";
import { formOptions } from "@/server/read/options";
import { awaitingRegistry, intakeForPull } from "@/server/workflows/front-desk";
import { NewInwardForm } from "./new-inward-form";

export const metadata: Metadata = { title: "Log inward · OGSERC Registry" };

export default function NewInwardPage({
  searchParams,
}: PageProps<"/inward/new">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        back={{ href: "/inward", label: "Inward Register" }}
        title="Log inward item"
        intro="Fields marked * are required. The number is issued when you save."
      />
      <Suspense fallback={<p className="text-text-muted mt-6">Loading…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("registers.write");
  const db = getDb();
  const now = appNow();
  const options = await formOptions(db);
  const defaults = newInwardDefaults(options, user, now);

  // Registry staff pull front desk intakes (SPEC-v2 C3.2).
  const pulls = can(user, "frontdesk.read");
  const intakes = pulls
    ? (await awaitingRegistry(db, user, now)).map((i) => ({
        id: i.id,
        label: `${i.intakeNo} · ${i.sender} · ${formatDateTime(i.receivedAt)}`,
      }))
    : undefined;

  // Opened from the Front Desk's "Register" link.
  const sp = await searchParams;
  const intakeId = typeof sp.intake === "string" ? sp.intake : undefined;
  let initial: Record<string, string> | undefined;
  let initialError: string | undefined;
  if (pulls && intakeId && /^[0-9a-f-]{36}$/i.test(intakeId)) {
    try {
      const r = await intakeForPull(db, user, intakeId);
      initial = {
        ...defaults,
        ...r.values,
        frontDeskIntakeId: intakeId,
        frontDeskIntakeNo: r.intakeNo,
      };
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      initialError = err.problems.join(" ");
    }
  }

  return (
    <div className="mt-6">
      <NewInwardForm
        options={options}
        defaults={defaults}
        intakes={intakes}
        initial={initial}
        initialError={initialError}
      />
    </div>
  );
}
