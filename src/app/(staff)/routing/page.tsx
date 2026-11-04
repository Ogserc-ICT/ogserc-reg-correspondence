// Routing Desk (SPEC-v2 C5.2): the Secretary and the Head of Administration
// (users with "Can route") load an inward item, set its unit, file, action,
// priority, action officer and due date, and see every earlier routing.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Picker } from "@/app/_components/picker";
import { StatusPill, toneOf } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { PageHeader } from "@/app/_components/ui/page-header";
import { Panel } from "@/app/_components/ui/panel";
import { formatDate, formatDateTime } from "@/domain/format";
import { can } from "@/domain/permissions";
import { ROUTING_FIELD_LABELS, ROUTING_REFUSED } from "@/domain/routing";
import { appNow } from "@/server/clock";
import { requireUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { formOptions } from "@/server/read/options";
import { loadForRouting } from "@/server/workflows/routing";
import { searchRoutingItemsAction } from "./actions";
import { RoutingForm } from "./routing-form";

export const metadata: Metadata = { title: "Routing Desk · OGSERC Registry" };

export default function RoutingPage({ searchParams }: PageProps<"/routing">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Routing Desk
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
        <RoutingDesk searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** History keys (stored names) → the form's labels. */
const HISTORY_LABELS: Record<string, string> = {
  unitOverrideId: ROUTING_FIELD_LABELS.unitOverrideId,
  fileId: ROUTING_FIELD_LABELS.fileId,
  actionRequiredId: ROUTING_FIELD_LABELS.actionRequired,
  priorityId: ROUTING_FIELD_LABELS.priority,
  actionOfficer: ROUTING_FIELD_LABELS.actionOfficer,
  responseDueOverride: ROUTING_FIELD_LABELS.responseDueOverride,
};

function historyValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "")
    return key === "priorityId"
      ? "Normal"
      : key === "unitOverrideId"
        ? "The type's unit"
        : "—";
  if (typeof v === "object") return (v as { label?: string }).label ?? "—";
  if (key === "responseDueOverride") return formatDate(String(v));
  return String(v);
}

async function RoutingDesk({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "registry.route"))
    return (
      <>
        <PageHeader title="Routing Desk" />
        <p
          role="alert"
          className="rounded-card border-overdue/40 bg-status-overdue text-text mt-6 border p-4 text-sm"
        >
          {ROUTING_REFUSED}
        </p>
      </>
    );

  const sp = await searchParams;
  const itemId =
    typeof sp.item === "string" && /^[0-9a-f-]{36}$/i.test(sp.item)
      ? sp.item
      : null;
  const db = getDb();
  let item: Awaited<ReturnType<typeof loadForRouting>> | null = null;
  let loadError: string | null = null;
  if (itemId)
    try {
      item = await loadForRouting(db, { user, now: appNow() }, itemId);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      loadError = err.problems.join(" ");
    }

  return (
    <>
      <PageHeader
        title="Routing Desk"
        intro="Set the unit, file reference, action, priority, action officer and due date. Every save is kept in the routing history."
      />
      <form
        method="get"
        action="/routing"
        className="rounded-card border-border-subtle bg-surface mt-6 flex flex-wrap items-end gap-3 border p-4 text-sm"
      >
        <div className="min-w-72 flex-1">
          <Picker
            // Remounts with the loaded item.
            key={item?.id ?? "none"}
            name="item"
            label="Inward item"
            hint="Type part of the number, sender or subject."
            search={searchRoutingItemsAction}
            defaultId={item?.id}
            defaultLabel={item?.number}
          />
        </div>
        <button type="submit" className={buttonClass("primary")}>
          Load
        </button>
        {item && (
          <Link href="/routing" className={buttonClass("ghost")}>
            Clear
          </Link>
        )}
      </form>
      {loadError && (
        <p role="alert" className="text-overdue mt-4 text-sm">
          {loadError}
        </p>
      )}
      {item && <Loaded item={item} />}
    </>
  );
}

async function Loaded({
  item,
}: {
  item: Awaited<ReturnType<typeof loadForRouting>>;
}) {
  const db = getDb();
  const [options, settings] = await Promise.all([
    formOptions(db),
    db.registrySettings.findUniqueOrThrow({ where: { id: 1 } }),
  ]);
  const normal = options.priorities.find((p) => p.key === "NORMAL");
  const f = item.fields;
  const values: Record<string, string> = {
    unitOverrideId: f.unitOverrideId ?? "",
    fileId: f.fileId ?? item.suggestedFile?.id ?? "",
    fileIdLabel: f.fileReference ?? item.suggestedFile?.reference ?? "",
    actionRequiredId: f.actionRequiredId ?? "",
    priorityId: f.priorityId && f.priorityId !== normal?.id ? f.priorityId : "",
    actionOfficer: f.actionOfficer ?? "",
    responseDueOverride: f.responseDueOverride ?? "",
  };
  const row = (label: string, value: ReactNode) => (
    <div className="border-border-subtle grid grid-cols-[10rem_1fr] gap-3 border-b py-2.5 text-sm last:border-b-0">
      <dt className="text-text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <Panel
          title={item.number}
          link={{ href: `/inward/${item.id}`, label: "Open the item" }}
        >
          <dl className="px-[22px] pb-4">
            {row("Sender", item.sender)}
            {row("Subject", item.subject)}
            {row("Type", item.type)}
            {row(
              "Status",
              <StatusPill tone={toneOf(item.status, false)}>
                {item.status}
              </StatusPill>,
            )}
            {row("Current unit", item.unit)}
            {row("Division", item.division ?? "—")}
            {row(
              "Routed by",
              item.routedAt
                ? `${item.routedBy ?? "Imported from the workbook"}, ${formatDateTime(item.routedAt)}`
                : "Not routed yet",
            )}
          </dl>
        </Panel>
        <Panel title="Routing">
          <div className="px-[22px] pb-[22px]">
            {item.blocker ? (
              <p role="alert" className="text-overdue text-sm">
                {item.blocker}
              </p>
            ) : (
              <RoutingForm
                id={item.id}
                values={values}
                units={options.units}
                actions={options.actionRequired}
                priorities={options.priorities.filter(
                  (p) => p.key !== "NORMAL",
                )}
                askPassword={settings.routingRequiresPassword}
                fileHint={
                  item.suggestedFile
                    ? `Suggested: the file of ${item.suggestedFile.from}, which this answers. Saving keeps it.`
                    : undefined
                }
              />
            )}
          </div>
        </Panel>
      </div>
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Panel title="Routing history">
          {item.history.length === 0 ? (
            <p className="text-text-muted px-[22px] pb-5 text-sm">
              Not routed yet.
            </p>
          ) : (
            <ol aria-label="Routing history" className="px-[22px] pb-4">
              {[...item.history].reverse().map((e, i) => {
                const after = e.after as Record<string, unknown>;
                const before = e.before as Record<string, unknown>;
                const keys = Object.keys(after);
                return (
                  <li
                    key={i}
                    className="border-border-subtle border-b py-3 text-sm last:border-b-0"
                  >
                    <p className="font-medium">
                      {formatDateTime(e.at)} · {e.by}
                    </p>
                    {keys.length === 0 ? (
                      <p className="text-text-muted mt-1">
                        Saved with no changes.
                      </p>
                    ) : (
                      <ul className="text-text-muted mt-1 space-y-0.5">
                        {keys.map((k) => (
                          <li key={k}>
                            {HISTORY_LABELS[k] ?? k}:{" "}
                            {historyValue(k, before[k])} →{" "}
                            <span className="text-text">
                              {historyValue(k, after[k])}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
