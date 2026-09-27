"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LatLng } from "./geo";

export type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export interface GeoResult {
  status: GeoStatus;
  position: LatLng | null;
}

export interface GeolocationState extends GeoResult {
  /**
   * Asks for location the first time it is called, then keeps watching.
   * Resolves with the outcome; never re-prompts after a denial.
   */
  request: () => Promise<GeoResult>;
}

/**
 * Browser geolocation held in memory only — never sent anywhere or persisted.
 * Nothing is requested until a location-dependent control calls `request()`.
 */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<LatLng | null>(null);
  const watchId = useRef<number | null>(null);
  const statusRef = useRef<GeoStatus>("idle");
  const positionRef = useRef<LatLng | null>(null);

  const update = useCallback((next: GeoStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  const request = useCallback((): Promise<GeoResult> => {
    const current = statusRef.current;
    const settled = (status: GeoStatus) => Promise.resolve({ status, position: positionRef.current });
    // A denial is final for the session; timeouts ("unavailable") may be retried
    // because retrying never shows another permission prompt.
    if (current === "denied" || current === "requesting") return settled(current);
    if (current === "granted" && positionRef.current) return settled("granted");

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      update("unavailable");
      return settled("unavailable");
    }

    update("requesting");
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          positionRef.current = next;
          setPosition(next);
          update("granted");
          resolve({ status: "granted", position: next });

          if (watchId.current === null) {
            watchId.current = navigator.geolocation.watchPosition(
              (p) => {
                const moved = { lat: p.coords.latitude, lng: p.coords.longitude };
                positionRef.current = moved;
                setPosition(moved);
              },
              () => undefined,
              { enableHighAccuracy: true, maximumAge: 10_000 },
            );
          }
        },
        (error) => {
          const next = error.code === error.PERMISSION_DENIED ? "denied" : "unavailable";
          update(next);
          resolve({ status: next, position: null });
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    });
  }, [update]);

  return { status, position, request };
}
