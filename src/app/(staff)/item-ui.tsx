// Pieces shared by the inward and outward detail pages.
import type { ReactNode } from "react";
import { formatDateTime } from "@/domain/format";

export function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="py-1.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children}</dd>
    </div>
  );
}

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-neutral-200 p-4">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Flags({ flags }: { flags: readonly string[] }) {
  if (!flags.length) return null;
  return (
    <ul className="bg-status-flagged mt-3 list-disc rounded p-3 pl-8 text-sm">
      {flags.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
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
  return (
    <ol className="space-y-3 text-sm">
      {entries.map((e) => {
        const before = (e.before ?? {}) as Record<string, unknown>;
        const after = (e.after ?? {}) as Record<string, unknown>;
        const keys = e.action === "create" ? [] : Object.keys(after);
        return (
          <li key={String(e.id)} className="border-l-2 border-neutral-200 pl-3">
            <p>
              <span className="font-medium">
                {ACTIONS[e.action] ?? e.action}
              </span>{" "}
              <span className="text-neutral-600">
                {formatDateTime(e.at)} by {e.user?.name ?? "the system"}
              </span>
            </p>
            {e.note && <p className="text-neutral-700">Reason: {e.note}</p>}
            {keys.length > 0 && (
              <ul className="mt-1 text-neutral-700">
                {keys.map((k) => (
                  <li key={k}>
                    {labels[k] ?? k}: {show(before[k])} → {show(after[k])}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
