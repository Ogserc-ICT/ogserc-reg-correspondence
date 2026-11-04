// File Index and File Movement log (SPEC §6).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusPill } from "@/app/_components/status";
import { buttonClass } from "@/app/_components/ui/button";
import { Icon } from "@/app/_components/ui/icons";
import { inputClass } from "@/app/_components/ui/input";
import { PageHeader } from "@/app/_components/ui/page-header";
import { formatDate, formatDateTime } from "@/domain/format";
import { can } from "@/domain/permissions";
import { appNow } from "@/server/clock";
import { requireCan } from "@/server/current-user";
import { fromDbDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { fileIndex, movementLog, parseFileFilters } from "@/server/read/files";
import { flatParams, query, type Params } from "../register-ui";
import { MOVEMENT_TONE } from "./movement-tone";

export const metadata: Metadata = {
  title: "Internal File Desk · OGSERC Registry",
};

export default function FilesPage({ searchParams }: PageProps<"/files">) {
  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <Suspense
        fallback={
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Internal File Desk
            </h1>
            <p className="text-text-muted mt-2">Loading…</p>
          </>
        }
      >
        <Files searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const TH =
  "text-text-faint px-5 py-3 text-left text-xs font-semibold tracking-wider whitespace-nowrap uppercase";
const TD = "px-5 py-3.5";
const label = "text-text-muted block pb-1.5 text-xs";

async function Files({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCan("files.read");
  const params = flatParams(await searchParams);
  const view = params.view === "movements" ? "movements" : "index";
  const tab = (v: string, text: string) => (
    <Link
      href={query({}, { view: v === "index" ? undefined : v })}
      aria-current={view === v ? "page" : undefined}
      className={`inline-flex h-10 items-center rounded-full border px-4 text-sm transition-colors ${
        view === v
          ? "border-text bg-text text-bg font-semibold"
          : "border-border bg-surface text-text hover:border-text-faint"
      }`}
    >
      {text}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Internal File Desk"
        intro="Where every physical file is, which OGSERC unit or officer has it, and when it is due back."
        actions={
          can(user, "files.write") && (
            <Link href="/files/new" className={buttonClass("primary")}>
              <Icon name="plus" className="h-4 w-4" />
              New file
            </Link>
          )
        }
      />
      <nav aria-label="File Desk views" className="mt-6 flex gap-2">
        {tab("index", "File Index")}
        {tab("movements", "Movements")}
      </nav>
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

  return (
    <>
      <form
        method="get"
        className="rounded-card border-border-subtle bg-surface mt-4 grid gap-4 border p-4 text-sm sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <label>
          <span className={label}>Search</span>
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Reference or title"
            className={inputClass}
          />
        </label>
        <label>
          <span className={label}>File status</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className={inputClass}
          >
            <option value="">Any</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>
          <span className={label}>Owning unit</span>
          <select
            name="unit"
            defaultValue={params.unit ?? ""}
            className={inputClass}
          >
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-1">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="out"
              value="1"
              defaultChecked={params.out === "1"}
              className="accent-accent h-4 w-4"
            />
            Out with officers
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="overdue"
              value="1"
              defaultChecked={params.overdue === "1"}
              className="accent-accent h-4 w-4"
            />
            Overdue returns
          </label>
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
          <Link href="/files" className={buttonClass("ghost")}>
            Reset
          </Link>
        </div>
      </form>

      <section
        aria-label="File Index"
        className="border-border-subtle bg-surface rounded-panel mt-4 overflow-x-auto border"
      >
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-border-subtle border-b">
              <th scope="col" className={TH}>
                Reference · Title
              </th>
              <th scope="col" className={TH}>
                Class · Security
              </th>
              <th scope="col" className={TH}>
                Status
              </th>
              <th scope="col" className={TH}>
                Currently with
              </th>
              <th scope="col" className={TH}>
                Days out
              </th>
              <th scope="col" className={TH}>
                In / Out
              </th>
              <th scope="col" className={TH}>
                Last letter
              </th>
            </tr>
          </thead>
          <tbody className="divide-border-subtle divide-y">
            {rows.map((f) => {
              const overdue =
                f.derived.isOut && f.derived.latestMovementStatus === "Overdue";
              return (
                <tr key={f.id} className="hover:bg-surface-raised/50">
                  <td className={TD}>
                    <Link
                      href={`/files/${f.id}`}
                      className="hover:text-accent font-mono text-[13px] font-medium whitespace-nowrap hover:underline"
                    >
                      {f.reference}
                    </Link>
                    <span className="text-text-muted block">{f.title}</span>
                    {f.derived.flags.length > 0 && (
                      <span className="text-flagged block text-xs">
                        {f.derived.flags.join("; ")}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} text-text-muted`}>
                    {f.fileClass?.label ?? "—"}
                    <span className="text-text-faint block text-xs">
                      {f.security.label}
                    </span>
                  </td>
                  <td className={TD}>{f.fileStatus.label}</td>
                  <td className={TD}>
                    {f.derived.isOut ? (
                      <>
                        <StatusPill tone={overdue ? "overdue" : "awaiting"}>
                          {f.derived.currentlyWith}
                        </StatusPill>
                        <span className="text-text-faint mt-1 block text-xs">
                          since {formatDate(f.derived.outSince)}
                        </span>
                      </>
                    ) : (
                      <span className="text-text-muted">
                        {f.derived.currentlyWith}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} font-mono tabular-nums`}>
                    {f.derived.workingDaysOut ?? "—"}
                  </td>
                  <td className={`${TD} font-mono tabular-nums`}>
                    {f.derived.inwardCount} / {f.derived.outwardCount}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {formatDate(f.derived.lastCorrespondence)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-text-muted px-5 py-6">No files match.</p>
        )}
      </section>
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
      <form
        method="get"
        className="rounded-card border-border-subtle bg-surface mt-4 flex flex-wrap items-end gap-3 border p-4 text-sm"
      >
        <input type="hidden" name="view" value="movements" />
        <label className="min-w-48">
          <span className={label}>Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className={inputClass}
          >
            <option value="">Any</option>
            <option value="Out">Out</option>
            <option value="Overdue">Overdue</option>
            <option value="Returned">Returned</option>
          </select>
        </label>
        <button type="submit" className={buttonClass("primary")}>
          Apply
        </button>
      </form>
      <section
        aria-label="File movements"
        className="border-border-subtle bg-surface rounded-panel mt-4 overflow-x-auto border"
      >
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="border-border-subtle border-b">
              {[
                "Out",
                "File",
                "Issued to",
                "Purpose",
                "Released by",
                "Return due",
                "Returned",
                "Days out",
                "Status",
              ].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border-subtle divide-y">
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-surface-raised/50">
                <td className={`${TD} whitespace-nowrap`}>
                  {formatDateTime(m.outAt)}
                </td>
                <td className={TD}>
                  <Link
                    href={`/files/${m.file.id}`}
                    className="hover:text-accent font-mono text-[13px] font-medium whitespace-nowrap hover:underline"
                  >
                    {m.file.reference}
                  </Link>
                </td>
                <td className={TD}>{m.derived.holder}</td>
                <td className={`${TD} text-text-muted`}>{m.purpose ?? "—"}</td>
                <td className={`${TD} text-text-muted`}>{m.releasedBy.name}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  {formatDate(m.derived.returnDue)}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {formatDate(fromDbDate(m.dateReturned))}
                </td>
                <td className={`${TD} font-mono tabular-nums`}>
                  {m.derived.workingDaysOut}
                </td>
                <td className={TD}>
                  <StatusPill tone={MOVEMENT_TONE[m.derived.status]}>
                    {m.derived.status}
                  </StatusPill>
                  {m.derived.flags.length > 0 && (
                    <span className="text-flagged mt-1 block text-xs">
                      {m.derived.flags.join("; ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-text-muted px-5 py-6">No movements.</p>
        )}
      </section>
    </>
  );
}
