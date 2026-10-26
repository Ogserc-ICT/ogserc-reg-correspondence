// File Index and File Movement log (SPEC §6).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inputClass } from "@/app/_components/form";
import { statusTone } from "@/app/_components/status";
import type { MovementStatus } from "@/domain/files";
import { formatDate, formatDateTime } from "@/domain/format";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { fileIndex, movementLog, parseFileFilters } from "@/server/read/files";
import { flatParams, query, type Params } from "../register-ui";

export const metadata: Metadata = { title: "Files · OGSERC Registry" };

export default function FilesPage({ searchParams }: PageProps<"/files">) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">File Desk</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <Files searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const MOVEMENT_TONE: Record<MovementStatus, string> = {
  Overdue: "bg-status-overdue",
  Out: "bg-status-awaiting",
  Returned: "bg-status-closed",
};

async function Files({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("files.read");
  const params = flatParams(await searchParams);
  const view = params.view === "movements" ? "movements" : "index";
  const tab = (v: string, label: string) => (
    <Link
      href={query({}, { view: v === "index" ? undefined : v })}
      aria-current={view === v ? "page" : undefined}
      className={`rounded px-3 py-1.5 text-sm ${view === v ? "bg-neutral-800 text-white" : "border border-neutral-300"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {tab("index", "File Index")}
        {tab("movements", "Movements")}
        {can(user, "files.write") && (
          <Link
            href="/files/new"
            className="bg-brand-green ml-auto rounded px-4 py-2 text-sm text-white"
          >
            Add to File Index
          </Link>
        )}
      </div>
      {view === "index" ? (
        <Index params={params} />
      ) : (
        <Movements params={params} />
      )}
    </>
  );
}

async function Index({ params }: { params: Params }) {
  const user = await requireCan("files.read");
  const db = getDb();
  const units = await db.unit.findMany({ orderBy: { sortOrder: "asc" } });
  const { rows } = await fileIndex(
    db,
    user,
    parseFileFilters(params),
    appNow(),
  );
  const small = `${inputClass} py-1.5`;

  return (
    <>
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 text-sm"
      >
        <label>
          <span className="block text-xs text-neutral-600">Search</span>
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Reference or title"
            className={small}
          />
        </label>
        <label>
          <span className="block text-xs text-neutral-600">File status</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className={small}
          >
            <option value="">Any</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>
          <span className="block text-xs text-neutral-600">Owning unit</span>
          <select
            name="unit"
            defaultValue={params.unit ?? ""}
            className={small}
          >
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            name="out"
            value="1"
            defaultChecked={params.out === "1"}
          />
          Out with officers
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            name="overdue"
            value="1"
            defaultChecked={params.overdue === "1"}
          />
          Overdue returns
        </label>
        <button
          type="submit"
          className="bg-brand-green rounded px-4 py-1.5 text-white"
        >
          Apply
        </button>
        <Link href="/files" className="px-2 py-1.5 underline">
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-neutral-600">
            <tr>
              <th className="py-2 pr-3 font-medium">Reference</th>
              <th className="py-2 pr-3 font-medium">Title</th>
              <th className="py-2 pr-3 font-medium">Class</th>
              <th className="py-2 pr-3 font-medium">Security</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Currently with</th>
              <th className="py-2 pr-3 font-medium">Out since</th>
              <th className="py-2 pr-3 font-medium">Days out</th>
              <th className="py-2 pr-3 font-medium">In / Out</th>
              <th className="py-2 pr-3 font-medium">Last correspondence</th>
              <th className="py-2 pr-3 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const overdue =
                f.derived.isOut && f.derived.latestMovementStatus === "Overdue";
              return (
                <tr
                  key={f.id}
                  className="border-b border-neutral-100 align-top"
                >
                  <td className="py-2 pr-3 font-mono whitespace-nowrap">
                    <Link
                      href={`/files/${f.id}`}
                      className="text-brand-green underline"
                    >
                      {f.reference}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{f.title}</td>
                  <td className="py-2 pr-3">{f.fileClass?.label ?? "—"}</td>
                  <td className="py-2 pr-3">{f.security.label}</td>
                  <td className="py-2 pr-3">{f.fileStatus.label}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 ${f.derived.isOut ? (overdue ? "bg-status-overdue" : "bg-status-awaiting") : ""}`}
                    >
                      {f.derived.currentlyWith}
                    </span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDate(f.derived.outSince)}
                  </td>
                  <td className="py-2 pr-3">
                    {f.derived.workingDaysOut ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {f.derived.inwardCount} / {f.derived.outwardCount}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDate(f.derived.lastCorrespondence)}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {f.derived.flags.join("; ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-6 text-neutral-500">No files match.</p>
        )}
      </div>
    </>
  );
}

async function Movements({ params }: { params: Params }) {
  const user = await requireCan("files.read");
  const status = (["Out", "Overdue", "Returned"] as const).find(
    (s) => s === params.status,
  );
  const rows = await movementLog(getDb(), user, status, appNow());
  return (
    <>
      <form method="get" className="mb-4 flex items-end gap-3 text-sm">
        <input type="hidden" name="view" value="movements" />
        <label>
          <span className="block text-xs text-neutral-600">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className={`${inputClass} py-1.5`}
          >
            <option value="">Any</option>
            <option value="Out">Out</option>
            <option value="Overdue">Overdue</option>
            <option value="Returned">Returned</option>
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand-green rounded px-4 py-1.5 text-white"
        >
          Apply
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-neutral-600">
            <tr>
              <th className="py-2 pr-3 font-medium">Out</th>
              <th className="py-2 pr-3 font-medium">File</th>
              <th className="py-2 pr-3 font-medium">Issued to</th>
              <th className="py-2 pr-3 font-medium">Purpose</th>
              <th className="py-2 pr-3 font-medium">Released by</th>
              <th className="py-2 pr-3 font-medium">Return due</th>
              <th className="py-2 pr-3 font-medium">Returned</th>
              <th className="py-2 pr-3 font-medium">Days out</th>
              <th className="py-2 pr-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-neutral-100 align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDateTime(m.outAt)}
                </td>
                <td className="py-2 pr-3 font-mono">
                  <Link href={`/files/${m.file.id}`} className="underline">
                    {m.file.reference}
                  </Link>
                </td>
                <td className="py-2 pr-3">{m.derived.holder}</td>
                <td className="py-2 pr-3">{m.purpose ?? "—"}</td>
                <td className="py-2 pr-3">{m.releasedBy.name}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDate(m.derived.returnDue)}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatDate(fromDbDate(m.dateReturned))}
                </td>
                <td className="py-2 pr-3">{m.derived.workingDaysOut}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${MOVEMENT_TONE[m.derived.status]}`}
                  >
                    {m.derived.status}
                  </span>
                  {m.derived.flags.length > 0 && (
                    <span
                      className={`ml-1 rounded px-1 text-xs ${statusTone("", true)}`}
                    >
                      {m.derived.flags.join("; ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-6 text-neutral-500">No movements.</p>
        )}
      </div>
    </>
  );
}
