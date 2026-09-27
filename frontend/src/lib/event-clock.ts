"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { CampusEvent } from "@/types/event";

/**
 * Event lifecycle derived only from an event's stored start_time / end_time.
 * The client clock is used for display, so every device reading the same rows
 * reaches Live and Ended at the same moment. Nothing here is written back.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type EventPhase = "upcoming" | "live" | "ended";
/** How close a live event is to its end: under 15 minutes, under 5, under 1. */
export type Urgency = "normal" | "soon" | "final" | "seconds";

export interface EventWindow {
  start: number;
  end: number;
}

export interface EventCountdown {
  phase: EventPhase;
  /** Milliseconds to the next boundary: start while upcoming, end while live. */
  remaining: number;
  urgency: Urgency;
  /** Under a minute to the next boundary, so the display counts seconds. */
  ticking: boolean;
  /** "Starts in 12m", "Live · 34m left", "Ending in 4m", "Ending soon · 42s", "Ended". */
  label: string;
  /** Compact form for map markers: "in 12m", "34m", "42s". */
  short: string;
}

/** The event's real time window, or null for listings without stored timestamps. */
export function eventWindow(event: Pick<CampusEvent, "startsAt" | "endsAt">): EventWindow | null {
  if (!event.startsAt || !event.endsAt) return null;
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return { start, end };
}

/** "42s", "8m", "1h 5m", "3h", "2d". Rounded up so "0m" never shows while time remains. */
export function formatRemaining(ms: number): string {
  if (ms <= MINUTE) return `${Math.max(1, Math.ceil(ms / SECOND))}s`;
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes < 60) return `${minutes}m`;
  if (ms < DAY) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${Math.floor(ms / DAY)}d`;
}

export function phaseAt(span: EventWindow, now: number): EventPhase {
  if (now < span.start) return "upcoming";
  if (now < span.end) return "live";
  return "ended";
}

export function countdownAt(span: EventWindow, now: number): EventCountdown {
  const phase = phaseAt(span, now);
  if (phase === "ended") {
    return { phase, remaining: 0, urgency: "normal", ticking: false, label: "Ended", short: "Ended" };
  }
  const remaining = (phase === "upcoming" ? span.start : span.end) - now;
  const left = formatRemaining(remaining);
  const ticking = remaining <= MINUTE;
  if (phase === "upcoming") {
    return { phase, remaining, urgency: "normal", ticking, label: `Starts in ${left}`, short: `in ${left}` };
  }
  if (ticking) return { phase, remaining, urgency: "seconds", ticking, label: `Ending soon · ${left}`, short: left };
  if (remaining <= 5 * MINUTE) return { phase, remaining, urgency: "final", ticking, label: `Ending in ${left}`, short: left };
  if (remaining <= 15 * MINUTE) return { phase, remaining, urgency: "soon", ticking, label: `Ending in ${left}`, short: left };
  return { phase, remaining, urgency: "normal", ticking, label: `Live · ${left} left`, short: left };
}

export function hasEnded(event: CampusEvent, now: number): boolean {
  const span = eventWindow(event);
  return span !== null && now >= span.end;
}

/** The countdown label for timed events, the listing's own status otherwise. */
export function liveTimeStatus(event: CampusEvent, now: number = Date.now()): string {
  const span = eventWindow(event);
  return span ? countdownAt(span, now).label : event.timeStatus;
}

// One shared timer for the whole app. It wakes exactly when some registered
// event's label changes: each minute step, each second in the final minute,
// and at start and end, so transitions land on time without polling.

let now = typeof window === "undefined" ? 0 : Date.now();
const listeners = new Set<() => void>();
const boundaries = new Map<number, number>();
let timer: ReturnType<typeof setTimeout> | undefined;

function nextDelay(at: number): number {
  let delay = MINUTE - (at % MINUTE);
  for (const boundary of boundaries.keys()) {
    const left = boundary - at;
    if (left <= 0) continue;
    const step = left <= MINUTE ? left % SECOND || SECOND : left % MINUTE || MINUTE;
    if (step < delay) delay = step;
  }
  // Land just past the boundary rather than a hair before it.
  return delay + 20;
}

function tick() {
  now = Date.now();
  listeners.forEach((listener) => listener());
  schedule();
}

function schedule() {
  if (timer !== undefined) clearTimeout(timer);
  timer = listeners.size ? setTimeout(tick, nextDelay(Date.now())) : undefined;
}

/** Background tabs throttle timers; catch up as soon as the tab is visible again. */
function onVisible() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = Date.now();
    document.addEventListener("visibilitychange", onVisible);
  }
  listeners.add(listener);
  schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) document.removeEventListener("visibilitychange", onVisible);
    schedule();
  };
}

function currentNow(): number {
  if (listeners.size === 0) now = Date.now();
  return now;
}

function useBoundaries(windows: EventWindow[]) {
  const key = windows.map((w) => `${w.start}-${w.end}`).join(",");
  useEffect(() => {
    if (!key) return;
    const points = key.split(",").flatMap((pair) => pair.split("-").map(Number));
    points.forEach((point) => boundaries.set(point, (boundaries.get(point) ?? 0) + 1));
    schedule();
    return () => {
      points.forEach((point) => {
        const count = (boundaries.get(point) ?? 1) - 1;
        if (count <= 0) boundaries.delete(point);
        else boundaries.set(point, count);
      });
      schedule();
    };
  }, [key]);
}

const serverSnapshot = () => "";

/** Live countdown for one event; null when it has no stored times. Re-renders only when the text changes. */
export function useEventCountdown(event: Pick<CampusEvent, "startsAt" | "endsAt">): EventCountdown | null {
  const { startsAt, endsAt } = event;
  const span = useMemo(() => eventWindow({ startsAt, endsAt }), [startsAt, endsAt]);
  useBoundaries(useMemo(() => (span ? [span] : []), [span]));
  const key = useSyncExternalStore(
    subscribe,
    () => {
      if (!span) return "";
      const c = countdownAt(span, currentNow());
      return `${c.phase}|${c.label}`;
    },
    serverSnapshot,
  );
  return useMemo(() => (span && key ? countdownAt(span, currentNow()) : null), [span, key]);
}

/**
 * The latest start or end time among `events` that has already passed (0 when
 * none has). Every event has the same phase at this instant as it does right
 * now, and the value only moves when one of them starts or ends, so lists can
 * filter and count against it without re-rendering every minute.
 */
export function useLifecycleNow(events: CampusEvent[]): number {
  const windows = useMemo(
    () => events.map(eventWindow).filter((w): w is EventWindow => w !== null),
    [events],
  );
  useBoundaries(windows);
  return useSyncExternalStore(
    subscribe,
    () => {
      const at = currentNow();
      let latest = 0;
      for (const { start, end } of windows) {
        if (start <= at && start > latest) latest = start;
        if (end <= at && end > latest) latest = end;
      }
      return latest;
    },
    () => 0,
  );
}
