import Link from "next/link";
import { Avatar } from "@/components/avatar";

interface UserSummaryProps {
  userId: string | null;
  name: string;
  email?: string | null;
  pictureUrl?: string | null;
  size?: number;
  className?: string;
}

/**
 * Standard "user in a list" row: avatar, name (linking to the user's profile
 * page when userId is known), email below in smaller/lighter text. Used
 * anywhere a user is displayed as part of a list — members, join requests,
 * the admin users list, activity log entries. See UI.md.
 */
export function UserSummary({ userId, name, email, pictureUrl, size = 32, className = "" }: UserSummaryProps) {
  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      <Avatar name={name} pictureUrl={pictureUrl} size={size} />
      <div className="min-w-0">
        {userId ? (
          <Link href={`/users/${userId}`} className="block text-sm font-medium text-og-text truncate hover:underline">
            {name}
          </Link>
        ) : (
          <p className="text-sm font-medium text-og-text truncate">{name}</p>
        )}
        {email && <p className="text-xs text-gray-400 truncate">{email}</p>}
      </div>
    </div>
  );
}
