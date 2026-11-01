// Pieces shared by the inward and outward detail pages.
import type { ReactNode } from "react";
import { StatusPill } from "@/app/_components/status";
import { Timeline } from "@/app/_components/ui/timeline";
import { formatDateTime } from "@/domain/format";

/** One label / value row inside a <dl>. */
export function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-border-subtle border-b py-2.5 last:border-b-0 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
      <dt className="text-text-muted text-sm">{label}</dt>
      <dd className="mt-0.5 text-sm break-words sm:mt-0">{children}</dd>
    </div>
  );
}

/** A titled card on an item page. */
export function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Small caps heading inside a panel ("TIMELINE"). */
export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-text-faint mb-3 text-xs font-semibold tracking-wider uppercase">
      {children}
    </h3>
  );
}

export function Flags({ flags }: { flags: readonly string[] }) {
  if (!flags.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Flags">
      {flags.map((f) => (
        <li key={f}>
          <StatusPill tone="flagged">{f}</StatusPill>
        </li>
      ))}
    </ul>
  );
}

/** "Voided … by …: reason" banner. */
export function VoidedNote({
  at,
  by,
  reason,
}: {
  at: Date | null;
  by: string | undefined;
  reason: string | null;
}) {
  return (
    <p className="rounded-card border-border bg-surface-raised border p-4 text-sm">
      <span className="font-semibold">Void.</span> Voided {formatDateTime(at)}{" "}
      by {by}: {reason}
    </p>
  );
}

type Entry = {
  id: bigint;
  at: Date;
  action: string;
  note: string | null;
  before: unknown;
  after: unknown;
  user: { name: string } | null;
};

const ACTIONS: Record<string, string> = {
  create: "Logged",
  update: "Updated",
  edit: "Registered details changed",
  forward: "Forwarded",
  close: "Closed without letter",
  dispatch: "Dispatched",
  deliver: "Delivery confirmed",
  void: "Voided",
  issue: "Issued",
  return: "Returned to the Registry",
};

/** Audit history with field labels and ids turned into names. */
export function History({
  entries,
  labels,
  names,
}: {
  entries: readonly Entry[];
  labels: Record<string, string>;
  names: ReadonlyMap<string, string>;
}) {
  const show = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "string") return names.get(v) ?? v;
    return String(v);
  };
  if (!entries.length)
    return <p className="text-text-muted text-sm">No history yet.</p>;
  return (
    <Timeline
      steps={entries.map((e) => {
        const before = (e.before ?? {}) as Record<string, unknown>;
        const after = (e.after ?? {}) as Record<string, unknown>;
        const keys = e.action === "create" ? [] : Object.keys(after);
        return {
          key: String(e.id),
          title: ACTIONS[e.action] ?? e.action,
          tone: e.action === "void" ? "void" : "none",
          done: true,
          detail: (
            <>
              <p>
                {formatDateTime(e.at)} by {e.user?.name ?? "the system"}
              </p>
              {e.note && <p className="text-text mt-1">Reason: {e.note}</p>}
              {keys.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {keys.map((k) => (
                    <li key={k}>
                      <span className="text-text">{labels[k] ?? k}:</span>{" "}
                      {show(before[k])} → {show(after[k])}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ),
        };
      })}
    />
  );
}
