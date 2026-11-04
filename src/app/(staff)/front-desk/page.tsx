// Front Desk (SPEC-v2 C3.2): the intake form plus the "Awaiting registry"
// list. Front desk officers log; registry staff see the list and register.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/app/_components/ui/button";
import { PageHeader } from "@/app/_components/ui/page-header";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireAnyCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { formOptions } from "@/server/read/options";
import {
  awaitingRegistry,
  intakeDefaults,
} from "@/server/workflows/front-desk";
import { IntakeForm } from "./intake-form";
import { IntakeTable } from "./intake-table";

export const metadata: Metadata = { title: "Front Desk · OGSERC Registry" };

export default function FrontDeskPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Front Desk
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
        <FrontDesk />
      </Suspense>
    </main>
  );
}

async function FrontDesk() {
  const user = await requireAnyCan("frontdesk.write", "frontdesk.read");
  const db = getDb();
  const now = appNow();
  const logs = can(user, "frontdesk.write");
  const rows = await awaitingRegistry(db, user, now);

  let form = null;
  if (logs) {
    const [options, settings] = await Promise.all([
      formOptions(db),
      db.registrySettings.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    // Q-V2-5: hand deliveries only, when the Commission says so.
    const modes = settings.frontDeskAnyMode
      ? options.receiptModes
      : options.receiptModes.filter((m) => m.key === "HAND_DELIVERY");
    form = (
      <IntakeForm
        modes={modes}
        types={options.incomingTypes}
        defaults={await intakeDefaults(db, now)}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Front Desk"
        intro={
          logs
            ? "Log each document handed in. No acknowledgement is issued here: the Registry registers it and issues the slip."
            : "Documents logged at the front desk that the Registry has not registered yet."
        }
        actions={
          <Link href="/front-desk/log" className={buttonClass()}>
            Front Desk Log
          </Link>
        }
      />
      {form && <div className="mt-6">{form}</div>}
      <h2 className="mt-8 text-lg font-semibold">
        Awaiting registry{" "}
        <span className="text-text-muted font-normal">({rows.length})</span>
      </h2>
      <IntakeTable
        label="Awaiting registry"
        rows={rows}
        empty="Nothing is waiting for the Registry."
        canRegister={
          can(user, "registers.write") && can(user, "frontdesk.read")
        }
      />
    </>
  );
}
