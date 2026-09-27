"use client";

import { Clock } from "lucide-react";

import { useEventCountdown, type EventCountdown } from "@/lib/event-clock";
import { cn } from "@/lib/utils";
import type { CampusEvent } from "@/types/event";

/** Navy/blue tones that tighten as a live event approaches its end. */
export function countdownTone(countdown: EventCountdown): { className: string; pulse: boolean } {
  if (countdown.phase === "ended") return { className: "bg-field text-faint", pulse: false };
  if (countdown.phase === "upcoming") return { className: "bg-field text-ink-soft", pulse: false };
  switch (countdown.urgency) {
    case "seconds":
      return { className: "bg-ink text-white", pulse: true };
    case "final":
      return { className: "bg-brand text-white", pulse: true };
    case "soon":
      return { className: "bg-[#DCE7FC] text-brand-dark ring-1 ring-inset ring-brand/20", pulse: false };
    default:
      return { className: "bg-brand-tint text-brand", pulse: false };
  }
}

const SIZES = {
  sm: { box: "h-[21px] gap-[5px] px-[8px] text-[11.5px] font-bold", icon: 11, dot: "h-[6px] w-[6px]" },
  md: { box: "h-[30px] gap-[6px] px-[11px] text-[13.5px] font-semibold", icon: 14, dot: "h-[7px] w-[7px]" },
} as const;

interface CountdownChipProps {
  event: Pick<CampusEvent, "startsAt" | "endsAt">;
  size?: keyof typeof SIZES;
  /** Render nothing once the event has ended (e.g. where "Ended" is already said). */
  hideEnded?: boolean;
  className?: string;
}

/**
 * The event's real remaining time. Renders nothing for listings without stored
 * start and end times, so no timer is ever invented.
 */
export function CountdownChip({ event, size = "sm", hideEnded = false, className }: CountdownChipProps) {
  const countdown = useEventCountdown(event);
  if (!countdown || (hideEnded && countdown.phase === "ended")) return null;
  const tone = countdownTone(countdown);
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full transition-colors duration-500",
        s.box,
        tone.className,
        tone.pulse && "cc-heartbeat",
        countdown.ticking && "tabular-nums",
        className,
      )}
    >
      {countdown.phase === "live" ? (
        <span aria-hidden className={cn("cc-live-dot rounded-full bg-current", s.dot)} />
      ) : (
        <Clock size={s.icon} strokeWidth={2.4} aria-hidden />
      )}
      {countdown.label}
    </span>
  );
}
