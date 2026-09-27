"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { usePresence } from "framer-motion";

import { cn } from "@/lib/utils";

export type SheetDetent = "peek" | "medium" | "expanded";

export interface MobileSheetHandle {
  snap: (next: SheetDetent) => void;
}

interface MobileSheetProps {
  label: string;
  children: React.ReactNode;
  /** Where the sheet rests before anyone drags it. */
  initial?: SheetDetent;
  /** Visible height of the collapsed bar, in px. */
  peek?: number;
  /** Fraction of the visual viewport for the middle stop. */
  mediumRatio?: number;
  /** Fraction of the visual viewport for the fully open stop. */
  expandedRatio?: number;
  /** Caps the open height. */
  maxHeight?: number;
  /** Slide up the first time it mounts. Persistent chrome (the live bar) skips this. */
  enter?: boolean;
  /** A drag past the collapsed stop closes the sheet. */
  dismissible?: boolean;
  onDismiss?: () => void;
  onDetentChange?: (detent: SheetDetent) => void;
  /** Pin open and ignore drags, used while the keyboard covers the screen. */
  locked?: boolean;
  /** Extra lift, for the on-screen keyboard. */
  bottomInset?: number;
  modal?: boolean;
  id?: string;
  nodeRef?: React.Ref<HTMLDivElement | null>;
  className?: string;
  ref?: React.Ref<MobileSheetHandle>;
}

const FAST_SWIPE = 900;
const MOVE_SLOP = 8;

let pageHolds = 0;

function holdPage() {
  pageHolds += 1;
  document.documentElement.classList.add("cc-sheet-gesture");
}

function releasePage() {
  pageHolds = Math.max(0, pageHolds - 1);
  if (pageHolds === 0) document.documentElement.classList.remove("cc-sheet-gesture");
}

function useVisualHeight() {
  const [box, setBox] = useState({ height: 0, bottom: 0 });
  useLayoutEffect(() => {
    const read = () => {
      const vv = window.visualViewport;
      setBox({
        height: Math.round(vv?.height ?? window.innerHeight),
        bottom: vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0,
      });
    };
    read();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", read);
    vv?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    return () => {
      vv?.removeEventListener("resize", read);
      vv?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, []);
  return box;
}

function nearestDetent(y: number, points: Record<SheetDetent, number>): SheetDetent {
  return (["expanded", "medium", "peek"] as const).reduce((best, key) =>
    Math.abs(points[key] - y) < Math.abs(points[best] - y) ? key : best,
  );
}

function scrollerOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-sheet-scroll]") : null;
}

function canScroll(el: HTMLElement | null): boolean {
  return Boolean(el && el.scrollHeight > el.clientHeight + 2);
}

/**
 * Phone bottom sheet with peek, medium, and expanded stops.
 * The sheet follows the finger. Scrollable regions keep their own scroll until
 * they hit the top, and the page behind the sheet does not bounce.
 */
export function MobileSheet({
  label,
  children,
  initial = "expanded",
  peek = 112,
  mediumRatio = 0.52,
  expandedRatio = 0.88,
  maxHeight = 760,
  enter = true,
  dismissible = false,
  onDismiss,
  onDetentChange,
  locked = false,
  bottomInset = 0,
  modal = false,
  id,
  nodeRef,
  className,
  ref,
}: MobileSheetProps) {
  const viewport = useVisualHeight();
  const rootRef = useRef<HTMLDivElement>(null);
  const yRef = useRef(0);
  const detentRef = useRef<SheetDetent>(initial);
  const draggingRef = useRef(false);
  const enteredRef = useRef(false);
  const [detent, setDetent] = useState<SheetDetent>(initial);
  const [isPresent, safeToRemove] = usePresence();

  const viewHeight = viewport.height;
  const expanded = viewHeight ? Math.round(Math.min(maxHeight, Math.max(peek + 96, viewHeight * expandedRatio))) : 0;
  const medium = expanded
    ? Math.round(Math.min(expanded - 56, Math.max(peek + 64, viewHeight * mediumRatio)))
    : 0;
  const points: Record<SheetDetent, number> = {
    expanded: 0,
    medium: Math.max(0, expanded - medium),
    peek: Math.max(0, expanded - peek),
  };

  const metricsRef = useRef({ expanded, points, dismissible, locked, peek });
  metricsRef.current = { expanded, points, dismissible, locked, peek };
  const onDismissRef = useRef(onDismiss);
  const onDetentRef = useRef(onDetentChange);
  onDismissRef.current = onDismiss;
  onDetentRef.current = onDetentChange;
  const removeRef = useRef(safeToRemove);
  removeRef.current = safeToRemove;

  const settle = (y: number, animate: boolean) => {
    yRef.current = y;
    const el = rootRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.style.transition = animate && !reduce ? "transform 0.42s cubic-bezier(0.22, 1.15, 0.36, 1)" : "none";
    el.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const commit = (next: SheetDetent, animate: boolean) => {
    detentRef.current = next;
    setDetent(next);
    onDetentRef.current?.(next);
    settleRef.current(metricsRef.current.points[next], animate);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useImperativeHandle(ref, () => ({ snap: (next) => commitRef.current(next, true) }), []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof nodeRef === "function") nodeRef(el);
    else if (nodeRef) nodeRef.current = el;
    return () => {
      if (typeof nodeRef === "function") nodeRef(null);
      else if (nodeRef) nodeRef.current = null;
    };
  }, [nodeRef]);

  useLayoutEffect(() => {
    if (!expanded) return;
    if (locked) {
      settleRef.current(0, enteredRef.current);
      detentRef.current = "expanded";
      return;
    }
    const target = points[detentRef.current];
    if (!enteredRef.current) {
      enteredRef.current = true;
      if (enter) {
        settleRef.current(expanded + 24, false);
        requestAnimationFrame(() => settleRef.current(target, true));
      } else settleRef.current(target, false);
      return;
    }
    if (!draggingRef.current) settleRef.current(target, true);
  }, [expanded, enter, locked, points.expanded, points.medium, points.peek]);

  useEffect(() => {
    if (isPresent) return;
    settleRef.current(metricsRef.current.expanded + 48, true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => removeRef.current?.(), reduce ? 0 : 280);
    return () => window.clearTimeout(timer);
  }, [isPresent]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let mode: "pending" | "sheet" | "scroll" | "ignore" | "hold" = "pending";
    let startX = 0;
    let startY = 0;
    let origin = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let active = false;
    let held = false;
    let moved = false;
    let scroller: HTMLElement | null = null;
    let fromChip = false;
    let pointerId = -1;

    const finish = () => {
      if (held) {
        held = false;
        releasePage();
      }
      if (!active) return;
      active = false;
      draggingRef.current = false;
      root.removeAttribute("data-dragging");
      if (mode !== "sheet") return;
      const { points: stops, dismissible: canDismiss, expanded: full } = metricsRef.current;
      const y = yRef.current;
      if (canDismiss && y > stops.peek + 56) {
        settleRef.current(full + 48, true);
        onDismissRef.current?.();
        return;
      }
      const next: SheetDetent =
        velocity > FAST_SWIPE ? "peek" : velocity < -FAST_SWIPE ? "expanded" : nearestDetent(y, stops);
      commitRef.current(next, true);
    };

    const track = (y: number) => {
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) velocity = ((y - lastY) / dt) * 1000;
      lastY = y;
      lastT = now;
    };

    const begin = (x: number, y: number, target: EventTarget | null) => {
      if (metricsRef.current.locked) return;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) {
        mode = "ignore";
        active = false;
        return;
      }
      active = true;
      moved = false;
      mode = "pending";
      scroller = scrollerOf(target);
      fromChip = target instanceof Element && Boolean(target.closest(".cc-chip-row, [data-sheet-pan-x]"));
      startX = x;
      startY = lastY = y;
      origin = yRef.current;
      lastT = performance.now();
      velocity = 0;
      held = true;
      holdPage();
      root.style.transition = "none";
    };

    const moveTo = (x: number, y: number, prevent: () => void) => {
      if (!active || metricsRef.current.locked) return;
      const dy = y - startY;
      const dx = x - startX;
      const frameDy = y - lastY;
      track(y);

      if (mode === "pending") {
        if (Math.abs(dy) >= Math.abs(dx) && dy !== 0) {
          const atTop = !scroller || scroller.scrollTop <= 0;
          const atBottom = !scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
          const scrollingContent = canScroll(scroller) && ((dy > 0 && !atTop) || (dy < 0 && !atBottom));
          if (!scrollingContent) prevent();
        }
        if (Math.hypot(dx, dy) < MOVE_SLOP) return;
        const horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
        if (horizontal && fromChip) {
          mode = "ignore";
          return;
        }
        if (horizontal) mode = "hold";
        else if (canScroll(scroller) && scroller) {
          const atTop = scroller.scrollTop <= 0;
          const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
          if (dy > 0 && !atTop) mode = "scroll";
          else if (dy < 0 && !atBottom) mode = "scroll";
          else mode = "sheet";
        } else mode = "sheet";
      }

      if (mode === "scroll" && scroller) {
        const atTop = scroller.scrollTop <= 0;
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        const pullDown = frameDy > 0 && atTop;
        const pullUp = frameDy < 0 && atBottom && yRef.current > 1;
        if (pullDown || pullUp) {
          mode = "sheet";
          startY = y;
          origin = yRef.current;
        } else return;
      } else if (mode === "scroll") mode = "sheet";

      if (mode === "ignore") return;
      if (mode === "hold") {
        prevent();
        return;
      }

      prevent();
      moved = true;
      draggingRef.current = true;
      root.setAttribute("data-dragging", "");
      const { points: stops, dismissible: canDismiss } = metricsRef.current;
      const raw = origin + (y - startY);
      const floor = stops.peek;
      const next = raw < 0 ? raw * 0.28 : raw > floor ? floor + (raw - floor) * (canDismiss ? 0.62 : 0.22) : raw;
      settleRef.current(next, false);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      moveTo(e.touches[0].clientX, e.touches[0].clientY, () => {
        if (e.cancelable) e.preventDefault();
      });
    };
    const onTouchEnd = () => finish();

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      pointerId = e.pointerId;
      begin(e.clientX, e.clientY, e.target);
      if (active) root.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || e.pointerType === "touch") return;
      moveTo(e.clientX, e.clientY, () => e.preventDefault());
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || e.pointerType === "touch") return;
      pointerId = -1;
      finish();
    };
    const onClick = (e: MouseEvent) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerEnd);
    root.addEventListener("pointercancel", onPointerEnd);
    root.addEventListener("click", onClick, true);
    return () => {
      if (held) releasePage();
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerEnd);
      root.removeEventListener("pointercancel", onPointerEnd);
      root.removeEventListener("click", onClick, true);
    };
  }, []);

  const bottom = Math.max(bottomInset, viewport.bottom);

  return (
    <div
      ref={rootRef}
      id={id}
      role={modal ? "dialog" : "region"}
      aria-modal={modal || undefined}
      aria-label={label}
      data-mobile-sheet=""
      data-detent={detent}
      className={cn(
        "cc-sheet pointer-events-auto flex flex-col overflow-hidden rounded-[22px] bg-panel shadow-[0_-8px_28px_rgba(15,37,71,0.16)]",
        className,
      )}
      style={{
        height: expanded || 0,
        bottom: bottom > 0 ? bottom : undefined,
        opacity: expanded ? 1 : 0,
        pointerEvents: expanded ? "auto" : "none",
        touchAction: "none",
        overscrollBehavior: "none",
      }}
    >
      <div data-sheet-handle="" className="flex shrink-0 justify-center pb-1 pt-2">
        <span aria-hidden className="h-1 w-9 rounded-full bg-line-strong" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
