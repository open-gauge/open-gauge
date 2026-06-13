import type { ActivityItem } from "@/types/dashboard";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function ActivityFeed({ data }: { data: ActivityItem[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[#152330]">Activity</h3>
        <p className="text-xs text-gray-400 mt-0.5">Recent audit events</p>
      </div>

      <ul className="space-y-4">
        {data.map((item, i) => (
          <li key={i} className="flex gap-3 text-xs">
            <span className="mt-1.5 w-1.5 h-1.5 flex-shrink-0 rounded-full bg-[#2f819b]" />
            <div className="leading-relaxed">
              <span className="font-semibold text-[#152330]">{item.actor_email}</span>{" "}
              <span className="text-gray-500">{item.action}</span>
              {item.entity_asset_id && (
                <span className="ml-1 font-mono text-[10px] text-gray-400 bg-gray-50 px-1 rounded">
                  {item.entity_asset_id}
                </span>
              )}
              <p className="text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
