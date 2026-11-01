"use client";
// The dashboard's two charts (STACK: Recharts only for the monthly trend and
// the unit breakdown). One axis each, a "Show as table" toggle, hover readouts.
// Series colours are the dark steps of the reference palette (blue #3987e5 /
// orange #d95926), validated for colour-blind readers on the panel colour
// #13171c. Chrome values mirror the tokens in globals.css (SVG attributes
// need real colours, not CSS variables).
import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const C = {
  inward: "#3987e5",
  outward: "#d95926",
  ink: "#eceef1", // --color-text
  ink2: "#a3acb8", // --color-text-muted
  muted: "#8c96a3", // --color-text-faint
  grid: "#1e232a", // --color-border-subtle
  axis: "#252b33", // --color-border
  surface: "#13171c", // --color-surface
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** "2026-11" → "Nov 26". */
const monthLabel = (m: string) =>
  `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

function ChartCard({
  title,
  subtitle,
  table,
  children,
}: {
  title: string;
  subtitle: string;
  table: ReactNode;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="rounded-panel border-border-subtle bg-surface border p-[22px]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-text-muted mt-0.5 text-xs">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="rounded-control border-border text-text-muted hover:text-text hover:bg-surface-raised h-9 border px-3 text-xs font-medium whitespace-nowrap"
        >
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
      {asTable ? table : children}
    </section>
  );
}

type TipProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly {
    name?: string | number;
    value?: unknown;
    color?: string;
  }[];
};

/** Values lead, labels follow; identity from a swatch, never coloured text. */
function Tip({
  active,
  payload,
  label,
  title,
}: TipProps & { title: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-control border-border bg-surface-raised border px-3 py-2 text-xs shadow-lg shadow-black/40">
      <p className="text-text-muted mb-1">{title(String(label))}</p>
      {payload.map((p) => (
        <p key={String(p.name)} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-0.5 w-3"
            style={{ background: p.color }}
          />
          <strong className="text-text">{String(p.value)}</strong>
          <span className="text-text-muted">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

/** The value at the end of a line, labelled with the series name (no legend hunting). */
function EndLabel(props: {
  x?: number | string;
  y?: number | string;
  index?: number;
  value?: unknown;
  name: string;
  last: number;
  /** Pixels to move the label so two end labels never overlap. */
  dy: number;
}) {
  if (props.index !== props.last) return null;
  return (
    <text
      x={Number(props.x) + 8}
      y={Number(props.y) + 4 + props.dy}
      fontSize={11}
      fill={C.ink2}
    >
      {props.name} {String(props.value)}
    </text>
  );
}

export function MonthlyChart({
  data,
}: {
  data: { month: string; inward: number; outward: number }[];
}) {
  const last = data.length - 1;
  // When the lines end together, the higher (or inward, on a tie) label goes
  // above its line and the other below, so the two never overlap.
  const end = data[last] ?? { inward: 0, outward: 0 };
  const close = Math.abs(end.inward - end.outward) <= 1;
  const inwardHigher = end.inward >= end.outward;
  const dy = (k: "inward" | "outward") =>
    !close ? 0 : (k === "inward") === inwardHigher ? -7 : 7;
  return (
    <ChartCard
      title="Items by month"
      subtitle="Inward by deemed receipt date, outward by date of document"
      table={
        <table className="w-full text-sm">
          <thead className="text-text-faint text-left text-xs tracking-wider uppercase">
            <tr>
              <th className="py-1 pr-3 font-semibold">Month</th>
              <th className="py-1 pr-3 text-right font-semibold">Inward</th>
              <th className="py-1 pr-3 text-right font-semibold">Outward</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-border-subtle border-t">
                <td className="py-1 pr-3">{monthLabel(d.month)}</td>
                <td className="py-1 pr-3 text-right">{d.inward}</td>
                <td className="py-1 pr-3 text-right">{d.outward}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ul
        className="text-text-muted mb-2 flex gap-4 text-xs"
        aria-label="Legend"
      >
        {(["inward", "outward"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-4"
              style={{ background: C[k] }}
            />
            {k === "inward" ? "Inward" : "Outward"}
          </li>
        ))}
      </ul>
      <div
        className="h-64"
        role="img"
        aria-label="Line chart of inward and outward items by month; use Show as table for the values"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 84, bottom: 0, left: -12 }}
          >
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tick={{ fontSize: 11, fill: C.muted }}
              stroke={C.axis}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: C.muted }}
              stroke={C.axis}
              width={40}
            />
            <Tooltip
              content={(p) => <Tip {...(p as TipProps)} title={monthLabel} />}
              cursor={{ stroke: C.axis, strokeWidth: 1 }}
            />
            {(["inward", "outward"] as const).map((k) => (
              <Line
                key={k}
                type="linear"
                dataKey={k}
                name={k === "inward" ? "Inward" : "Outward"}
                stroke={C[k]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5, stroke: C.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={k}
                  content={(p) => (
                    <EndLabel
                      {...p}
                      name={k === "inward" ? "Inward" : "Outward"}
                      last={last}
                      dy={dy(k)}
                    />
                  )}
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function PendingByUnitChart({
  data,
}: {
  data: { label: string; pending: number; overdue: number }[];
}) {
  const height = Math.max(160, data.length * 30 + 30);
  return (
    <ChartCard
      title="Pending inward items by unit"
      subtitle="Open, overdue and awaiting forwarding (one definition of pending)"
      table={
        <table className="w-full text-sm">
          <thead className="text-text-faint text-left text-xs tracking-wider uppercase">
            <tr>
              <th className="py-1 pr-3 font-semibold">Unit</th>
              <th className="py-1 pr-3 text-right font-semibold">Pending</th>
              <th className="py-1 pr-3 text-right font-semibold">
                of which overdue
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-border-subtle border-t">
                <td className="py-1 pr-3">{d.label}</td>
                <td className="py-1 pr-3 text-right">{d.pending}</td>
                <td className="py-1 pr-3 text-right">{d.overdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div
        style={{ height }}
        role="img"
        aria-label="Bar chart of pending inward items by unit; use Show as table for the values"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 36, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: C.muted }}
              stroke={C.axis}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={190}
              tick={{ fontSize: 11, fill: C.ink2 }}
              stroke={C.axis}
              interval={0}
            />
            <Tooltip
              content={(p) => <Tip {...(p as TipProps)} title={(l) => l} />}
              cursor={{ fill: "rgba(11,11,11,0.04)" }}
            />
            <Bar
              dataKey="pending"
              name="Pending"
              fill={C.inward}
              maxBarSize={20}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="pending"
                position="right"
                fontSize={11}
                fill={C.ink2}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
