"use client";

import { useImperativeHandle, type Ref } from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";

import { CampusMapArt } from "./CampusMapArt";
import { EventMarker, MapAnchor, MarkerPin } from "./EventMarker";
import { MapControls } from "./MapControls";
import { useMapView } from "./use-map-view";
import { MAP_LABELS } from "@/lib/constants";
import type { MapPoint } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { CampusEvent } from "@/types/event";

/** Imperative camera controls, used by Near Me and the locate button. */
export interface MapViewHandle {
  centerOn: (point: MapPoint, zoom?: number) => void;
  reset: () => void;
}

interface CampusMapPlaceholderProps {
  events: CampusEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  viewRef?: Ref<MapViewHandle>;
  /** Real user position projected onto the map, or null when unknown. */
  userPoint?: MapPoint | null;
  onLocate: () => void;
  locating?: boolean;
  located?: boolean;
  /** When set, the map is in "choose a location" mode and taps call this. */
  onPickPoint?: (point: MapPoint) => void;
  /** Preview pin for an event being created. */
  draftPin?: (MapPoint & Pick<CampusEvent, "markerColor" | "iconType">) | null;
}

/**
 * Pannable, zoomable stand-in for the interactive map.
 *
 * The props mirror what a real Mapbox component needs, so Phase 2 can drop in
 * `CampusMap.tsx` behind the same interface without touching the page shell.
 */
export function CampusMapPlaceholder({
  events,
  selectedEventId,
  onSelectEvent,
  viewRef,
  userPoint,
  onLocate,
  locating,
  located,
  onPickPoint,
  draftPin,
}: CampusMapPlaceholderProps) {
  const { viewportRef, pointerHandlers, x, y, scale, inverseScale, isDragging, zoomBy, centerOn, reset } =
    useMapView(onPickPoint);
  const picking = Boolean(onPickPoint);

  useImperativeHandle(viewRef, () => ({ centerOn, reset }), [centerOn, reset]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-map-ground">
      <div
        ref={viewportRef}
        {...pointerHandlers}
        tabIndex={0}
        role="application"
        aria-label="Campus map. Drag to pan, scroll or use plus and minus to zoom, arrow keys to move."
        className={cn(
          "absolute inset-0 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40",
          picking ? "cursor-crosshair" : isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <motion.div
          className="absolute inset-0"
          style={{ x, y, scale, transformOrigin: "0 0" }}
        >
          <CampusMapArt />

          {MAP_LABELS.streets.map((street) => (
            <MapAnchor key={street.label} x={street.x} y={street.y} inverseScale={inverseScale}>
              <span
                className="absolute w-max whitespace-nowrap text-[12.5px] font-medium tracking-[0.01em] text-map-street-label [text-shadow:0_1px_2px_rgba(255,255,255,0.85)]"
                style={{ transform: `translate(-50%, -50%) rotate(${street.rotate}deg)` }}
              >
                {street.label}
              </span>
            </MapAnchor>
          ))}

          {MAP_LABELS.buildings.map((building) => (
            <MapAnchor key={building.label} x={building.x} y={building.y} inverseScale={inverseScale}>
              <span
                className="absolute w-max whitespace-pre-line text-center font-serif text-[15px] leading-[1.2] font-normal text-map-label [text-shadow:0_1px_3px_rgba(255,255,255,0.95)]"
                style={{ transform: "translate(-50%, -50%)" }}
              >
                {building.label}
              </span>
            </MapAnchor>
          ))}

          {/* Alma Mater landmark glyph */}
          <MapAnchor x={47.6} y={64.8} inverseScale={inverseScale}>
            <Crown
              size={19}
              strokeWidth={2}
              aria-hidden
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[#3F6FB5]"
            />
          </MapAnchor>

          {userPoint && (
            <MapAnchor x={userPoint.x} y={userPoint.y} inverseScale={inverseScale}>
              <UserLocationDot />
            </MapAnchor>
          )}

          {events.map((event) => (
            <EventMarker
              key={event.id}
              event={event}
              selected={event.id === selectedEventId}
              onSelect={onSelectEvent}
              inverseScale={inverseScale}
              interactive={!picking}
            />
          ))}

          {draftPin && (
            <MapAnchor x={draftPin.x} y={draftPin.y} inverseScale={inverseScale} className="z-[3]">
              <motion.div
                initial={{ y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="absolute"
                style={{ translateX: "-50%", translateY: "-100%" }}
              >
                <div className="relative drop-shadow-[0_3px_5px_rgba(15,37,71,0.22)]" style={{ width: 39, height: 50 }}>
                  <MarkerPin markerColor={draftPin.markerColor} iconType={draftPin.iconType} selected />
                </div>
              </motion.div>
            </MapAnchor>
          )}
        </motion.div>
      </div>

      <MapControls
        onZoomIn={() => zoomBy(1.4)}
        onZoomOut={() => zoomBy(1 / 1.4)}
        onLocate={onLocate}
        locating={locating}
        located={located}
      />
    </div>
  );
}

/** Blue "you are here" dot. Shown at the campus default until a real location replaces it. */
function UserLocationDot() {
  return (
    <span aria-label="Your location" role="img" className="absolute grid place-items-center">
      <span className="absolute h-[42px] w-[42px] rounded-full bg-[#1D6AEE]/12" />
      <span className="absolute h-[27px] w-[27px] rounded-full bg-white/85" />
      <span className="absolute h-[20px] w-[20px] rounded-full bg-[#1D6AEE] shadow-[0_1px_3px_rgba(15,37,71,0.3)]" />
    </span>
  );
}
