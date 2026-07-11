import { UsersIcon } from "@/components/icons";

interface AvatarProps {
  name: string;
  pictureUrl?: string | null;
  size?: number;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Circular avatar — shows the user's picture, falling back to initials or a generic icon. */
export function Avatar({ name, pictureUrl, size = 32, className = "" }: AvatarProps) {
  const initials = getInitials(name);
  return (
    <div
      className={`rounded-full bg-og-accent flex items-center justify-center text-white font-semibold shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {pictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pictureUrl} alt={name} className="w-full h-full object-cover" />
      ) : initials ? (
        initials
      ) : (
        <UsersIcon size={Math.round(size * 0.5)} className="text-white" />
      )}
    </div>
  );
}
