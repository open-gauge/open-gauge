import type { UpcomingAsset } from "@/types/dashboard";

const CATEGORY_LABEL: Record<string, string> = {
  sensor: "Sensor",
  instrument: "Instrument",
  reference_standard: "Ref. Standard",
  data_acquisition: "DAQ",
  other: "Other",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "expired") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
        ● Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">
      ● Due soon
    </span>
  );
}

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-[#2f819b]" : score >= 50 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-14 text-right">{score}% health</span>
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function UpcomingTable({ data }: { data: UpcomingAsset[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#152330]">Upcoming &amp; overdue</h3>
          <p className="text-xs text-gray-400 mt-0.5">Assets requiring attention</p>
        </div>
        <a href="/assets" className="text-xs text-gray-400 hover:text-[#2f819b] flex items-center gap-1 transition-colors">
          View all
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 8 8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <div className="space-y-1">
        {data.map((asset) => (
          <div
            key={asset.asset_id}
            className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#152330] truncate">{asset.name}</span>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                  {asset.asset_id}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {CATEGORY_LABEL[asset.category] ?? asset.category} · next due {formatDate(asset.next_due_at)}
              </p>
            </div>

            <div className="flex-shrink-0 w-48">
              <HealthBar score={asset.health_score} />
            </div>

            <div className="flex-shrink-0">
              <StatusBadge status={asset.calibration_status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
