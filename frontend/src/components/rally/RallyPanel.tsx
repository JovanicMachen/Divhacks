"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Radar, TimerOff, Zap } from "lucide-react";

import { formatRallyClock, RALLY_BLUE, RALLY_NAVY, useRallyRemaining } from "@/lib/rally";
import { cn } from "@/lib/utils";
import type { CampusEvent } from "@/types/event";

interface RallyPanelProps {
  event: CampusEvent;
  joined: boolean;
  /** Resolves with an error message, or null once joined. */
  onJoin: () => Promise<string | null>;
}

/** Everything about a Rally's state in the drawer, from the database's counts. */
export function RallyPanel({ event, joined, onJoin }: RallyPanelProps) {
  const rally = event.rally!;
  const remaining = useRallyRemaining(rally);
  const reduceMotion = useReducedMotion();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const cancelled = event.status === "abandoned";
  const expired = rally.status === "expired" || (rally.status === "forming" && remaining === 0);
  const phase = cancelled ? "cancelled" : expired ? "expired" : rally.status === "active" ? "on" : "forming";
  const needed = Math.max(0, rally.minParticipants - rally.participantCount);
  const progress = Math.min(1, rally.participantCount / rally.minParticipants);

  const join = async () => {
    if (lock.current) return;
    lock.current = true;
    setJoining(true);
    setError(null);
    const failure = await onJoin();
    lock.current = false;
    setJoining(false);
    if (failure) setError(failure);
  };

  const canJoin = !joined && (phase === "forming" || phase === "on");

  return (
    <div className="mt-[18px]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: phase === "on" ? 0.94 : 1, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={phase === "on" && !reduceMotion ? { type: "spring", stiffness: 380, damping: 20 } : { duration: 0.2 }}
          className={cn(
            "overflow-hidden rounded-[16px] p-4",
            phase === "forming" && "text-white",
            phase === "on" && "text-white",
            (phase === "expired" || phase === "cancelled") && "bg-field text-ink-soft",
          )}
          style={
            phase === "forming"
              ? { backgroundColor: RALLY_NAVY }
              : phase === "on"
                ? { background: `linear-gradient(140deg, ${RALLY_BLUE} 0%, ${RALLY_NAVY} 100%)` }
                : undefined
          }
        >
          {phase === "forming" && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.12em] text-white/80">
                  <Radar size={15} strokeWidth={2.4} aria-hidden className="cc-live-dot" />
                  Rally forming
                </span>
                <span className="text-[13px] font-bold tabular-nums text-white/90" aria-label="Time left">
                  {formatRallyClock(remaining ?? 0)} left
                </span>
              </div>
              <p className="mt-2 text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
                {rally.participantCount} / {rally.minParticipants}
                <span className="ml-2 text-[15px] font-bold tracking-normal text-white/80">joined</span>
              </p>
              <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-white/15" aria-hidden>
                <motion.div
                  className="h-full rounded-full bg-white"
                  initial={false}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              <p className="mt-2 text-[13px] font-semibold text-white/80">
                {needed === 1 ? "1 more student and it's on." : `${needed} more students and it's on.`}
              </p>
            </>
          )}

          {phase === "on" && (
            <>
              <span className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/85">
                <Zap size={15} strokeWidth={2.4} aria-hidden className="fill-white" />
                Rally on
              </span>
              <p className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
                {rally.participantCount} students joined
              </p>
              <p className="mt-1 text-[14px] font-semibold text-white/85">
                {event.title} @ {event.locationName}
              </p>
              <p className="mt-1 text-[13px] font-bold text-white">Starts now</p>
            </>
          )}

          {(phase === "expired" || phase === "cancelled") && (
            <div className="flex items-start gap-3">
              <TimerOff size={20} strokeWidth={2.2} aria-hidden className="mt-[2px] shrink-0 text-muted" />
              <div>
                <p className="text-[16px] font-extrabold text-ink">{phase === "cancelled" ? "Rally cancelled" : "Rally expired"}</p>
                <p className="mt-[2px] text-[13.5px] font-medium text-muted">
                  {phase === "cancelled" ? "The organizer called it off." : "Not enough students joined in time."}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {canJoin ? (
        <motion.button
          type="button"
          onClick={() => void join()}
          disabled={joining}
          aria-busy={joining || undefined}
          whileTap={{ scale: 0.98 }}
          className="mt-3 flex h-[44px] w-full items-center justify-center gap-2 rounded-[13px] bg-brand text-[16px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.26)] transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-80"
        >
          {joining ? <Loader2 size={17} strokeWidth={2.6} aria-hidden className="animate-spin" /> : <Radar size={17} strokeWidth={2.4} aria-hidden />}
          {joining ? "Joining…" : "Join Rally"}
        </motion.button>
      ) : joined && (phase === "forming" || phase === "on") ? (
        <p className="mt-3 flex h-[44px] items-center justify-center gap-2 rounded-[13px] bg-brand-tint text-[15px] font-bold text-brand">
          <Check size={17} strokeWidth={2.8} aria-hidden />
          {phase === "on" ? "You're in" : `You're in · waiting for ${needed} more`}
        </p>
      ) : null}
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-coral-text">
          {error}
        </p>
      )}
    </div>
  );
}
