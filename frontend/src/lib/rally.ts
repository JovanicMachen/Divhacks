"use client";

import { useEffect, useState } from "react";

import type { RallyInfo } from "@/types/event";

/** "04:28" — minutes and seconds left in a forming Rally's window. */
export function formatRallyClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** "4m 48s left" for toasts and cards. */
export function formatRallyLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s left` : `${seconds}s left`;
}

/**
 * Milliseconds left in a forming Rally, ticking every second from its stored
 * rally_expires_at. Null once the Rally is on or has expired.
 */
export function useRallyRemaining(rally: RallyInfo | null): number | null {
  const forming = rally?.status === "forming";
  const expiresAt = rally?.expiresAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!forming || !expiresAt) return;
    const deadline = Date.parse(expiresAt);
    let timer = 0;
    // Stop ticking once the window has closed.
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at >= deadline) window.clearInterval(timer);
    };
    timer = window.setInterval(tick, 1000);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [forming, expiresAt]);
  if (!forming || !expiresAt) return null;
  return Math.max(0, Date.parse(expiresAt) - now);
}

export const RALLY_NAVY = "#0f2547";
export const RALLY_BLUE = "#1766e8";
export const ORG_PURPLE = { solid: "#7C3AED", soft: "#F1EAFE", text: "#6D28D9" } as const;
