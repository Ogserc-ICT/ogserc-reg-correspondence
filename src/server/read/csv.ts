// CSV for the register exports. Excel-friendly: UTF-8 with a byte-order mark,
// CRLF line ends, every field quoted when needed, and cells that start with
// = + - @ prefixed with ' so a spreadsheet never runs them as formulas.
export type Column<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel needs it to read UTF-8 (₦, accented names) correctly. */
const BOM = String.fromCharCode(0xfeff);

export function toCsv<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const r of rows)
    lines.push(columns.map((c) => cell(c.value(r))).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}
