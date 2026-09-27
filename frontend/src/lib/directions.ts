import { mapToGeo } from "./geo";
import type { CampusEvent } from "@/types/event";

/**
 * Standard Google Maps directions link — opened in a new tab, no maps SDK.
 * Official listings route to their street address; student events route to
 * the calibrated coordinates of their pin.
 */
export function directionsUrl(event: CampusEvent): string {
  const pinned = event.source === "student" && event.mapX !== null && event.mapY !== null;
  const destination = pinned
    ? (() => {
        const { lat, lng } = mapToGeo({ x: event.mapX!, y: event.mapY! });
        return `${lat.toFixed(6)},${lng.toFixed(6)}`;
      })()
    : `${event.address}, New York, NY`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}
