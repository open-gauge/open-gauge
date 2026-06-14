import type { DashboardSummary } from "@/types/dashboard";
import {
  ActivityIcon,
  ApiIcon,
  DatabaseIcon,
  WarningIcon,
} from "@/components/icons";

interface StatCardProps {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  accent?: "teal" | "orange" | "red";
}

function StatCard({ label, value, sub, icon, accent = "teal" }: StatCardProps) {
  const accentClass = {
    teal:   "text-mar-accent",
    orange: "text-amber-500",
    red:    "text-red-500",
  }[accent];

  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <span className={accentClass}>{icon}</span>
      </div>
      <p className="text-3xl font-bold text-mar-text tracking-tight">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

export default function StatsCards({ data }: { data: DashboardSummary }) {
  return (
    <div className="grid grid-cols-4 gap-5">
      <StatCard label="Registered assets" value={data.registered_assets} sub="Total active assets"      icon={<DatabaseIcon size={18} />} accent="teal" />
      <StatCard label="Sensors"           value={data.sensors}           sub="Measurement channels"     icon={<ActivityIcon size={18} />} accent="teal" />
      <StatCard label="DAQ units"         value={data.daqs}              sub="Data acquisition systems" icon={<ApiIcon size={18} />}      accent="teal" />
      <StatCard label="Low health"        value={data.low_health_assets} sub="Health score below 70%"   icon={<WarningIcon size={18} />}  accent="red" />
    </div>
  );
}
