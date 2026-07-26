import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { RecentAsset } from "@/types/dashboard";
import { ActivityIcon } from "@/components/icons";
import { translateDynamic } from "@/lib/translate-dynamic";

const ASSET_TYPE_STYLE: Record<string, string> = {
  sensor: "bg-teal-50 text-teal-700 border-teal-100",
  daq:    "bg-amber-50 text-amber-700 border-amber-100",
};

export default function RecentAssets({ data }: { data: RecentAsset[] }) {
  const t = useTranslations("dashboard.recentAssets");
  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-og-text">{t("title")}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t("subtitle")}</p>
        </div>
        <ActivityIcon size={14} className="text-gray-300 mt-0.5" />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((asset) => {
          const typeCls   = ASSET_TYPE_STYLE[asset.asset_type] ?? "bg-gray-50 text-gray-500 border-gray-100";
          const typeLabel = translateDynamic(t, asset.asset_type);

          return (
            <Link
              key={asset.id}
              href={`/assets/${asset.id}`}
              className="shrink-0 w-52 border border-og-border rounded-xl p-4 hover:border-og-border-md hover:shadow-xs transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-gray-400">{asset.asset_id}</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${typeCls}`}>
                  {typeLabel}
                </span>
              </div>
              <p className="text-sm font-semibold text-og-text leading-tight mb-1">{asset.name}</p>
              <p className="text-xs text-gray-400 truncate">
                {asset.manufacturer} · {asset.model}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
