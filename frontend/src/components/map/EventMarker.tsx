"use client";

import type { ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion, type MotionValue } from "framer-motion";
import { BookOpen, BriefcaseBusiness, Building2, GraduationCap, Music, Users } from "lucide-react";

import { countdownTone } from "@/components/events/CountdownChip";
import { PizzaSliceIcon, RunnerIcon } from "@/components/icons/CategoryIcons";
import { MARKER_PALETTE } from "@/lib/constants";
import { useEventCountdown, type EventCountdown } from "@/lib/event-clock";
import { formatRallyClock, ORG_PURPLE, RALLY_BLUE, RALLY_NAVY, useRallyRemaining } from "@/lib/rally";
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

/** Rallies get their own broadcast-style marker; everything else keeps the pin. */
export function EventMarker(props: EventMarkerProps) {
  return props.event.rally ? <RallyMarker {...props} /> : <StandardMarker {...props} />;
}

/** Small purple mark for organization events, on top of the category colour. */
function OrgBadge({ left, top }: { left: number; top: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-[1] grid h-[16px] w-[16px] place-items-center rounded-full text-white ring-2 ring-white"
      style={{ left, top, backgroundColor: ORG_PURPLE.solid }}
    >
      <Building2 size={9} strokeWidth={2.6} />
    </span>
  );
}

/**
 * A Rally centred on its spot: dark core, a dashed ring that turns while it's
 * forming, radar pulses, and a RALLY label with the time left. Once enough
 * people join it switches to a solid glowing ring and RALLY ON.
 */
function RallyMarker({ event, point, selected, onSelect, inverseScale, interactive = true }: EventMarkerProps) {
  const rally = event.rally!;
  const remaining = useRallyRemaining(rally);
  const reduceMotion = useReducedMotion();
  const on = rally.status === "active";
  const size = selected ? 50 : 44;
  const Icon = MARKER_ICONS[event.iconType];
  const status = on
    ? `Rally on, ${rally.participantCount} joined`
    : `Rally forming, ${rally.participantCount} of ${rally.minParticipants} joined${remaining !== null ? `, ${formatRallyClock(remaining)} left` : ""}`;

  return (
    <MapAnchor x={point.x} y={point.y} inverseScale={inverseScale} className={selected ? "z-[4]" : "z-[3]"}>
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
        transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="absolute"
        style={{ left: -size / 2, top: -size / 2, width: size, height: size }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span
            className={cn("absolute inset-0 rounded-full border-2 opacity-30", on ? "cc-radar-strong" : "cc-radar")}
            style={{ borderColor: RALLY_BLUE }}
          />
          <span
            className={cn("cc-radar-delay absolute inset-0 rounded-full border-2 opacity-0", on ? "cc-radar-strong" : "cc-radar")}
            style={{ borderColor: RALLY_BLUE }}
          />
        </span>
        <svg
          aria-hidden
          viewBox="0 0 64 64"
          className={cn("pointer-events-none absolute", !on && "cc-spin-slow")}
          style={{ left: -10, top: -10, width: size + 20, height: size + 20 }}
        >
          <circle
            cx="32"
            cy="32"
            r="30"
            fill="none"
            stroke={RALLY_BLUE}
            strokeWidth={on ? 3 : 2}
            strokeDasharray={on ? undefined : "5 6"}
            strokeLinecap="round"
            opacity={on ? 0.9 : 0.75}
          />
        </svg>
        <motion.button
          key={on ? "on" : "forming"}
          type="button"
          onClick={() => onSelect(event.id)}
          aria-label={`${event.title} at ${event.locationName}, ${status}`}
          aria-pressed={selected}
          tabIndex={interactive ? 0 : -1}
          initial={on && !reduceMotion ? { scale: 0.7 } : false}
          animate={{ scale: 1 }}
          whileHover={interactive ? { scale: 1.06 } : undefined}
          whileTap={interactive ? { scale: 0.96 } : undefined}
          transition={on ? { type: "spring", stiffness: 420, damping: 14 } : { duration: 0.16 }}
          className={cn(
            "relative grid h-full w-full place-items-center rounded-full text-white ring-[3px] ring-white",
            interactive ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{
            background: on ? `linear-gradient(140deg, ${RALLY_BLUE} 0%, ${RALLY_NAVY} 100%)` : RALLY_NAVY,
            boxShadow: on
              ? "0 0 0 5px rgb(23 102 232 / 0.22), 0 8px 18px rgb(15 37 71 / 0.35)"
              : "0 4px 12px rgb(15 37 71 / 0.3)",
          }}
        >
          <Icon size={selected ? 21 : 19} strokeWidth={2.3} />
        </motion.button>
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-[calc(100%+12px)] -translate-x-1/2">
          <span
            className="flex flex-col items-center whitespace-nowrap rounded-[9px] px-[8px] py-[4px] leading-none text-white shadow-[0_2px_6px_rgba(15,37,71,0.28)] transition-colors duration-500"
            style={{ backgroundColor: on ? RALLY_BLUE : RALLY_NAVY }}
          >
            <span className="text-[9px] font-extrabold tracking-[0.14em]">{on ? "RALLY ON" : "RALLY"}</span>
            <span className="mt-[3px] text-[11.5px] font-bold tabular-nums">
              {on ? `${rally.participantCount} joined` : remaining !== null ? formatRallyClock(remaining) : ""}
            </span>
          </span>
        </span>
      </motion.div>
    </MapAnchor>
  );
}

/**
 * A single teardrop pin anchored by its tip to the event's map position.
 * Only the selected marker carries the soft outer glow.
 */
function StandardMarker({
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
      {event.organizationEvent && <OrgBadge left={width - (photo ? 14 : 11)} top={photo ? -2 : -3} />}
      {countdown && countdown.phase !== "ended" && <MarkerCountdown countdown={countdown} />}
    </motion.div>
    </div>
    </MapAnchor>
  );
}

