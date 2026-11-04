// The intake list shared by the Front Desk (awaiting registry) and the Front
// Desk Log (SPEC-v2 C3.2).
import Link from "next/link";
import { StatusPill } from "@/app/_components/status";
import { formatDateTime } from "@/domain/format";
import type { IntakeStatus } from "@/domain/front-desk";

export type IntakeTableRow = {
  id: string;
  intakeNo: string;
  receivedAt: Date;
  sender: string;
  subject: string;
  mode: { label: string };
  type: { name: string } | null;
  receivedBy: { name: string };
  inwardItem: { id: string; number: string } | null;
  derived: { status: IntakeStatus; workingDaysWaiting: number };
};

const TH =
  "text-text-faint px-5 py-3 text-left text-xs font-semibold tracking-wider whitespace-nowrap uppercase";
const TD = "px-5 py-3.5";

export function IntakeTable({
  label,
  rows,
  empty,
  full = false,
  canRegister = false,
  canOpenItems = false,
}: {
  label: string;
  rows: IntakeTableRow[];
  empty: string;
  /** The log: mode, type, received by, status and the ACK number. */
  full?: boolean;
  /** Registry officers: a "Register" link into New Inward. */
  canRegister?: boolean;
  /** Link the ACK number to the inward item. */
  canOpenItems?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className="border-border-subtle bg-surface rounded-panel mt-4 overflow-x-auto border"
    >
      <table className="w-full min-w-[56rem] text-sm">
        <thead>
          <tr className="border-border-subtle border-b">
            {[
              "Intake no.",
              "Received",
              "Sender · Subject",
              ...(full ? ["Mode · Type", "Received by", "Status"] : []),
              "Working days waiting",
              ...(canRegister ? [""] : []),
            ].map((h, i) => (
              <th key={i} scope="col" className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border-subtle divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-raised/50">
              <td className={`${TD} font-mono text-[13px] whitespace-nowrap`}>
                {r.intakeNo}
              </td>
              <td className={`${TD} whitespace-nowrap`}>
                {formatDateTime(r.receivedAt)}
              </td>
              <td className={TD}>
                {r.sender}
                <span className="text-text-muted block">{r.subject}</span>
              </td>
              {full && (
                <>
                  <td className={`${TD} text-text-muted`}>
                    {r.mode.label}
                    <span className="text-text-faint block text-xs">
                      {r.type?.name ?? "Type not known"}
                    </span>
                  </td>
                  <td className={`${TD} text-text-muted`}>
                    {r.receivedBy.name}
                  </td>
                  <td className={TD}>
                    <StatusPill tone={r.inwardItem ? "closed" : "awaiting"}>
                      {r.derived.status}
                    </StatusPill>
                    {r.inwardItem && (
                      <span className="mt-1 block font-mono text-xs">
                        {canOpenItems ? (
                          <Link
                            href={`/inward/${r.inwardItem.id}`}
                            className="text-accent hover:underline"
                          >
                            {r.inwardItem.number}
                          </Link>
                        ) : (
                          r.inwardItem.number
                        )}
                      </span>
                    )}
                  </td>
                </>
              )}
              <td className={`${TD} font-mono tabular-nums`}>
                {r.derived.workingDaysWaiting}
              </td>
              {canRegister && (
                <td className={`${TD} text-right`}>
                  {!r.inwardItem && (
                    <Link
                      href={`/inward/new?intake=${r.id}`}
                      className="text-accent font-semibold whitespace-nowrap hover:underline"
                    >
                      Register
                    </Link>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-text-muted px-5 py-6">{empty}</p>
      )}
    </section>
  );
}
