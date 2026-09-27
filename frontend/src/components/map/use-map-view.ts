"use client";

import {
  animate,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { WORLD, worldToMap, type MapPoint } from "@/lib/geo";

/** Layer pixels per world unit at scale 1. */
export const PX_PER_UNIT = 2.4;
/** The map layer's size at scale 1; it keeps the world's exact aspect ratio. */
export const LAYER_SIZE = { width: WORLD.width * PX_PER_UNIT, height: WORLD.height * PX_PER_UNIT } as const;

const MAX_SCALE = 4.4;
/** The opening view spans about this many world units across its longer side. */
const HOME_SPAN = 420;
/** On Low Steps, so the view runs from Dodge gym to Butler between the filter pills and the stats bar. */
const HOME_CENTER = worldToMap({ x: 328, y: 350 });
/** How far past the drawn edge the map may be dragged, in screen px. */
const PAN_SLACK = 60;
const TAP_TOLERANCE = 5;
const EASE = [0.32, 0.72, 0, 1] as const;
const FOCUS_DURATION = 0.4;

export interface MapView {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  /** 1 / scale — keeps pins and labels a constant size while zooming. */
  inverseScale: MotionValue<number>;
  zoomBy: (factor: number) => void;
  /** `zoom` is relative to the opening view; defaults to at least that close. */
  centerOn: (point: MapPoint, zoom?: number) => void;
  reset: () => void;
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fully zoomed out: the whole world fits inside the viewport. */
const minScaleFor = (w: number, h: number) => Math.min(w / LAYER_SIZE.width, h / LAYER_SIZE.height, 1);
const homeScaleFor = (w: number, h: number) =>
  clamp(Math.max(w, h) / (HOME_SPAN * PX_PER_UNIT), minScaleFor(w, h), MAX_SCALE);

type ViewportBox = { w: number; h: number; left: number; top: number };

function readBox(el: HTMLElement | null): ViewportBox {
  const rect = el?.getBoundingClientRect();
  return { w: rect?.width || 1, h: rect?.height || 1, left: rect?.left ?? 0, top: rect?.top ?? 0 };
}

/** Translation that puts map point `p` at the viewport centre at scale `s`. */
function centeredOn({ w, h }: { w: number; h: number }, p: MapPoint, s: number) {
  return {
    tx: w / 2 - (s * LAYER_SIZE.width * p.x) / 100,
    ty: h / 2 - (s * LAYER_SIZE.height * p.y) / 100,
  };
}

/**
 * Pan / zoom state for the campus map. The layer is `LAYER_SIZE` pixels and is
 * transformed with `translate(x, y) scale(s)` from its top-left corner, so a
 * layer-local point `m` lands on screen at `x + s * m`.
 */
export function useMapView(onTap?: (point: MapPoint) => void): MapView {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const inverseScale = useTransform(scale, (s) => 1 / s);

  const running = useRef<AnimationPlaybackControls[]>([]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, pinchDist: 0 });
  const lastSize = useRef<{ w: number; h: number } | null>(null);
  /** Cached viewport box. Pointer moves read this instead of forcing layout. */
  const boxRef = useRef<ViewportBox>({ w: 1, h: 1, left: 0, top: 0 });
  const onTapRef = useRef(onTap);
  const rafRef = useRef(0);
  const pendingRef = useRef<{ type: "pan"; dx: number; dy: number } | { type: "zoom"; factor: number; px: number; py: number } | null>(null);
  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  const refreshBox = useCallback(() => {
    boxRef.current = readBox(viewportRef.current);
    return boxRef.current;
  }, []);

  const clampScale = useCallback((s: number) => {
    const { w, h } = boxRef.current;
    return clamp(s, minScaleFor(w, h), MAX_SCALE);
  }, []);

  /** Centres the layer on an axis where it is smaller than the viewport. */
  const clampTranslate = useCallback((tx: number, ty: number, s: number) => {
    const { w, h } = boxRef.current;
    const lw = LAYER_SIZE.width * s;
    const lh = LAYER_SIZE.height * s;
    return {
      x: lw <= w ? (w - lw) / 2 : clamp(tx, w - lw - PAN_SLACK, PAN_SLACK),
      y: lh <= h ? (h - lh) / 2 : clamp(ty, h - lh - PAN_SLACK, PAN_SLACK),
    };
  }, []);

  /** Cursor and a gesture flag, without a React render. CSS pauses decoration while it is set. */
  const markGesture = (active: boolean) => {
    const el = viewportRef.current;
    if (!el) return;
    if (active) {
      el.dataset.mapGesture = "";
      el.style.cursor = "grabbing";
    } else {
      delete el.dataset.mapGesture;
      el.style.cursor = "";
    }
  };

  const stop = () => {
    running.current.forEach((c) => c.stop());
    running.current = [];
  };

  const jumpTo = useCallback(
    (tx: number, ty: number, s: number) => {
      stop();
      const next = clampTranslate(tx, ty, s);
      scale.set(s);
      x.set(next.x);
      y.set(next.y);
    },
    [clampTranslate, scale, x, y],
  );

  const animateTo = useCallback(
    (tx: number, ty: number, s: number, duration = 0.38) => {
      if (prefersReducedMotion()) {
        jumpTo(tx, ty, s);
        return;
      }
      stop();
      const next = clampTranslate(tx, ty, s);
      const opts = { duration, ease: EASE };
      running.current = [animate(x, next.x, opts), animate(y, next.y, opts), animate(scale, s, opts)];
    },
    [clampTranslate, jumpTo, x, y, scale],
  );

  const homeView = useCallback(() => {
    const view = refreshBox();
    const s = homeScaleFor(view.w, view.h);
    return { ...centeredOn(view, HOME_CENTER, s), s };
  }, [refreshBox]);

  // Place the opening view before the first paint.
  useLayoutEffect(() => {
    const { tx, ty, s } = homeView();
    jumpTo(tx, ty, s);
    const { w, h } = boxRef.current;
    lastSize.current = { w, h };
  }, [homeView, jumpTo]);

  // Keep the point under the viewport centre fixed as the viewport resizes
  // (window resizes, and the desktop drawer opening or closing).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const { w, h } = refreshBox();
      const prev = lastSize.current;
      lastSize.current = { w, h };
      if (!prev || (prev.w === w && prev.h === h)) return;
      if (running.current.length > 0) return;
      const s = clampScale(scale.get());
      const cx = (prev.w / 2 - x.get()) / scale.get();
      const cy = (prev.h / 2 - y.get()) / scale.get();
      jumpTo(w / 2 - cx * s, h / 2 - cy * s, s);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [clampScale, jumpTo, refreshBox, scale, x, y]);

  /** Zooms keeping the screen point (px, py) — relative to the viewport — fixed. */
  const zoomAround = useCallback(
    (factor: number, px: number, py: number, animated: boolean) => {
      const s0 = scale.get();
      const s1 = clampScale(s0 * factor);
      if (s1 === s0) return;
      const tx = px - ((px - x.get()) * s1) / s0;
      const ty = py - ((py - y.get()) * s1) / s0;
      if (animated) animateTo(tx, ty, s1);
      else jumpTo(tx, ty, s1);
    },
    [animateTo, clampScale, jumpTo, scale, x, y],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const { w, h } = refreshBox();
      zoomAround(factor, w / 2, h / 2, true);
    },
    [refreshBox, zoomAround],
  );

  const centerOn = useCallback(
    (point: MapPoint, zoom?: number) => {
      const home = homeView().s;
      const s = clampScale(zoom !== undefined ? home * zoom : Math.max(scale.get(), home));
      refreshBox();
      const { tx, ty } = centeredOn(boxRef.current, point, s);
      animateTo(tx, ty, s, FOCUS_DURATION);
    },
    [animateTo, clampScale, homeView, refreshBox, scale],
  );

  const reset = useCallback(() => {
    const { tx, ty, s } = homeView();
    animateTo(tx, ty, s);
  }, [animateTo, homeView]);

  // Wheel / trackpad zoom needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { left, top } = boxRef.current;
      const sensitivity = e.ctrlKey ? 0.012 : 0.0022;
      zoomAround(Math.exp(-e.deltaY * sensitivity), e.clientX - left, e.clientY - top, false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAround]);

  const zoomAroundRef = useRef(zoomAround);
  zoomAroundRef.current = zoomAround;
  const clampTranslateRef = useRef(clampTranslate);
  clampTranslateRef.current = clampTranslate;

  const scheduleGesture = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const job = pendingRef.current;
      pendingRef.current = null;
      if (!job) return;
      if (job.type === "pan") {
        const next = clampTranslateRef.current(x.get() + job.dx, y.get() + job.dy, scale.get());
        x.set(next.x);
        y.set(next.y);
        return;
      }
      zoomAroundRef.current(job.factor, job.px, job.py, false);
    });
  };

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, [data-mobile-sheet]")) return;
    stop();
    refreshBox();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { moved: false, startX: e.clientX, startY: e.clientY, pinchDist: 0 };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
      markGesture(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinchDist > 0) {
        const { left, top } = boxRef.current;
        const step = dist / gesture.current.pinchDist;
        const pending = pendingRef.current;
        pendingRef.current = {
          type: "zoom",
          factor: (pending?.type === "zoom" ? pending.factor : 1) * step,
          px: (a.x + b.x) / 2 - left,
          py: (a.y + b.y) / 2 - top,
        };
        scheduleGesture();
      }
      gesture.current.pinchDist = dist;
      return;
    }

    const g = gesture.current;
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < TAP_TOLERANCE) return;
    if (!g.moved) {
      g.moved = true;
      markGesture(true);
    }
    const pending = pendingRef.current;
    pendingRef.current = {
      type: "pan",
      dx: (pending?.type === "pan" ? pending.dx : 0) + e.clientX - prev.x,
      dy: (pending?.type === "pan" ? pending.dy : 0) + e.clientY - prev.y,
    };
    scheduleGesture();
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    markGesture(false);
    if (!cancelled && !gesture.current.moved && onTapRef.current) {
      const { left, top } = refreshBox();
      const s = scale.get();
      onTapRef.current({
        x: ((e.clientX - left - x.get()) / s / LAYER_SIZE.width) * 100,
        y: ((e.clientY - top - y.get()) / s / LAYER_SIZE.height) * 100,
      });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = 80;
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (pan[e.key]) {
      e.preventDefault();
      const [dx, dy] = pan[e.key];
      animateTo(x.get() + dx, y.get() + dy, scale.get());
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(1.4);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(1 / 1.4);
    }
  };

  return {
    viewportRef,
    x,
    y,
    scale,
    inverseScale,
    zoomBy,
    centerOn,
    reset,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => endPointer(e, false),
      onPointerCancel: (e) => endPointer(e, true),
      onKeyDown,
    },
  };
}
