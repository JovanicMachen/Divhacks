import { UserRound } from "lucide-react";

import { initialsFor } from "@/lib/account";
import { cn } from "@/lib/utils";

interface AvatarProps {
  /** Photo URL; falls back to initials, or a neutral silhouette with no name. */
  src?: string | null;
  name?: string | null;
  size: number;
  className?: string;
}

export function Avatar({ src, name, size, className }: AvatarProps) {
  const base = cn("shrink-0 rounded-full ring-1 ring-line-strong", className);
  const style = { width: size, height: size };

  if (src) {
    return (
      // Avatars come from Supabase Storage or a local data URL, so next/image's
      // domain allow-list doesn't apply.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name ?? ""} width={size} height={size} style={style} className={cn(base, "object-cover")} />
    );
  }

  if (name) {
    return (
      <span
        role="img"
        aria-label={name}
        style={{ ...style, fontSize: Math.round(size * 0.38) }}
        className={cn(base, "grid place-items-center bg-brand-soft font-bold tracking-[-0.01em] text-brand")}
      >
        {initialsFor(name)}
      </span>
    );
  }

  return (
    <span aria-hidden style={style} className={cn(base, "grid place-items-center bg-field text-faint")}>
      <UserRound size={Math.round(size * 0.52)} strokeWidth={2} />
    </span>
  );
}
