"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import type { PieData } from "@/components/charts/pie-context";
import type { AssetTypeDistribution, DashboardSummary } from "@/types/dashboard";
import { SUBTYPE_COLOR } from "@/lib/tokens";
import { translateDynamic } from "@/lib/translate-dynamic";
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

// ── Mini donut ───────────────────────────────────────────────────────────────
interface Slice { name: string; value: number; color: string; filterValue: string; }

function MiniDonut({ slices, centerLabel, onSliceClick }: {
  slices: Slice[];
  centerLabel: string;
  onSliceClick?: (slice: Slice) => void;
}) {
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
          <PieSlice
            key={i}
            index={i}
            hoverEffect="none"
            showGlow={false}
            onClick={total > 0 && onSliceClick ? () => onSliceClick(slices[i]) : undefined}
          />
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
  onSliceClick?: (slice: Slice) => void;
}

function StatCard({ label, centerLabel, icon, iconCls, slices, filterHref, onSliceClick }: CardProps) {
  const t = useTranslations("dashboard.cards");
  return (
    <div className="bg-og-surface rounded-xl border border-og-border p-4 shadow-xs flex flex-col gap-3">
      {/* Header: icon + label + optional filter */}
      <div className="flex items-center gap-2">
        <span className={`${iconCls} shrink-0`}>{icon}</span>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-none flex-1">
          {label}
        </p>
        {filterHref && (
          <Link
            href={filterHref}
            className="text-gray-300 hover:text-og-accent transition-colors shrink-0"
            title={t("filterTitle")}
          >
            <FilterIcon size={12} />
          </Link>
        )}
      </div>

      {/* Centered donut */}
      <div className="flex justify-center">
        <MiniDonut slices={slices} centerLabel={centerLabel} onSliceClick={onSliceClick} />
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
  const router = useRouter();
  const t = useTranslations("dashboard.cards");
  const tCal = useTranslations("dashboard.calStatus");
  const tSubtype = useTranslations("tokens.subtype");

  const calSlices: Slice[] = data.calibration_status_distribution.map((d) => ({
    name:  translateDynamic(tCal, d.status),
    value: d.count,
    color: CAL_COLOR[d.status] ?? "#9ca3af",
    filterValue: d.status,
  }));

  const sensorSlices: Slice[] = assetTypeDistribution.sensors.map((d) => ({
    name:  translateDynamic(tSubtype, d.type),
    value: d.count,
    color: SUBTYPE_COLOR[d.type] ?? "#6b7280",
    filterValue: d.type,
  }));

  const daqSlices: Slice[] = assetTypeDistribution.daqs.map((d) => ({
    name:  translateDynamic(tSubtype, d.type),
    value: d.count,
    color: SUBTYPE_COLOR[d.type] ?? "#6b7280",
    filterValue: d.type,
  }));

  const procedureSlices: Slice[] = (data.procedure_distribution ?? []).map((d) => ({
    name:  translateDynamic(tSubtype, d.type),
    value: d.count,
    color: SUBTYPE_COLOR[d.type] ?? "#6b7280",
    filterValue: d.type,
  }));

  return (
    <div className="grid grid-cols-4 gap-5">
      <StatCard
        label={t("registeredAssets")}
        centerLabel={t("assetsCenter")}
        icon={<DatabaseIcon size={16} />} iconCls="text-og-accent"
        slices={calSlices}
        onSliceClick={(s) => router.push(`/assets?status=${encodeURIComponent(s.filterValue)}`)}
      />
      <StatCard
        label={t("sensors")}
        centerLabel={t("sensorsCenter")}
        icon={<ActivityIcon size={16} />} iconCls="text-og-accent"
        slices={sensorSlices}
        filterHref="/assets?asset_type=sensor"
        onSliceClick={(s) => router.push(`/assets?asset_type=sensor&subtype=${encodeURIComponent(s.filterValue)}&subtype_label=${encodeURIComponent(s.name)}`)}
      />
      <StatCard
        label={t("daqUnits")}
        centerLabel={t("daqCenter")}
        icon={<ApiIcon size={16} />} iconCls="text-og-accent"
        slices={daqSlices}
        filterHref="/assets?asset_type=daq"
        onSliceClick={(s) => router.push(`/assets?asset_type=daq&subtype=${encodeURIComponent(s.filterValue)}&subtype_label=${encodeURIComponent(s.name)}`)}
      />
      <StatCard
        label={t("procedures")}
        centerLabel={t("proceduresCenter")}
        icon={<ProceduresIcon size={16} />} iconCls="text-og-accent"
        slices={procedureSlices}
        onSliceClick={(s) => router.push(`/procedures?physical_quantity=${encodeURIComponent(s.filterValue)}&physical_quantity_label=${encodeURIComponent(s.name)}`)}
      />
    </div>
  );
}
