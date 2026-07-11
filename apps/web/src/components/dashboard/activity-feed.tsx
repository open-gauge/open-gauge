"use client";

import Link from "next/link";

import type { ActivityItem } from "@/types/dashboard";
import { ExternalLinkIcon } from "@/components/icons";
import { UserMention } from "@/components/user-mention";

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

export default function ActivityFeed({ data }: { data: ActivityItem[] }) {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-mar-text">Activity</h3>
          <p className="text-xs text-gray-400 mt-0.5">Recent audit events</p>
        </div>
        <Link
          href="/activity"
          className="text-xs text-gray-400 hover:text-mar-accent flex items-center gap-1 transition-colors shrink-0"
        >
          View all
          <ExternalLinkIcon />
        </Link>
      </div>

      {/* Scrollable list */}
      <ul className="space-y-3 overflow-y-auto flex-1 pr-0.5">
        {data.map((item, i) => (
          <li key={i} className="flex gap-3 text-xs">
            <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-mar-accent" />
            <div className="leading-relaxed min-w-0">
              <UserMention
                actorId={item.actor_id}
                actorEmail={item.actor_email}
                actorName={item.actor_name}
                actorRole={item.actor_role}
              />{" "}
              <span className="text-gray-500">{humanAction(item.action)}</span>
              {item.entity_asset_id && (
                <span className="ml-1 font-mono text-[10px] text-gray-400 bg-mar-surface-alt px-1 rounded-sm">
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
