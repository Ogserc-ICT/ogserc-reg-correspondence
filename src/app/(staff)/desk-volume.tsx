"use client";
// Registry Desk: inward and outward items per month (inward by deemed receipt
// date, outward by date of document). One axis, a "Show as table" fallback.
import { useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
/** "2026-11" → "Nov 2026". */
const monthLabel = (m: string) =>
  `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

const SERIES = [
  {
    key: "inward",
    label: "Inward",
    fill: "var(--color-accent)",
    dot: "bg-accent",
  },
  {
    key: "outward",
    label: "Outward",
    fill: "var(--color-gold)",
    dot: "bg-gold",
  },
] as const;

export function DeskVolume({
  data,
}: {
  data: { month: string; inward: number; outward: number }[];
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="rounded-panel border-border-subtle bg-surface flex flex-col border px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Volume by month</h2>
        <ul aria-label="Legend" className="text-text-muted flex gap-4 text-xs">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-sm ${s.dot}`} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      {data.length === 0 ? (
        <p className="text-text-muted mt-4 text-sm">Nothing logged yet.</p>
      ) : asTable ? (
        <table className="mt-4 w-full text-sm">
          <thead className="text-text-faint text-left text-xs tracking-wider uppercase">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Month
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                Inward
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Outward
              </th>
            </tr>
          </thead>
          <tbody className="divide-border-subtle divide-y">
            {data.map((d) => (
              <tr key={d.month}>
                <td className="py-2 pr-3">{monthLabel(d.month)}</td>
                <td className="py-2 pr-3 text-right font-mono">{d.inward}</td>
                <td className="py-2 text-right font-mono">{d.outward}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className="mt-4 h-60"
          role="img"
          aria-label="Bar chart of inward and outward items by month; use Show as table for the values"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              barGap={8}
              margin={{ top: 8, right: 0, bottom: 0, left: -28 }}
            >
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--color-text-faint)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--color-surface-raised)" }}
                labelFormatter={(l) => monthLabel(String(l))}
                contentStyle={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  color: "var(--color-text)",
                  fontSize: 12,
                }}
                itemStyle={{ color: "var(--color-text)" }}
              />
              {SERIES.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.fill}
                  maxBarSize={34}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAsTable((v) => !v)}
        aria-pressed={asTable}
        className="text-accent mt-3 self-start rounded text-sm hover:underline"
      >
        {asTable ? "Show as chart" : "Show as table"}
      </button>
    </section>
  );
}
