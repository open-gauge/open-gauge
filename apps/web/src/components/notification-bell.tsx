"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, CheckIcon, TrashIcon, XIcon } from "@/components/icons";
import {
  deleteAllNotifications,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markNotificationRead,
} from "@/services/notification.service";
import type { Notification } from "@/types/notification";

const POLL_INTERVAL_MS = 60_000;

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      getUnreadCount().then((count) => { if (!cancelled) setUnreadCount(count); }).catch(() => {});
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleToggle() {
    setOpen((v) => !v);
    if (!loaded) {
      listNotifications().then(setNotifications).catch(() => {}).finally(() => setLoaded(true));
    }
  }

  async function handleSelect(n: Notification) {
    setOpen(false);
    if (!n.is_read) {
      markNotificationRead(n.id).catch(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.link) router.push(n.link);
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }

  async function handleDelete(e: React.MouseEvent, n: Notification) {
    e.stopPropagation();
    try {
      await deleteNotification(n.id);
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      if (!n.is_read) setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  }

  async function handleClearAll() {
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // silent
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-og-surface-alt transition-colors"
        aria-label="Notifications"
      >
        <BellIcon size={16} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-og-surface rounded-xl border border-og-border shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-og-border">
            <p className="text-xs font-semibold text-og-text">Notifications</p>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button type="button" onClick={handleMarkAllRead} className="flex items-center gap-1 text-[10px] text-og-accent hover:underline">
                  <CheckIcon size={10} /> Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button type="button" onClick={handleClearAll} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 hover:underline">
                  <TrashIcon size={10} /> Clear all
                </button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-og-border">
            {notifications.length === 0 && (
              <p className="px-4 py-8 text-xs text-gray-400 text-center">No notifications yet.</p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(n)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSelect(n); }}
                className={`group w-full text-left px-4 py-3 hover:bg-og-surface-alt transition-colors cursor-pointer ${!n.is_read ? "bg-og-accent/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-og-accent shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-og-text">{n.title}</p>
                    {n.body && <p className="text-[11px] text-gray-400 mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">{fmtRelative(n.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, n)}
                    aria-label="Remove notification"
                    className="shrink-0 p-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-og-surface transition-colors"
                  >
                    <XIcon size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
