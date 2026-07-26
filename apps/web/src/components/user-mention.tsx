import { ROLE_LABELS } from "@/lib/roles";
import { UserSummary } from "@/components/user-summary";

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
  actorProfilePictureUrl?: string | null;
  className?: string;
}

/**
 * A user shown as part of an audit-log-style list: avatar, name (linking to
 * the user's profile page when an actor ID is available), email below. See
 * UI.md's "User in a list" convention.
 */
export function UserMention({
  actorId,
  actorEmail,
  actorName,
  actorRole,
  actorProfilePictureUrl,
  className = "",
}: UserMentionProps) {
  const displayName = deriveDisplayName(actorName, actorEmail);
  return (
    <div className={className} title={actorRole ? (ROLE_LABELS[actorRole] ?? actorRole) : undefined}>
      <UserSummary userId={actorId} name={displayName} email={actorEmail} pictureUrl={actorProfilePictureUrl} size={24} />
    </div>
  );
}
