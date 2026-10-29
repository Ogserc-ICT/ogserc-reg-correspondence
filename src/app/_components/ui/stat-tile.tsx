// Registry Desk / Dashboard counter: label (with a status dot when it needs
// attention), a large figure, and one line of context.
import Link from "next/link";
import { TONES, type Tone } from "@/app/_components/status";

export function StatTile({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  /** Colours the dot and figure; omit when the value needs no attention. */
  tone?: Tone;
  href?: string;
}) {
  const t = tone ? TONES[tone] : null;
  const body = (
    <>
      <span className="text-text-muted flex min-h-10 items-start gap-2 text-sm">
        {t && (
          <span
            aria-hidden
            className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`}
          />
        )}
        {label}
      </span>
      <span
        className={`mt-2 block font-mono text-3xl font-semibold tabular-nums ${t ? t.text : "text-text"}`}
      >
        {value}
      </span>
      {sub && <span className="text-text-faint mt-3 block text-xs">{sub}</span>}
    </>
  );
  const cls = `block rounded-card border bg-surface p-[18px] ${t ? "border-border" : "border-border-subtle"}`;
  return href ? (
    <Link
      href={href}
      className={`${cls} hover:border-text-faint transition-colors`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
