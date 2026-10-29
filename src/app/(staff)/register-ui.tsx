// Building blocks shared by the Inward and Outward registers: a GET filter
// form (so filters live in the URL and the CSV export can reuse them),
// sortable column headers and paging.
import Link from "next/link";
import { inputClass } from "@/app/_components/ui/input";

export type Params = Record<string, string | undefined>;

export function query(params: Params, changes: Params = {}): string {
  const merged = { ...params, ...changes };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

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
}: {
  base: string;
  params: Params;
  statuses: readonly string[];
  units: readonly { id: string; label: string }[];
  types: readonly { id: string; label: string }[];
  dateLabel: string;
  searchHint: string;
}) {
  const small = `${inputClass} py-1.5`;
  return (
    <form
      action={base}
      method="get"
      className="mb-4 grid gap-3 rounded border border-neutral-200 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6"
    >
      <label className="sm:col-span-2">
        <span className="block text-xs text-neutral-600">Search</span>
        <input
          name="q"
          defaultValue={params.q}
          placeholder={searchHint}
          className={small}
        />
      </label>
      <label>
        <span className="block text-xs text-neutral-600">Status</span>
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
        <span className="block text-xs text-neutral-600">Unit</span>
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
        <span className="block text-xs text-neutral-600">Type</span>
        <select name="type" defaultValue={params.type ?? ""} className={small}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-end gap-2 pb-1.5">
        <input
          type="checkbox"
          name="flagged"
          value="1"
          defaultChecked={params.flagged === "1"}
        />
        Flagged only
      </label>
      <label>
        <span className="block text-xs text-neutral-600">{dateLabel} from</span>
        <input
          type="date"
          name="from"
          defaultValue={params.from}
          className={small}
        />
      </label>
      <label>
        <span className="block text-xs text-neutral-600">to</span>
        <input
          type="date"
          name="to"
          defaultValue={params.to}
          className={small}
        />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          className="bg-brand-green rounded px-4 py-1.5 text-white"
        >
          Apply
        </button>
        <Link href={base} className="px-2 py-1.5 text-neutral-700 underline">
          Reset
        </Link>
        <a
          href={`${base}/export${query(params, { page: undefined })}`}
          className="ml-auto px-2 py-1.5 underline"
        >
          Export CSV
        </a>
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
      className="py-2 pr-3 text-left font-medium"
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
        className="hover:underline"
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
    <nav className="mt-4 flex items-center gap-4 text-sm" aria-label="Pages">
      <span className="text-neutral-600">
        {total} item{total === 1 ? "" : "s"}
      </span>
      {page > 1 && (
        <Link
          href={query(params, { page: String(page - 1) })}
          className="underline"
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
          className="underline"
        >
          Next →
        </Link>
      )}
    </nav>
  );
}
