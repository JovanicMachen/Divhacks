"use client";

import { Ban, Clock, Radar } from "lucide-react";

import { useEventCountdown, type EventCountdown } from "@/lib/event-clock";
import { formatRallyClock, useRallyRemaining } from "@/lib/rally";
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
  event: Pick<CampusEvent, "startsAt" | "endsAt" | "status"> & Partial<Pick<CampusEvent, "rally">>;
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
  const rally = event.rally ?? null;
  const rallyLeft = useRallyRemaining(rally);
  const s = SIZES[size];
  if (rally && event.status !== "abandoned") {
    const expired = rally.status === "expired" || (rally.status === "forming" && rallyLeft === 0);
    if (expired && hideEnded) return null;
    const label = expired
      ? "Rally expired"
      : rally.status === "active"
        ? `Rally on · ${rally.participantCount} joined`
        : `Rally · ${rally.participantCount}/${rally.minParticipants} · ${formatRallyClock(rallyLeft ?? 0)}`;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center whitespace-nowrap rounded-full tabular-nums",
          s.box,
          expired ? "bg-field text-faint" : rally.status === "active" ? "bg-brand text-white" : "bg-ink text-white",
          className,
        )}
      >
        <Radar size={s.icon} strokeWidth={2.4} aria-hidden />
        {label}
      </span>
    );
  }
  if (event.status === "abandoned") {
    if (hideEnded) return null;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-field text-muted",
          s.box,
          className,
        )}
      >
        <Ban size={s.icon} strokeWidth={2.4} aria-hidden />
        Cancelled
      </span>
    );
  }
  if (!countdown || (hideEnded && countdown.phase === "ended")) return null;
  const tone = countdownTone(countdown);
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
