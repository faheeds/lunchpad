"use client";

/**
 * Reports charts — line chart for revenue over time, bar chart for top items.
 * Receives pre-aggregated data from the server page so we don't double-query.
 */

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

type RevenuePoint = { date: string; revenue: number; orders: number };
type ItemPoint = { name: string; quantity: number };

export function ReportsCharts({
  revenue,
  topItems,
}: {
  revenue: RevenuePoint[];
  topItems: ItemPoint[];
}) {
  if (revenue.length === 0 && topItems.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Revenue over time */}
      <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-4 py-3 border-b border-editorial-line">
          <p className="text-[13px] font-semibold text-editorial-ink">Revenue over time</p>
          <p className="text-[11px] text-editorial-ink-faint">By delivery date, in your filter range</p>
        </div>
        <div className="px-2 pt-3 pb-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenue} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3DBC6" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#938B78" }} stroke="#E3DBC6" />
              <YAxis tick={{ fontSize: 10, fill: "#938B78" }} stroke="#E3DBC6"
                tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #E3DBC6", backgroundColor: "#F6F1E6" }}
                formatter={(value: unknown, name: string) => {
                  if (name === "revenue" && typeof value === "number") {
                    return [`$${(value / 100).toFixed(2)}`, "Revenue"];
                  }
                  return [String(value), name];
                }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#2C4031" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
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
