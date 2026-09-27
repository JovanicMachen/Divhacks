"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Radar, X } from "lucide-react";

import { formatRallyLeft, RALLY_NAVY, useRallyRemaining } from "@/lib/rally";
import type { CampusEvent } from "@/types/event";

interface RallyToastProps {
  rally: CampusEvent | null;
  onView: (event: CampusEvent) => void;
  onDismiss: () => void;
}

/** One card per new Rally, shown once per browser session. */
export function RallyToast({ rally, onView, onDismiss }: RallyToastProps) {
  return <AnimatePresence>{rally?.rally && <Card key={rally.id} rally={rally} onView={onView} onDismiss={onDismiss} />}</AnimatePresence>;
}

function Card({ rally, onView, onDismiss }: { rally: CampusEvent; onView: (event: CampusEvent) => void; onDismiss: () => void }) {
  const info = rally.rally!;
  const remaining = useRallyRemaining(info);
  const reduceMotion = useReducedMotion();
  const needed = Math.max(0, info.minParticipants - info.participantCount);
  return (
    // Centred by the wrapper; the motion layer owns its own transform.
    <div className="absolute left-1/2 top-[62px] z-30 w-[min(360px,calc(100%-24px))] -translate-x-1/2 tablet:top-[72px]">
    <motion.div
      role="status"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="flex items-start gap-3 rounded-[18px] p-3.5 text-white shadow-[0_12px_32px_rgba(15,37,71,0.32)]" style={{ backgroundColor: RALLY_NAVY }}>
        <span className="relative mt-[2px] grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10">
          <span aria-hidden className="cc-radar absolute inset-0 rounded-full border-2 border-white/60 opacity-30" />
          <Radar size={19} strokeWidth={2.4} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-white/70">New Rally nearby</p>
          <p className="mt-[2px] truncate text-[15.5px] font-extrabold">{rally.title}</p>
          <p className="mt-[1px] text-[13px] font-semibold text-white/80">
            {info.status === "active"
              ? `Rally on · ${info.participantCount} joined`
              : `Need ${needed} more student${needed === 1 ? "" : "s"}${remaining !== null ? ` · ${formatRallyLeft(remaining)}` : ""}`}
          </p>
          <button
            type="button"
            onClick={() => onView(rally)}
            className="mt-2.5 h-9 rounded-full bg-white px-4 text-[13.5px] font-bold text-ink transition-colors hover:bg-brand-tint"
          >
            View Rally
          </button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} strokeWidth={2.6} />
        </button>
      </div>
    </motion.div>
    </div>
  );
}
