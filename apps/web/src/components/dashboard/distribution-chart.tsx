"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DistributionItem } from "@/types/dashboard";

const TYPE_LABELS: Record<string, string> = {
  sensor: "Sensors",
  instrument: "Instruments",
  reference_standard: "Ref. Standards",
  data_acquisition: "DAQ",
  other: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  sensor: "#06b6d4",
  instrument: "#3b82f6",
  reference_standard: "#f59e0b",
  data_acquisition: "#22c55e",
  other: "#6b7280",
};

export default function DistributionChart({ data }: { data: DistributionItem[] }) {
  const chartData = data.map((d) => ({
    name: TYPE_LABELS[d.type] ?? d.type,
    value: d.count,
    color: TYPE_COLORS[d.type] ?? "#6b7280",
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-5">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-[#152330]">Asset distribution</h3>
        <p className="text-xs text-gray-400 mt-0.5">By sensor type</p>
      </div>

      <div className="mt-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="48%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "#6b7280" }}
              formatter={(value, entry) => (
                <span style={{ color: "#6b7280" }}>
                  {value} {(entry.payload as { value?: number })?.value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
