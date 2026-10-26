// Status colours from the workbook's Guide: red = overdue, amber = awaiting
// action, green = closed, peach = flagged. The text is always shown too.
const OVERDUE = new Set(["Overdue", "Response overdue"]);
const AWAITING = new Set([
  "Awaiting forwarding",
  "Open",
  "Not yet dispatched",
  "Awaiting response",
  "Dispatched",
]);
const CLOSED = new Set([
  "Closed",
  "Response received",
  "Delivered",
  "Noted / filed",
]);

export function statusTone(status: string, flagged: boolean): string {
  if (status === "Void") return "bg-neutral-100 text-neutral-500 line-through";
  if (OVERDUE.has(status)) return "bg-status-overdue";
  if (flagged) return "bg-status-flagged";
  if (AWAITING.has(status)) return "bg-status-awaiting";
  if (CLOSED.has(status)) return "bg-status-closed";
  return "";
}

export function StatusBadge({
  status,
  flags,
}: {
  status: string;
  flags: readonly string[];
}) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusTone(status, flags.length > 0)}`}
    >
      {status}
    </span>
  );
}

export function ColourKey() {
  const items: [string, string][] = [
    ["bg-status-overdue", "Overdue"],
    ["bg-status-awaiting", "Awaiting action"],
    ["bg-status-closed", "Closed / done"],
    ["bg-status-flagged", "Flagged"],
  ];
  return (
    <p className="flex flex-wrap gap-3 text-xs text-neutral-600">
      {items.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block h-3 w-3 rounded ${cls}`} aria-hidden />
          {label}
        </span>
      ))}
    </p>
  );
}
