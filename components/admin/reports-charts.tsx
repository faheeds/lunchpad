"use client";

/**
 * Reports charts — stacked bar chart for revenue over time (one bar per day,
 * stacked by school), bar chart for top items.
 * Receives pre-aggregated data from the server page so we don't double-query.
 */

import {
  ResponsiveContainer,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

export type RevenueDay = {
  /** Label for the x axis, e.g. "Oct 15". */
  date: string;
  /** yyyy-MM-dd, used for ordering. */
  sortKey: string;
  total: number;
  orders: number;
  /** Revenue in cents per school name. */
  bySchool: Record<string, number>;
};
type ItemPoint = { name: string; quantity: number };

// Earthy palette that reads on the cream background; first = brand green.
const SCHOOL_COLORS = ["#2C4031", "#C0673E", "#B8923A", "#4F6D8F", "#7C5A8A", "#6B8F71"];

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function ReportsCharts({
  revenue,
  schoolNames,
  topItems,
}: {
  revenue: RevenueDay[];
  schoolNames: string[];
  topItems: ItemPoint[];
}) {
  if (revenue.length === 0 && topItems.length === 0) return null;

  // Flatten per-school values onto each row so recharts can stack them.
  const data = revenue.map((d) => ({ ...d, ...d.bySchool }));
  const multiSchool = schoolNames.length > 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Revenue over time */}
      <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-4 py-3 border-b border-editorial-line">
          <p className="text-[13px] font-semibold text-editorial-ink">Revenue over time</p>
          <p className="text-[11px] text-editorial-ink-faint">
            By delivery date{multiSchool ? ", stacked by school" : ""}, in your filter range
          </p>
        </div>
        <div className="px-2 pt-3 pb-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3DBC6" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#938B78" }} stroke="#E3DBC6" />
              <YAxis tick={{ fontSize: 10, fill: "#938B78" }} stroke="#E3DBC6"
                tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip
                cursor={{ fill: "rgba(227,219,198,0.35)" }}
                contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #E3DBC6", backgroundColor: "#F6F1E6" }}
                formatter={(value: unknown, name: string) =>
                  typeof value === "number" ? [money(value), name] : [String(value), name]
                }
                labelFormatter={(label: unknown, payload: ReadonlyArray<{ payload?: RevenueDay }>) => {
                  const day = payload?.[0]?.payload;
                  return day
                    ? `${String(label)} — ${money(day.total)} total, ${day.orders} order${day.orders === 1 ? "" : "s"}`
                    : String(label);
                }}
              />
              {multiSchool ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} /> : null}
              {schoolNames.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  name={name}
                  stackId="revenue"
                  fill={SCHOOL_COLORS[i % SCHOOL_COLORS.length]}
                  radius={i === schoolNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top items by quantity */}
      <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-4 py-3 border-b border-editorial-line">
          <p className="text-[13px] font-semibold text-editorial-ink">Top items by quantity</p>
          <p className="text-[11px] text-editorial-ink-faint">In your filter range</p>
        </div>
        <div className="px-2 pt-3 pb-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topItems.slice(0, 8)} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3DBC6" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#938B78" }} stroke="#E3DBC6"
                interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: "#938B78" }} stroke="#E3DBC6" allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #E3DBC6", backgroundColor: "#F6F1E6" }} />
              <Bar dataKey="quantity" fill="#2C4031" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
