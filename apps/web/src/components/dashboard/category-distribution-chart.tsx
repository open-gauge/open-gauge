"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { AssetTypeDistribution } from "@/types/dashboard";
import { SUBTYPE_COLOR, SUBTYPE_LABEL } from "@/lib/tokens";

interface PieData {
  name: string;
  value: number;
  color: string;
}

function buildPieData(items: { type: string; count: number }[]): PieData[] {
  return items.map((item) => ({
    name:  SUBTYPE_LABEL[item.type] ?? item.type,
    value: item.count,
    color: SUBTYPE_COLOR[item.type] ?? "#6b7280",
  }));
}

const EMPTY_DATA: PieData[] = [{ name: "empty", value: 1, color: "#e5e7eb" }];

interface SinglePieProps {
  data: PieData[];
  label: string;
  total: number;
}

function SinglePie({ data, label, total }: SinglePieProps) {
  const isEmpty = total === 0;
  const displayData = isEmpty ? EMPTY_DATA : data;

  return (
    <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
      <div className="relative" style={{ width: 130, height: 130 }}>
        <PieChart width={130} height={130}>
          <Pie
            data={displayData}
            cx={65}
            cy={65}
            innerRadius={38}
            outerRadius={58}
            paddingAngle={isEmpty ? 0 : 3}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            {displayData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          {!isEmpty && (
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                padding: "4px 8px",
                background: "#111827",
                color: "#f3f4f6",
              }}
              formatter={(value: any, name: any) => [value, name]}
            />
          )}
        </PieChart>
        <span className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className={`text-xl font-bold leading-none ${isEmpty ? "text-gray-300" : "text-mar-text"}`}>
            {total}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
        </span>
      </div>

      <div className="w-full space-y-1.5 px-1">
        {isEmpty ? (
          <p className="text-center text-[10px] text-gray-400">No {label.toLowerCase()}s</p>
        ) : (
          data.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-gray-500 flex-1 truncate">{item.name}</span>
              <span className="text-[10px] font-semibold text-mar-text tabular-nums">{item.value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function CategoryDistributionChart({ data }: { data: AssetTypeDistribution }) {
  const sensorData = buildPieData(data.sensors);
  const daqData = buildPieData(data.daqs);
  const sensorTotal = data.sensors.reduce((s, d) => s + d.count, 0);
  const daqTotal = data.daqs.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5 h-full">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-mar-text">Asset distribution</h3>
        <p className="text-xs text-gray-400 mt-0.5">Sensors by type · DAQs by interface</p>
      </div>

      <div className="flex gap-4 items-start">
        <SinglePie data={sensorData} label="Sensor" total={sensorTotal} />
        <div className="w-px self-stretch bg-mar-border" />
        <SinglePie data={daqData} label="DAQ" total={daqTotal} />
      </div>
    </div>
  );
}
