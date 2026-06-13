import type { DashboardSummary } from "@/types/dashboard";
import {
  CheckCircleIcon,
  ClockIcon,
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
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
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
      <StatCard label="Registered assets"   value={data.registered_assets}   sub="+0 this week"               icon={<DatabaseIcon size={18} />}   accent="teal" />
      <StatCard label="Valid calibrations"   value={data.valid_calibrations}  sub={`${data.valid_coverage_pct}% coverage`} icon={<CheckCircleIcon size={18} />} accent="teal" />
      <StatCard label="Due within 30 days"  value={data.due_within_30_days}  sub="Requires scheduling"         icon={<ClockIcon size={18} />}       accent="orange" />
      <StatCard label="Expired"             value={data.expired}             sub="Action required"             icon={<WarningIcon size={18} />}     accent="red" />
    </div>
  );
}
