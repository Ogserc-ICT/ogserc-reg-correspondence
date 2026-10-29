// Building blocks shared by the Inward and Outward registers: a GET filter
// form (so filters live in the URL and the CSV export can reuse them),
// sortable column headers and paging.
import Link from "next/link";
import { buttonClass } from "@/app/_components/ui/button";
import { inputClass } from "@/app/_components/ui/input";

export type Params = Record<string, string | undefined>;

export function query(params: Params, changes: Params = {}): string {
  const merged = { ...params, ...changes };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** CSV export of what the register shows (every page). */
export const exportHref = (base: string, params: Params) =>
  `${base}/export${query(params, { page: undefined, item: undefined })}`;

export function flatParams(
  sp: Record<string, string | string[] | undefined>,
): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

export function FilterBar({
  base,
  params,
  statuses,
  units,
  types,
  dateLabel,
  searchHint,
  exportLink = true,
}: {
  base: string;
  params: Params;
  statuses: readonly string[];
  units: readonly { id: string; label: string }[];
  types: readonly { id: string; label: string }[];
  dateLabel: string;
  searchHint: string;
  /** Off when the page shows Export CSV in its header instead. */
  exportLink?: boolean;
}) {
  const small = inputClass;
  const label = "block pb-1.5 text-xs text-text-muted";
  return (
    <form
      action={base}
      method="get"
      className="grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6"
    >
      <label className="sm:col-span-2">
        <span className={label}>Search</span>
        <input
          name="q"
          defaultValue={params.q}
          placeholder={searchHint}
          className={small}
        />
      </label>
      <label>
        <span className={label}>Status</span>
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className={small}
        >
          <option value="">Any</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Unit</span>
        <select name="unit" defaultValue={params.unit ?? ""} className={small}>
          <option value="">All units</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Type</span>
        <select name="type" defaultValue={params.type ?? ""} className={small}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2 self-end">
        <input
          type="checkbox"
          name="flagged"
          value="1"
          defaultChecked={params.flagged === "1"}
        />
        Flagged only
      </label>
      <label>
        <span className={label}>{dateLabel} from</span>
        <input
          type="date"
          name="from"
          defaultValue={params.from}
          className={small}
        />
      </label>
      <label>
        <span className={label}>to</span>
        <input
          type="date"
          name="to"
          defaultValue={params.to}
          className={small}
        />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className={buttonClass("primary")}>
          Apply
        </button>
        <Link href={base} className={buttonClass("ghost")}>
          Reset
        </Link>
        {exportLink && (
          <a
            href={exportHref(base, params)}
            className={buttonClass("secondary", "ml-auto")}
          >
            Export CSV
          </a>
        )}
      </div>
    </form>
  );
}

export function SortHeader({
  label,
  sort,
  params,
}: {
  label: string;
  sort: string;
  params: Params;
}) {
  const active = params.sort === sort;
  const dir = active && params.dir === "asc" ? "desc" : "asc";
  return (
    <th
      scope="col"
      className="text-text-faint px-5 py-3 text-left text-xs font-semibold tracking-wider whitespace-nowrap uppercase"
      aria-sort={
        active
          ? params.dir === "desc"
            ? "descending"
            : "ascending"
          : undefined
      }
    >
      <Link
        href={query(params, { sort, dir, page: undefined })}
        className="hover:text-text rounded"
      >
        {label}
        {active ? (params.dir === "desc" ? " ↓" : " ↑") : ""}
      </Link>
    </th>
  );
}

export function Paging({
  params,
  page,
  pages,
  total,
}: {
  params: Params;
  page: number;
  pages: number;
  total: number;
}) {
  return (
    <nav
      className="text-text-muted mt-4 flex flex-wrap items-center gap-4 text-sm"
      aria-label="Pages"
    >
      <span>
        {total} item{total === 1 ? "" : "s"}
      </span>
      {page > 1 && (
        <Link
          href={query(params, { page: String(page - 1) })}
          className="text-accent hover:underline"
        >
          ← Previous
        </Link>
      )}
      <span>
        Page {page} of {pages}
      </span>
      {page < pages && (
        <Link
          href={query(params, { page: String(page + 1) })}
          className="text-accent hover:underline"
        >
          Next →
        </Link>
      )}
    </nav>
  );
}

/** Quick status filters with counts ("All · 3", "Overdue · 0"). */
export function StatusChips({
  params,
  chips,
}: {
  params: Params;
  chips: { label: string; count: number; status?: string; flagged?: boolean }[];
}) {
  const reset = {
    status: undefined,
    flagged: undefined,
    page: undefined,
    item: undefined,
  };
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Filter by status">
      {chips.map((c) => {
        const active = c.flagged
          ? params.flagged === "1"
          : (params.status ?? "") === (c.status ?? "") &&
            params.flagged !== "1";
        return (
          <li key={c.label}>
            <Link
              href={query(params, {
                ...reset,
                status: c.status,
                flagged: c.flagged ? "1" : undefined,
              })}
              aria-current={active ? "true" : undefined}
              className={`inline-flex h-10 items-center rounded-full border px-4 text-sm transition-colors ${
                active
                  ? "border-text bg-text text-bg font-semibold"
                  : "border-border bg-surface text-text hover:border-text-faint"
              }`}
            >
              {c.label} · {c.count}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
