// Public holidays (Head of Registry): Fixed / Provisional / Estimated, with a
// warning for unconfirmed holidays in the next 30 days. Any change
// recalculates deadlines straight away.
import type { Metadata } from "next";
import { Suspense } from "react";
import { Select, TextInput } from "@/app/_components/inputs";
import { todayIn } from "@/domain/clock";
import { formatDate } from "@/domain/format";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { upcomingUnconfirmedHolidays } from "@/server/jobs";
import { loadReference } from "@/server/reference";
import { deleteHolidayAction, saveHolidayAction } from "../reference-actions";
import { AddForm, ConfirmButton, Editor, Tabs } from "../reference-ui";

export const metadata: Metadata = {
  title: "Public holidays · OGSERC Registry",
};

const STATUSES = [
  { id: "FIXED", label: "Fixed (in law)" },
  { id: "PROVISIONAL", label: "Provisional (awaiting FG declaration)" },
  { id: "ESTIMATED", label: "Estimated (date not yet known)" },
];
const STATUS_LABEL: Record<string, string> = {
  FIXED: "Fixed",
  PROVISIONAL: "Provisional",
  ESTIMATED: "Estimated",
};

export default function HolidaysPage() {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Reference data</h1>
      <Tabs />
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Holidays />
      </Suspense>
    </main>
  );
}

async function Holidays() {
  const user = await requireCan("reference.manage");
  const now = appNow();
  const db = getDb();
  const ref = await loadReference(db, { user, now });
  const today = todayIn(now);
  const soon = await upcomingUnconfirmedHolidays(db, today);
  const lastYear = ref.holidays.at(-1)?.date.getUTCFullYear();
  const thisYear = Number(today.slice(0, 4));

  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-neutral-600">
        Holidays are non-working days for every deadline and the para 10(3)
        deemed receipt date. Adding, moving or removing one recalculates open
        deadlines immediately. Add any State-declared holidays too.
      </p>
      {soon.length > 0 && (
        <div
          role="note"
          className="bg-status-awaiting mb-4 rounded p-3 text-sm"
        >
          <p className="font-medium">To confirm in the next 30 days</p>
          <ul className="list-disc pl-5">
            {soon.map((h) => (
              <li key={h.date}>
                {formatDate(h.date)}: {h.name} (
                {STATUS_LABEL[h.status].toLowerCase()})
              </li>
            ))}
          </ul>
        </div>
      )}
      {lastYear !== undefined && lastYear <= thisYear && (
        <p role="note" className="bg-status-overdue mb-4 rounded p-3 text-sm">
          The calendar ends in {lastYear}. Add next year&apos;s holidays now, or
          deadlines after that will ignore them.
        </p>
      )}
      <div className="space-y-2">
        {ref.holidays.map((h) => {
          const date = fromDbDate(h.date);
          return (
            <Editor
              key={h.id}
              action={saveHolidayAction.bind(null, h.id)}
              summary={
                <span>
                  <strong className="tabular-nums">{formatDate(date)}</strong> ·{" "}
                  {h.name} ·{" "}
                  <span
                    className={
                      h.status === "FIXED"
                        ? ""
                        : "bg-status-awaiting rounded px-1"
                    }
                  >
                    {STATUS_LABEL[h.status]}
                  </span>
                </span>
              }
              extra={
                <ConfirmButton
                  action={deleteHolidayAction.bind(null, h.id)}
                  label="Remove this holiday"
                  question={`Remove ${h.name} (${formatDate(date)})? Deadlines will be recalculated.`}
                />
              }
            >
              <TextInput
                name="date"
                type="date"
                label="Date"
                required
                defaultValue={date}
              />
              <TextInput
                name="name"
                label="Name"
                required
                defaultValue={h.name}
              />
              <Select
                name="status"
                label="Status"
                required
                options={STATUSES}
                defaultValue={h.status}
              />
              <TextInput name="note" label="Note" defaultValue={h.note ?? ""} />
            </Editor>
          );
        })}
      </div>
      <AddForm action={saveHolidayAction.bind(null, null)} submit="Add holiday">
        <TextInput name="date" type="date" label="Date" required />
        <TextInput name="name" label="Name" required />
        <Select
          name="status"
          label="Status"
          required
          options={STATUSES}
          defaultValue="FIXED"
        />
        <TextInput name="note" label="Note" />
      </AddForm>
    </>
  );
}
