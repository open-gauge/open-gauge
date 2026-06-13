"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ThroughputPoint } from "@/types/dashboard";
import { ExternalLinkIcon } from "@/components/icons";
import { COLORS } from "@/lib/tokens";

export default function CalibrationChart({ data }: { data: ThroughputPoint[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-mar-text">Calibration throughput</h3>
          <p className="text-xs text-gray-400 mt-0.5">Completed vs expired — last 6 months</p>
        </div>
        <span className="text-xs text-gray-400 flex items-center gap-1">
          Last 6 months
          <ExternalLinkIcon />
        </span>
      </div>

      <div className="mt-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLORS.accent} stopOpacity={0.15} />
                <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
              labelStyle={{ color: "#374151", fontWeight: 600 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#6b7280", paddingTop: 12 }} />
            <Area
              type="monotone" dataKey="completed" name="Completed"
              stroke={COLORS.accent} strokeWidth={2}
              fill="url(#completedGrad)" dot={false}
              activeDot={{ r: 4, fill: COLORS.accent }}
            />
            <Area
              type="monotone" dataKey="expired" name="Expired"
              stroke="#ef4444" strokeWidth={1.5}
              fill="none" dot={false}
              activeDot={{ r: 4, fill: "#ef4444" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
