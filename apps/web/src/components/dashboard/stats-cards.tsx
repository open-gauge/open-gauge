"use client";

import Link from "next/link";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import type { PieData } from "@/components/charts/pie-context";
import type { AssetTypeDistribution, DashboardSummary } from "@/types/dashboard";
import { SUBTYPE_COLOR, SUBTYPE_LABEL } from "@/lib/tokens";
import {
  ActivityIcon,
  ApiIcon,
  DatabaseIcon,
  FilterIcon,
  ProceduresIcon,
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

function MiniDonut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const total = slices.reduce((s, d) => s + d.value, 0);

  const data: PieData[] = total === 0
    ? [{ label: "—", value: 1, color: "#e5e7eb" }]
    : slices.map((s) => ({ label: s.name, value: s.value, color: s.color }));

  return (
    <div className="shrink-0">
      <PieChart
        data={data}
        size={120}
        innerRadius={38}
        hoverOffset={0}
        padAngle={total === 0 ? 0 : 0.04}
      >
        {data.map((_, i) => (
          <PieSlice key={i} index={i} hoverEffect="none" showGlow={false} />
        ))}
        {total > 0 && <PieCenter defaultLabel={centerLabel} />}
      </PieChart>
    </div>
  );
}

// ── Single stat card ─────────────────────────────────────────────────────────
interface CardProps {
  label:       string;
  centerLabel: string;
  icon:        React.ReactNode;
  iconCls:     string;
  slices:      Slice[];
  filterHref?: string;
}

function StatCard({ label, centerLabel, icon, iconCls, slices, filterHref }: CardProps) {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border p-4 shadow-xs flex flex-col gap-3">
      {/* Header: icon + label + optional filter */}
      <div className="flex items-center gap-2">
        <span className={`${iconCls} shrink-0`}>{icon}</span>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-none flex-1">
          {label}
        </p>
        {filterHref && (
          <Link
            href={filterHref}
            className="text-gray-300 hover:text-mar-accent transition-colors shrink-0"
            title="View in asset registry"
          >
            <FilterIcon size={12} />
          </Link>
        )}
      </div>

      {/* Centered donut */}
      <div className="flex justify-center">
        <MiniDonut slices={slices} centerLabel={centerLabel} />
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

  const procedureSlices: Slice[] = (data.procedure_distribution ?? []).map((d) => ({
    name:  SUBTYPE_LABEL[d.type] ?? d.type,
    value: d.count,
    color: SUBTYPE_COLOR[d.type] ?? "#6b7280",
  }));

  return (
    <div className="grid grid-cols-4 gap-5">
      <StatCard
        label="Registered assets"
        centerLabel="Assets"
        icon={<DatabaseIcon size={16} />} iconCls="text-mar-accent"
        slices={calSlices}
      />
      <StatCard
        label="Sensors"
        centerLabel="Sensors"
        icon={<ActivityIcon size={16} />} iconCls="text-mar-accent"
        slices={sensorSlices}
        filterHref="/assets?asset_type=sensor"
      />
      <StatCard
        label="DAQ units"
        centerLabel="DAQ"
        icon={<ApiIcon size={16} />} iconCls="text-mar-accent"
        slices={daqSlices}
        filterHref="/assets?asset_type=daq"
      />
      <StatCard
        label="Procedures"
        centerLabel="Procedures"
        icon={<ProceduresIcon size={16} />} iconCls="text-mar-accent"
        slices={procedureSlices}
      />
    </div>
  );
}
