"use client";

import type { ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion, type MotionValue } from "framer-motion";
import { BookOpen, BriefcaseBusiness, GraduationCap, Music, Users } from "lucide-react";

import { countdownTone } from "@/components/events/CountdownChip";
import { PizzaSliceIcon, RunnerIcon } from "@/components/icons/CategoryIcons";
import { MARKER_PALETTE } from "@/lib/constants";
import { useEventCountdown, type EventCountdown } from "@/lib/event-clock";
import { cn } from "@/lib/utils";
import type { MapPoint } from "@/lib/geo";
import type { CampusEvent, MarkerIcon } from "@/types/event";

type IconComponent = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

/** The pizza pin uses the illustrated cream-on-red slice, not a stroke glyph. */
function PizzaPinIcon({ size }: { size?: number }) {
  return <PizzaSliceIcon size={size} variant="onColor" />;
}

const MARKER_ICONS: Record<MarkerIcon, IconComponent> = {
  pizza: PizzaPinIcon,
  music: Music,
  book: BookOpen,
  briefcase: BriefcaseBusiness,
  graduation: GraduationCap,
  run: RunnerIcon,
  users: Users,
};

interface EventMarkerProps {
  event: CampusEvent;
  /** The event's pin position; events without one get no marker. */
  point: MapPoint;
  selected: boolean;
  onSelect: (eventId: string) => void;
  /** 1 / map zoom, so the pin keeps its size while the map scales under it. */
  inverseScale: MotionValue<number>;
  /** False while the map is in "choose a location" mode. */
  interactive?: boolean;
}

/**
 * Zero-size anchor at a map position. Children are drawn relative to the
 * anchor point and counter-scaled against the map zoom.
 */
export function MapAnchor({
  x,
  y,
  inverseScale,
  opacity,
  children,
  className,
}: {
  x: number;
  y: number;
  inverseScale: MotionValue<number>;
  /** Lets zoom-dependent labels fade in and out. */
  opacity?: MotionValue<number>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={cn("pointer-events-none absolute h-0 w-0", className)}
      style={{ left: `${x}%`, top: `${y}%`, scale: inverseScale, opacity, transformOrigin: "0 0" }}
    >
      {children}
    </motion.div>
  );
}

/** The teardrop pin shape with its category glyph. */
export function MarkerPin({
  markerColor,
  iconType,
  selected = false,
}: Pick<CampusEvent, "markerColor" | "iconType"> & { selected?: boolean }) {
  const palette = MARKER_PALETTE[markerColor];
  const Icon = MARKER_ICONS[iconType];
  const width = selected ? 39 : 34;
  const height = selected ? 50 : 44;
  return (
    <>
      <svg viewBox="0 0 34 44" width={width} height={height} aria-hidden className="block">
        <path
          d="M17 43.2c0 0 15.6-17.4 15.6-26.2a15.6 15.6 0 1 0-31.2 0C1.4 25.8 17 43.2 17 43.2Z"
          fill={palette.solid}
          stroke="#FFFFFF"
          strokeWidth={2.2}
        />
      </svg>
      <span
        aria-hidden
        className="absolute left-0 right-0 top-0 grid place-items-center text-white"
        style={{ height: width }}
      >
        <Icon size={selected ? 19 : 17} strokeWidth={2.3} />
      </span>
    </>
  );
}

/** Circular cover photo with a category ring, a pointer to the spot, and a small category badge. */
export function PhotoBubble({
  imageUrl,
  markerColor,
  iconType,
  selected = false,
}: Pick<CampusEvent, "markerColor" | "iconType"> & { imageUrl: string; selected?: boolean }) {
  const palette = MARKER_PALETTE[markerColor];
  const Icon = MARKER_ICONS[iconType];
  const size = selected ? 56 : 46;
  return (
    <>
      <span
        className="absolute left-0 top-0 block overflow-hidden rounded-full border-[2.5px] border-white bg-field"
        style={{ width: size, height: size, boxShadow: `0 0 0 2.5px ${palette.solid}, 0 4px 10px rgb(16 37 71 / 0.18)` }}
      >
        {/* Event photos come from Supabase Storage or a local data URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" draggable={false} className="h-full w-full object-cover" />
      </span>
      <svg
        viewBox="0 0 14 9"
        width={14}
        height={9}
        aria-hidden
        className="absolute"
        style={{ left: size / 2 - 7, top: size + 1 }}
      >
        <path d="M0 0h14L7 9Z" fill={palette.solid} />
      </svg>
      <span
        aria-hidden
        className="absolute grid place-items-center rounded-full text-white ring-2 ring-white"
        style={{ width: 18, height: 18, left: size - 14, top: size - 16, backgroundColor: palette.solid }}
      >
        <Icon size={10} strokeWidth={2.6} />
      </span>
    </>
  );
}

/** Compact remaining-time tag under a marker: "in 12m", "8m", "42s". */
function MarkerCountdown({ countdown }: { countdown: EventCountdown }) {
  const tone = countdownTone(countdown);
  // Calm states sit on white so the tag reads against the map ground.
  const surface =
    countdown.phase === "upcoming"
      ? "bg-white text-ink-soft ring-1 ring-inset ring-line-strong"
      : countdown.urgency === "normal"
        ? "bg-white text-brand ring-1 ring-inset ring-brand/25"
        : tone.className;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[calc(100%+3px)] -translate-x-1/2"
    >
      <span
        className={cn(
          "flex h-[18px] items-center gap-[4px] whitespace-nowrap rounded-full px-[7px] text-[11px] font-bold leading-none shadow-[0_1px_3px_rgba(15,37,71,0.2)] transition-colors duration-500",
          surface,
          tone.pulse && "cc-heartbeat",
          countdown.ticking && "tabular-nums",
        )}
      >
        {countdown.phase === "live" && <span className="cc-live-dot h-[5px] w-[5px] rounded-full bg-current" />}
        {countdown.short}
      </span>
    </span>
  );
}

/**
 * A single teardrop pin anchored by its tip to the event's map position.
 * Only the selected marker carries the soft outer glow.
 */
export function EventMarker({
  event,
  point,
  selected,
  onSelect,
  inverseScale,
  interactive = true,
}: EventMarkerProps) {
  const palette = MARKER_PALETTE[event.markerColor];
  const photo = event.imageUrl ?? null;
  // A photo bubble is a circle plus a 10px pointer; its tip sits on the spot like the pin's.
  const width = photo ? (selected ? 56 : 46) : selected ? 39 : 34;
  const height = photo ? width + 10 : selected ? 50 : 44;
  const countdown = useEventCountdown(event);
  const live = countdown?.phase === "live";
  const reduceMotion = useReducedMotion();
  const label = countdown && countdown.phase !== "ended" ? `, ${countdown.label}` : "";

  return (
    <MapAnchor x={point.x} y={point.y} inverseScale={inverseScale} className={selected ? "z-[2]" : "z-[1]"}>
    <div
      className="absolute"
      style={{ transform: "translate(-50%, -100%)" }}
    >
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.55, y: 6 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="relative origin-bottom"
    >
      {live && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ top: width / 2 }}
        >
          <span
            className={cn(
              "block rounded-full",
              countdown.urgency === "final" || countdown.urgency === "seconds" ? "cc-breathe-strong" : "cc-breathe",
            )}
            style={{ width: width + 30, height: width + 30, backgroundColor: palette.solid }}
          />
        </span>
      )}
      <AnimatePresence initial={false}>
        {live && !reduceMotion && (
          <motion.span
            key="went-live"
            aria-hidden
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: 2.1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="pointer-events-none absolute left-1/2 block rounded-full border-2"
            style={{
              top: 0,
              marginLeft: -width / 2,
              width,
              height: width,
              borderColor: palette.solid,
            }}
          />
        )}
      </AnimatePresence>
      {selected && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2">
          <span
            className="block h-[84px] w-[84px] rounded-full"
            style={{ backgroundColor: palette.solid, opacity: 0.14 }}
          />
          <span
            className="absolute left-1/2 top-1/2 block h-[54px] w-[54px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: palette.solid, opacity: 0.18 }}
          />
        </span>
      )}

      <motion.button
        type="button"
        onClick={() => onSelect(event.id)}
        aria-label={`${event.title} at ${event.locationName}${label}`}
        aria-pressed={selected}
        tabIndex={interactive ? 0 : -1}
        initial={false}
        whileHover={interactive ? { scale: 1.08, y: -3 } : undefined}
        whileTap={interactive ? { scale: 0.97 } : undefined}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className={cn(
          "relative block origin-bottom drop-shadow-[0_3px_5px_rgba(15,37,71,0.22)]",
          interactive ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{ width, height }}
      >
        {photo ? (
          <PhotoBubble imageUrl={photo} markerColor={event.markerColor} iconType={event.iconType} selected={selected} />
        ) : (
          <MarkerPin markerColor={event.markerColor} iconType={event.iconType} selected={selected} />
        )}
      </motion.button>
      {countdown && countdown.phase !== "ended" && <MarkerCountdown countdown={countdown} />}
    </motion.div>
    </div>
    </MapAnchor>
  );
}

