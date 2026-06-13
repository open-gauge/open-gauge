"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { CategoryDistribution } from "@/types/dashboard";
import {
  ASSET_CATEGORY_LABEL_PLURAL,
  SUBTYPE_COLOR,
  SUBTYPE_LABEL,
} from "@/lib/tokens";

const CATEGORY_ORDER = ["sensor", "instrument", "reference_standard", "data_acquisition"];

function MiniDonut({ dist }: { dist: CategoryDistribution }) {
  const isEmpty = dist.total === 0;
  const chartData = isEmpty
    ? [{ name: "empty", value: 1, color: "#f3f4f6" }]
    : dist.items.map((item) => ({
        name: SUBTYPE_LABEL[item.type] ?? item.type,
        value: item.count,
        color: SUBTYPE_COLOR[item.type] ?? "#6b7280",
      }));

  return (
    <div className="flex flex-col items-center">
      <p className="text-[11px] font-semibold text-mar-text text-center leading-tight mb-1">
        {ASSET_CATEGORY_LABEL_PLURAL[dist.category] ?? dist.category}
      </p>

      <div className="relative" style={{ width: 90, height: 90 }}>
        <PieChart width={90} height={90}>
          <Pie
            data={chartData}
            cx={45}
            cy={45}
            innerRadius={26}
            outerRadius={40}
            paddingAngle={isEmpty ? 0 : 2}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          {!isEmpty && (
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                padding: "3px 8px",
              }}
              formatter={(value, name) => [value, name]}
            />
          )}
        </PieChart>
        <span
          className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${
            isEmpty ? "text-gray-300" : "text-mar-text"
          }`}
        >
          {dist.total}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-center mt-1.5 max-w-[130px]">
        {!isEmpty &&
          dist.items.map((item, i) => (
            <span key={i} className="flex items-center gap-1 text-[9px] text-gray-500">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: SUBTYPE_COLOR[item.type] ?? "#6b7280" }}
              />
              {SUBTYPE_LABEL[item.type] ?? item.type}&nbsp;{item.count}
            </span>
          ))}
      </div>
    </div>
  );
}

export default function CategoryDistributionChart({
  data,
}: {
  data: CategoryDistribution[];
}) {
  const allCategories = CATEGORY_ORDER.map(
    (cat) => data.find((d) => d.category === cat) ?? { category: cat, total: 0, items: [] }
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-mar-text">Asset distribution</h3>
        <p className="text-xs text-gray-400 mt-0.5">By sensor, instrument and DAQ type</p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        {allCategories.map((dist) => (
          <MiniDonut key={dist.category} dist={dist} />
        ))}
      </div>
    </div>
  );
}
