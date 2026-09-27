import { Building2, UserRound } from "lucide-react";

import { initialsFor } from "@/lib/account";
import { cn } from "@/lib/utils";

interface AvatarProps {
  /** Photo URL; falls back to initials, or a neutral silhouette with no name. */
  src?: string | null;
  name?: string | null;
  size: number;
  className?: string;
  /** Organization accounts get a purple ring and a small building badge. */
  org?: boolean;
}

export function Avatar({ org, ...props }: AvatarProps) {
  if (!org) return <AvatarImage {...props} />;
  const badge = Math.max(14, Math.round(props.size * 0.3));
  return (
    <span className={cn("relative inline-grid shrink-0", props.className)} style={{ width: props.size, height: props.size }}>
      <AvatarImage {...props} className="ring-2 ring-[#7C3AED] ring-offset-2 ring-offset-white" plain />
      <span
        aria-label="Organization"
        role="img"
        className="absolute -bottom-[2px] -right-[2px] grid place-items-center rounded-full bg-[#7C3AED] text-white ring-2 ring-white"
        style={{ width: badge, height: badge }}
      >
        <Building2 size={Math.round(badge * 0.58)} strokeWidth={2.5} aria-hidden />
      </span>
    </span>
  );
}

function AvatarImage({ src, name, size, className, plain }: Omit<AvatarProps, "org"> & { plain?: boolean }) {
  const base = cn("shrink-0 rounded-full", !plain && "ring-1 ring-line-strong", className);
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
