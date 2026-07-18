"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getUserById } from "@/services/admin.service";
import type { UserProfile } from "@/types/user";
import {
  ActivityIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  WarningIcon,
} from "@/components/icons";
import { Avatar } from "@/components/avatar";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin:      "Admin",
  technician: "Technician",
  viewer:     "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  admin:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  technician: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  viewer:     "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-og-border last:border-0">
      <span className="w-32 shrink-0 text-xs text-gray-400 pt-0.5">{label}</span>
      <span className="flex-1 text-sm text-og-text">{value}</span>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function UserDetailClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUserById(id)
      .then(setUser)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="p-6 space-y-5">
      {/* Back navigation */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-og-text transition-colors"
      >
        <ChevronLeftIcon size={13} />
        Back
      </button>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
          Loading…
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && user && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3">
            <Avatar name={user.name} pictureUrl={user.profile_picture_url} size={40} />
            <div>
              <h1 className="text-xl font-bold text-og-text">{user.name}</h1>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
            <div className="ml-2 flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ${ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer}`}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              {user.is_active ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <CheckCircleIcon size={11} /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  <WarningIcon size={11} /> Disabled
                </span>
              )}
            </div>
          </div>

          {/* Details card */}
          <div className="bg-og-surface rounded-xl border border-og-border shadow-xs px-5 py-2">
            <InfoRow label="Email" value={user.email} />
            <InfoRow label="Role" value={
              <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ${ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer}`}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            } />
            {user.teams.length > 0 && (
              <InfoRow label="Teams" value={user.teams.map((t) => t.name).join(", ")} />
            )}
            <InfoRow label="Status" value={
              user.is_active
                ? <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                : <span className="text-red-500">Disabled</span>
            } />
            <InfoRow label="Member since" value={fmtDate(user.created_at)} />
          </div>

          {/* Activity link */}
          <div className="bg-og-surface rounded-xl border border-og-border shadow-xs px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ActivityIcon size={15} className="text-gray-400" />
              <span className="text-sm font-medium text-og-text">Activity log</span>
            </div>
            <Link
              href={`/activity?actor_id=${user.id}`}
              className="text-xs text-og-accent hover:underline"
            >
              View activity →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
