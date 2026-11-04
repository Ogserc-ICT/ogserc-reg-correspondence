// Front Desk Log (SPEC-v2 C3.2): every intake, filterable, with CSV export.
// Front desk officers see their own intakes; registry staff see them all.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/app/_components/ui/button";
import { inputClass } from "@/app/_components/ui/input";
import { PageHeader } from "@/app/_components/ui/page-header";
import { can, readScope } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireAnyCan } from "@/server/current-user";
import { getDb } from "@/server/db";
import { intakeLog, parseIntakeFilters } from "@/server/workflows/front-desk";
import { exportHref, flatParams } from "../../register-ui";
import { IntakeTable } from "../intake-table";

export const metadata: Metadata = {
  title: "Front Desk Log · OGSERC Registry",
};

const label = "text-text-muted block pb-1.5 text-xs";

export default function FrontDeskLogPage({
  searchParams,
}: PageProps<"/front-desk/log">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Front Desk Log
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
        <Log searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Log({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAnyCan("frontdesk.write", "frontdesk.read");
  const params = flatParams(await searchParams);
  const filters = parseIntakeFilters(params);
  const rows = await intakeLog(getDb(), user, filters, appNow());
  const all = can(user, "frontdesk.read");

  return (
    <>
      <PageHeader
        back={{ href: "/front-desk", label: "Front Desk" }}
        title="Front Desk Log"
        intro={
          all
            ? "Every document logged at the front desk, and the ACK number it was registered under."
            : "The documents you have logged at the front desk."
        }
        actions={
          <a
            href={exportHref("/front-desk/log", params)}
            className={buttonClass()}
          >
            Export CSV
          </a>
        }
      />
      <form
        method="get"
        className="rounded-card border-border-subtle bg-surface mt-6 grid gap-4 border p-4 text-sm sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"
      >
        <label>
          <span className={label}>Search</span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Intake no., ACK no., sender or subject"
            className={inputClass}
          />
        </label>
        <label>
          <span className={label}>Status</span>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className={inputClass}
          >
            <option value="">Any</option>
            <option value="Awaiting registry">Awaiting registry</option>
            <option value="Registered">Registered</option>
          </select>
        </label>
        <label>
          <span className={label}>Received from</span>
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className={inputClass}
          />
        </label>
        <label>
          <span className={label}>Received to</span>
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            className={inputClass}
          />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
          <Link href="/front-desk/log" className={buttonClass("ghost")}>
            Reset
          </Link>
        </div>
      </form>
      <IntakeTable
        label="Front Desk Log"
        rows={rows}
        empty="No intakes match."
        full
        canRegister={can(user, "registers.write") && all}
        canOpenItems={readScope(user).kind !== "none"}
      />
    </>
  );
}
