import type { RecentAsset } from "@/types/dashboard";
import { ActivityIcon } from "@/components/icons";
import { CALIBRATION_STATUS_LABEL, CALIBRATION_STATUS_STYLE } from "@/lib/tokens";

export default function RecentAssets({ data }: { data: RecentAsset[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-mar-text">Recently updated assets</h3>
          <p className="text-xs text-gray-400 mt-0.5">Most recent edits across all sites</p>
        </div>
        <ActivityIcon size={14} className="text-gray-300 mt-0.5" />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((asset) => {
          const statusCls = CALIBRATION_STATUS_STYLE[asset.calibration_status] ?? CALIBRATION_STATUS_STYLE.not_calibrated;
          const statusLabel = CALIBRATION_STATUS_LABEL[asset.calibration_status] ?? asset.calibration_status;

          return (
            <div
              key={asset.asset_id}
              className="flex-shrink-0 w-52 border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-gray-400">{asset.asset_id}</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusCls}`}>
                  ● {statusLabel}
                </span>
              </div>
              <p className="text-sm font-semibold text-mar-text leading-tight mb-1">{asset.name}</p>
              <p className="text-xs text-gray-400 truncate">{asset.manufacturer} · {asset.model}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
