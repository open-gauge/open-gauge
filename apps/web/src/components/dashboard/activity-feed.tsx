"use client";

import type { ActivityItem } from "@/types/dashboard";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function humanAction(action: string): string {
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Derive a readable display name from the actor_name or the email local part. */
function displayName(item: ActivityItem): string {
  if (item.actor_name) return item.actor_name;
  const local = item.actor_email.split("@")[0];
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export default function ActivityFeed({ data }: { data: ActivityItem[] }) {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-5 h-full flex flex-col">
      <div className="mb-3 flex-shrink-0">
        <h3 className="text-sm font-semibold text-mar-text">Activity</h3>
        <p className="text-xs text-gray-400 mt-0.5">Recent audit events</p>
      </div>

      {/* Scrollable list */}
      <ul className="space-y-3 overflow-y-auto flex-1 pr-0.5">
        {data.map((item, i) => {
          const name = displayName(item);
          return (
            <li key={i} className="flex gap-3 text-xs">
              <span className="mt-1.5 w-1.5 h-1.5 flex-shrink-0 rounded-full bg-mar-accent" />
              <div className="leading-relaxed min-w-0">
                {/* Username + tooltip */}
                <span className="relative group/actor inline-block">
                  <span className="font-semibold text-mar-text cursor-default">{name}</span>
                  {/* Tooltip */}
                  <span
                    className="
                      pointer-events-none absolute bottom-full left-0 mb-1.5 z-50
                      hidden group-hover/actor:flex flex-col
                      bg-gray-900 dark:bg-gray-700 text-white rounded-lg px-3 py-2
                      shadow-lg whitespace-nowrap text-[11px] gap-0.5
                    "
                  >
                    <span className="font-semibold">{item.actor_name ?? name}</span>
                    <span className="text-gray-400">{item.actor_email}</span>
                  </span>
                </span>{" "}
                <span className="text-gray-500">{humanAction(item.action)}</span>
                {item.entity_asset_id && (
                  <span className="ml-1 font-mono text-[10px] text-gray-400 bg-mar-surface-alt px-1 rounded">
                    {item.entity_asset_id}
                  </span>
                )}
                <p className="text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
