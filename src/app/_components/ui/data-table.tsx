// Register-style table. It scrolls sideways inside its own box, so the page
// never does. The box is a labelled region (a section, so screen readers can
// jump to it).
import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  empty = "Nothing to show.",
  minWidth = "44rem",
}: {
  /** Accessible name of the scroll region. */
  label: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  empty?: string;
  minWidth?: string;
}) {
  if (rows.length === 0)
    return <p className="text-text-muted px-[22px] pb-5 text-sm">{empty}</p>;
  return (
    <section aria-label={label} className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-border-subtle border-y text-left">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className="text-text-faint px-[22px] py-3 text-xs font-semibold tracking-wider uppercase"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border-subtle divide-y">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-surface-raised/50">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`px-[22px] py-3.5 align-middle ${c.className ?? ""}`}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
