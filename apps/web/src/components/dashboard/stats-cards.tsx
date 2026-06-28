"use client";

import Link from "next/link";
import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import type { AssetTypeDistribution, DashboardSummary } from "@/types/dashboard";
import { SUBTYPE_COLOR, SUBTYPE_LABEL } from "@/lib/tokens";
import {
  ActivityIcon,
  ApiIcon,
  DatabaseIcon,
  FilterIcon,
  WarningIcon,
} from "@/components/icons";

// ── Calibration-status colours ───────────────────────────────────────────────
const CAL_COLOR: Record<string, string> = {
  valid:          "#22c55e",
  due_soon:       "#f59e0b",
  expired:        "#ef4444",
  not_calibrated: "#9ca3af",
};
const CAL_LABEL: Record<string, string> = {
  valid:          "Calibrated",
  due_soon:       "Due soon",
  expired:        "Overdue",
  not_calibrated: "Uncalibrated",
};

// ── Mini donut ───────────────────────────────────────────────────────────────
interface Slice { name: string; value: number; color: string; }

function MiniDonut({ slices }: { slices: Slice[] }) {
  const [hovered, setHovered] = useState<Slice | null>(null);
  const total = slices.reduce((s, d) => s + d.value, 0);
  const data  = total === 0 ? [{ name: "—", value: 1, color: "#e5e7eb" }] : slices;

  return (
    <div className="flex flex-col items-center flex-shrink-0">
      {/* 20 % smaller than original (110 → 88, radii 30/46 → 24/37) */}
      <PieChart width={88} height={88}>
        <Pie
          data={data}
          cx={44} cy={44}
          innerRadius={24} outerRadius={37}
          paddingAngle={total === 0 ? 0 : 2}
          dataKey="value"
          startAngle={90} endAngle={-270}
          strokeWidth={0}
          onMouseLeave={() => setHovered(null)}
        >
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.color}
              onMouseEnter={() => total > 0 && setHovered(entry)}
            />
          ))}
        </Pie>
      </PieChart>
      {/* Fixed-height hover label — no layout shift */}
      <div className="h-4 flex items-center justify-center">
        {hovered && (
          <p className="text-[10px] text-center leading-none">
            <span className="font-bold text-mar-text">{hovered.value}</span>
            <span className="text-gray-400 ml-1">{hovered.name}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Single stat card ─────────────────────────────────────────────────────────
interface CardProps {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  iconCls: string;
  slices?: Slice[];
  filterHref?: string;
}

function StatCard({ label, value, sub, icon, iconCls, slices, filterHref }: CardProps) {
  return (
    <div className="relative bg-mar-surface rounded-xl border border-mar-border p-5 shadow-sm">
      <div className="flex items-center gap-3">

        {/* Text column */}
        <div className="flex-1 min-w-0">
          {/* Icon sits LEFT of the label */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`${iconCls} flex-shrink-0`}>{icon}</span>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-snug">{label}</p>
          </div>
          <p className="text-3xl font-bold text-mar-text tracking-tight">{value.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>

        {/* Right side: donut (if any) + filter icon below it */}
        {slices ? (
          <div className="flex flex-col items-center flex-shrink-0">
            <MiniDonut slices={slices} />
            {filterHref && (
              <Link
                href={filterHref}
                className="mt-1 text-gray-300 hover:text-mar-accent transition-colors"
                title="View in asset registry"
              >
                <FilterIcon size={12} />
              </Link>
            )}
          </div>
        ) : filterHref ? (
          /* Card without donut: filter icon goes to the bottom-right corner */
          <Link
            href={filterHref}
            className="absolute bottom-3 right-3 text-gray-300 hover:text-mar-accent transition-colors"
            title="View in asset registry"
          >
            <FilterIcon size={13} />
          </Link>
        ) : null}

      </div>
    </div>
  );
}

// ── Public export ────────────────────────────────────────────────────────────
export default function StatsCards({
  data,
  assetTypeDistribution,
}: {
  data: DashboardSummary;
  assetTypeDistribution: AssetTypeDistribution;
}) {
  const calSlices: Slice[] = data.calibration_status_distribution.map((d) => ({
    name:  CAL_LABEL[d.status] ?? d.status,
    value: d.count,
    color: CAL_COLOR[d.status] ?? "#9ca3af",
  }));

  const sensorSlices: Slice[] = assetTypeDistribution.sensors.map((d) => ({
    name:  SUBTYPE_LABEL[d.type] ?? d.type,
    value: d.count,
    color: SUBTYPE_COLOR[d.type] ?? "#6b7280",
  }));

  const daqSlices: Slice[] = assetTypeDistribution.daqs.map((d) => ({
    name:  SUBTYPE_LABEL[d.type] ?? d.type,
    value: d.count,
    color: SUBTYPE_COLOR[d.type] ?? "#6b7280",
  }));

  return (
    <div className="grid grid-cols-4 gap-5">
      <StatCard
        label="Registered assets" value={data.registered_assets}
        sub="By calibration status"
        icon={<DatabaseIcon size={18} />} iconCls="text-mar-accent"
        slices={calSlices}
      />
      <StatCard
        label="Sensors" value={data.sensors}
        sub="By physical quantity"
        icon={<ActivityIcon size={18} />} iconCls="text-mar-accent"
        slices={sensorSlices}
        filterHref="/assets?asset_type=sensor"
      />
      <StatCard
        label="DAQ units" value={data.daqs}
        sub="By interface type"
        icon={<ApiIcon size={18} />} iconCls="text-mar-accent"
        slices={daqSlices}
        filterHref="/assets?asset_type=daq"
      />
      <StatCard
        label="Low health" value={data.low_health_assets}
        sub="Health score below 70 %"
        icon={<WarningIcon size={18} />} iconCls="text-red-500"
        filterHref="/assets?health_max=70"
      />
    </div>
  );
}
