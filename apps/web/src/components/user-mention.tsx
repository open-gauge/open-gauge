"use client";

import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin:      "Admin",
  technician: "Technician",
  viewer:     "Viewer",
};

function deriveDisplayName(name: string | null, email: string): string {
  if (name) return name;
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

interface UserMentionProps {
  actorId:    string | null;
  actorEmail: string;
  actorName:  string | null;
  actorRole?: string | null;
  className?: string;
}

/**
 * Renders a user's display name with a hover tooltip (name, email, role)
 * and a click link to the user profile page when an actor ID is available.
 */
export function UserMention({
  actorId,
  actorEmail,
  actorName,
  actorRole,
  className = "",
}: UserMentionProps) {
  const displayName = deriveDisplayName(actorName, actorEmail);

  const tooltip = (
    <span
      className="
        pointer-events-none absolute bottom-full left-0 mb-1.5 z-50
        hidden group-hover/mention:flex flex-col
        bg-gray-900 dark:bg-gray-800 text-white rounded-lg px-3 py-2
        shadow-lg whitespace-nowrap text-[11px] gap-0.5
      "
    >
      <span className="font-semibold">{actorName ?? displayName}</span>
      <span className="text-gray-400">{actorEmail}</span>
      {actorRole && (
        <span className="text-gray-400">{ROLE_LABELS[actorRole] ?? actorRole}</span>
      )}
    </span>
  );

  const sharedCls = `relative group/mention inline-block font-semibold ${className}`;

  if (actorId) {
    return (
      <Link
        href={`/users/${actorId}`}
        className={`${sharedCls} text-og-text hover:text-og-accent transition-colors`}
      >
        {displayName}
        {tooltip}
      </Link>
    );
  }

  return (
    <span className={`${sharedCls} text-og-text cursor-default`}>
      {displayName}
      {tooltip}
    </span>
  );
}
