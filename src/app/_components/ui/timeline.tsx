// A vertical list of steps: filled dot = done, hollow dot = still to do.
// Used for an item's progress (drawer, item pages) and its audit history.
import type { ReactNode } from "react";
import { TONES, type Tone } from "@/app/_components/status";

export type Step = {
  key?: string;
  title: ReactNode;
  detail?: ReactNode;
  tone: Tone;
  done: boolean;
};

const BORDER: Record<Tone, string> = {
  overdue: "border-overdue",
  awaiting: "border-awaiting",
  closed: "border-closed",
  info: "border-info",
  flagged: "border-flagged",
  gold: "border-gold",
  void: "border-text-faint",
  none: "border-text-faint",
};

export function Timeline({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li
          key={s.key ?? (typeof s.title === "string" ? s.title : i)}
          className="relative flex gap-3"
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="bg-border absolute top-4 left-[5px] h-[calc(100%+4px)] w-px"
            />
          )}
          <span
            aria-hidden
            className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full ${
              s.done
                ? TONES[s.tone].dot
                : `bg-surface border-2 ${BORDER[s.tone]}`
            }`}
          />
          <div className="min-w-0">
            <p
              className={`text-sm font-semibold ${s.done ? "" : TONES[s.tone].text}`}
            >
              {s.title}
              {!s.done && <span className="sr-only"> (to do)</span>}
            </p>
            {s.detail && (
              <div className="text-text-muted mt-0.5 text-xs">{s.detail}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
