import type { RecentAsset } from "@/types/dashboard";

const STATUS_STYLE: Record<string, string> = {
  valid: "bg-emerald-50 text-emerald-600 border-emerald-100",
  due_soon: "bg-amber-50 text-amber-600 border-amber-100",
  expired: "bg-red-50 text-red-600 border-red-100",
  not_calibrated: "bg-gray-50 text-gray-500 border-gray-100",
};

const STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  due_soon: "Due soon",
  expired: "Expired",
  not_calibrated: "Uncalibrated",
};

export default function RecentAssets({ data }: { data: RecentAsset[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#152330]">Recently updated assets</h3>
          <p className="text-xs text-gray-400 mt-0.5">Most recent edits across all sites</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 mt-0.5">
          <path d="M1 8h2.5l2-5 3 10 2-6.5 1.5 1.5H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((asset) => (
          <div
            key={asset.asset_id}
            className="flex-shrink-0 w-52 border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-gray-400">{asset.asset_id}</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                  STATUS_STYLE[asset.calibration_status] ?? STATUS_STYLE.not_calibrated
                }`}
              >
                ● {STATUS_LABEL[asset.calibration_status] ?? asset.calibration_status}
              </span>
            </div>
            <p className="text-sm font-semibold text-[#152330] leading-tight mb-1">{asset.name}</p>
            <p className="text-xs text-gray-400 truncate">
              {asset.manufacturer} · {asset.model}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
