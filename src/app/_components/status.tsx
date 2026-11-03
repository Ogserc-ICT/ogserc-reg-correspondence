// Status colours: red = overdue, amber = awaiting action, green = closed,
// blue = dispatched / on its way, violet = flagged. The text is always shown
// too, so colour is never the only signal.
import type { ReactNode } from "react";

const OVERDUE = new Set(["Overdue", "Response overdue"]);
const AWAITING = new Set([
  "Awaiting routing",
  "Awaiting forwarding",
  "Open",
  "Not yet dispatched",
  "Awaiting response",
]);
const INFO = new Set(["Dispatched"]);
const CLOSED = new Set([
  "Closed",
  "Response received",
  "Delivered",
  "Noted / filed",
]);

export type Tone =
  | "overdue"
  | "awaiting"
  | "closed"
  | "info"
  | "flagged"
  | "gold"
  | "void"
  | "none";

export function toneOf(status: string, flagged: boolean): Tone {
  if (status === "Void") return "void";
  if (OVERDUE.has(status)) return "overdue";
  if (flagged) return "flagged";
  if (AWAITING.has(status)) return "awaiting";
  if (INFO.has(status)) return "info";
  if (CLOSED.has(status)) return "closed";
  return "none";
}

/** Text, tint and dot classes per tone (static strings for Tailwind). */
export const TONES: Record<Tone, { pill: string; dot: string; text: string }> =
  {
    overdue: {
      pill: "bg-status-overdue text-overdue",
      dot: "bg-overdue",
      text: "text-overdue",
    },
    awaiting: {
      pill: "bg-status-awaiting text-awaiting",
      dot: "bg-awaiting",
      text: "text-awaiting",
    },
    closed: {
      pill: "bg-status-closed text-closed",
      dot: "bg-closed",
      text: "text-closed",
    },
    info: {
      pill: "bg-status-info text-info",
      dot: "bg-info",
      text: "text-info",
    },
    flagged: {
      pill: "bg-status-flagged text-flagged",
      dot: "bg-flagged",
      text: "text-flagged",
    },
    gold: {
      pill: "bg-status-gold text-gold",
      dot: "bg-gold",
      text: "text-gold",
    },
    void: {
      pill: "bg-surface-raised text-text-faint line-through",
      dot: "bg-text-faint",
      text: "text-text-faint",
    },
    none: {
      pill: "bg-surface-raised text-text-muted",
      dot: "bg-text-faint",
      text: "text-text-muted",
    },
  };

export function StatusPill({
  children,
  tone,
  className = "",
}: {
  children: ReactNode;
  tone: Tone;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${t.pill} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  flags,
}: {
  status: string;
  flags: readonly string[];
}) {
  return (
    <StatusPill tone={toneOf(status, flags.length > 0)}>{status}</StatusPill>
  );
}

export function ColourKey() {
  const items: [Tone, string][] = [
    ["overdue", "Overdue"],
    ["awaiting", "Awaiting action"],
    ["info", "Dispatched"],
    ["closed", "Closed / done"],
    ["flagged", "Flagged"],
  ];
  return (
    <p className="text-text-muted flex flex-wrap gap-4 text-xs">
      {items.map(([tone, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${TONES[tone].dot}`}
            aria-hidden
          />
          {label}
        </span>
      ))}
    </p>
  );
}
