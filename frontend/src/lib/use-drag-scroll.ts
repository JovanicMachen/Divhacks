"use client";

import { useEffect, useRef } from "react";

const DRAG_THRESHOLD = 5;

/**
 * Horizontal rows scroll natively with a finger (momentum included). This adds
 * the same drag for a mouse, with a short glide on release, and swallows the
 * click that ends a drag so a chip isn't selected by accident.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startScroll = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;
    let moved = false;
    let frame = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      cancelAnimationFrame(frame);
      dragging = true;
      moved = false;
      startX = lastX = e.clientX;
      lastT = performance.now();
      startScroll = el.scrollLeft;
      velocity = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.style.scrollSnapType = "none";
      }
      const now = performance.now();
      velocity = (e.clientX - lastX) / Math.max(1, now - lastT);
      lastX = e.clientX;
      lastT = now;
      el.scrollLeft = startScroll - dx;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (!moved) return;
      let v = velocity * 16;
      const glide = () => {
        if (Math.abs(v) < 0.4) {
          el.style.scrollSnapType = "";
          return;
        }
        el.scrollLeft -= v;
        v *= 0.92;
        frame = requestAnimationFrame(glide);
      };
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) frame = requestAnimationFrame(glide);
      else el.style.scrollSnapType = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, []);

  return ref;
}
