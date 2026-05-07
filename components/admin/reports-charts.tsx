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
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Revenue over time</p>
          <p className="text-[11px] text-slate-400">By delivery date, in your filter range</p>
        </div>
        <div className="px-2 pt-3 pb-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenue} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#cbd5e1"
                tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e2e8f0" }}
                formatter={(value: unknown, name: string) => {
                  if (name === "revenue" && typeof value === "number") {
                    return [`$${(value / 100).toFixed(2)}`, "Revenue"];
                  }
                  return [String(value), name];
                }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#c41230" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top items by quantity */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Top items by quantity</p>
          <p className="text-[11px] text-slate-400">In your filter range</p>
        </div>
        <div className="px-2 pt-3 pb-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topItems.slice(0, 8)} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} stroke="#cbd5e1"
                interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#cbd5e1" allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e2e8f0" }} />
              <Bar dataKey="quantity" fill="#7c3aed" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
