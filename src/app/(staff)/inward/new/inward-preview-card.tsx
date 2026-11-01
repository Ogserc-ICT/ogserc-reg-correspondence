// New Inward side panel: what the item will get when saved (number, deemed
// receipt, routing, response due, slip wording) and any warnings.
import { Icon } from "@/app/_components/ui/icons";
import { formatClockTime, formatDate } from "@/domain/format";
import type { InwardPreview } from "@/server/read/inward-preview";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium">{value ?? "—"}</dd>
    </div>
  );
}

function dueNote(p: InwardPreview): string | null {
  if (p.noteOnly) return "No response needed for this action.";
  if (!p.responseDue) return null;
  if (p.targetDays === null) return "Set by the sender's deadline.";
  const days = `${p.targetDays} working day${p.targetDays === 1 ? "" : "s"}`;
  if (!p.holidaysSkipped.length) return `${days}.`;
  const names = p.holidaysSkipped.map(
    (h) => `${formatDate(h.date)} (${h.name})`,
  );
  return `${days}, skipping the public holiday${names.length > 1 ? "s" : ""} on ${names.join(" and ")}.`;
}

export function InwardPreviewCard({
  preview: p,
  stale,
}: {
  preview: InwardPreview | null;
  /** True while a newer preview is being worked out. */
  stale: boolean;
}) {
  const note = p && dueNote(p);
  return (
    <div
      className={`space-y-4 transition-opacity ${stale ? "opacity-60" : ""}`}
      aria-busy={stale}
    >
      <section
        aria-labelledby="preview-title"
        className="rounded-panel border-border bg-surface border p-[22px]"
      >
        <h2
          id="preview-title"
          className="text-text-faint text-xs font-semibold tracking-wider uppercase"
        >
          Will be saved as
        </h2>
        <p className="mt-3 font-mono text-xl font-semibold break-all">
          {p?.expectedNumber ?? "OGSERC/ACK/…"}
        </p>
        <p className="text-text-faint mt-1 text-xs">
          {p?.expectedNumber
            ? "Expected number. It is fixed when you save."
            : "Enter the date, time and mode of receipt."}
        </p>

        {p?.deemedReceiptDate &&
          (p.deemedReason ? (
            <div className="rounded-card border-gold/40 bg-status-gold mt-4 flex gap-3 border p-3.5">
              <Icon name="clock" className="text-gold mt-0.5 h-5 w-5" />
              <div>
                <p className="text-gold font-semibold">
                  Deemed received {formatDate(p.deemedReceiptDate)}
                </p>
                <p className="text-text-muted mt-0.5 text-sm">
                  {p.deemedReason === "after-hours"
                    ? `${p.modeLabel ?? "Received"} at or after ${formatClockTime(p.officeClosingTime)} counts from the next working day (para 10(3)).`
                    : "Received on a weekend or public holiday, so it counts from the next working day (para 10(3))."}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-text-muted mt-4 text-sm">
              Deemed received{" "}
              <span className="text-text font-medium">
                {formatDate(p.deemedReceiptDate)}
              </span>{" "}
              (same day).
            </p>
          ))}

        <dl className="mt-4 text-sm">
          <Row label="Route to" value={p?.routeTo ?? null} />
          <Row label="Order reference" value={p?.orderRef ?? null} />
          <Row label="Category" value={p?.category ?? null} />
          <Row
            label="Response due"
            value={
              p?.noteOnly
                ? "Not needed"
                : p?.responseDue
                  ? formatDate(p.responseDue)
                  : null
            }
          />
          {note && <p className="text-text-faint pb-1.5 text-xs">{note}</p>}
          <div className="border-border-subtle mt-1.5 border-t pt-1.5">
            <Row label="Slip wording" value={p?.slipWording ?? null} />
          </div>
        </dl>
      </section>

      <section
        aria-live="polite"
        className={`rounded-panel border p-[18px] text-sm ${
          p?.warnings.length
            ? "border-flagged/40 bg-status-flagged"
            : "border-border-subtle bg-surface"
        }`}
      >
        {p?.warnings.length ? (
          <>
            <h2 className="text-flagged font-semibold">
              {p.warnings.length} warning{p.warnings.length > 1 ? "s" : ""}
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {p.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="text-text-muted mt-2 text-xs">
              You can still save; the item will be flagged.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-semibold">No warnings</h2>
            <p className="text-text-muted mt-1">
              Checks for duplicate CAC numbers, fee evidence and Schedule 2
              documents run on REG-01 filings.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
