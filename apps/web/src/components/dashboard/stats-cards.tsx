import type { DashboardSummary } from "@/types/dashboard";

interface StatCardProps {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  accent?: "teal" | "orange" | "red";
}

function StatCard({ label, value, sub, icon, accent = "teal" }: StatCardProps) {
  const accentColor = {
    teal: "text-[#2f819b]",
    orange: "text-amber-500",
    red: "text-red-500",
  }[accent];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <span className={accentColor}>{icon}</span>
      </div>
      <p className="text-3xl font-bold text-[#152330] tracking-tight">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

export default function StatsCards({ data }: { data: DashboardSummary }) {
  return (
    <div className="grid grid-cols-4 gap-5">
      <StatCard
        label="Registered assets"
        value={data.registered_assets}
        sub="+0 this week"
        icon={<DatabaseIcon />}
        accent="teal"
      />
      <StatCard
        label="Valid calibrations"
        value={data.valid_calibrations}
        sub={`${data.valid_coverage_pct}% coverage`}
        icon={<CheckCircleIcon />}
        accent="teal"
      />
      <StatCard
        label="Due within 30 days"
        value={data.due_within_30_days}
        sub="Requires scheduling"
        icon={<ClockIcon />}
        accent="orange"
      />
      <StatCard
        label="Expired"
        value={data.expired}
        sub="Action required"
        icon={<WarningIcon />}
        accent="red"
      />
    </div>
  );
}

function DatabaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="4" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m5 8 2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 1.5 13.5h13L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 7v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
