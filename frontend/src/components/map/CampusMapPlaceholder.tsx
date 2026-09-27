"use client";

import { memo, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion, useTransform, type MotionValue } from "framer-motion";
import { Crown } from "lucide-react";

import { CampusMapArt } from "./CampusMapArt";
import { EventMarker, MapAnchor, MarkerPin } from "./EventMarker";
import { MapControls } from "./MapControls";
import { LAYER_SIZE, PX_PER_UNIT, useMapView } from "./use-map-view";
import { CAMPUS_LOCATIONS, getCampusLocation } from "@/data/campus-locations";
import { MAP_LABELS } from "@/lib/constants";
import type { MapPoint } from "@/lib/geo";
import { eventPoint } from "@/lib/use-campus-state";
import { cn } from "@/lib/utils";
import type { CampusEvent } from "@/types/event";

const ALMA_MATER = getCampusLocation("alma-mater")!;
const BUILDING_LABELS = CAMPUS_LOCATIONS.flatMap((location) => (location.label ? [location.label] : []));
/** Screen pixels per world unit at which each label tier appears. */
const TIER_MIN_PX: Record<1 | 2 | 3, number> = { 1: 0, 2: 1.9, 3: 3.1 };

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
  const { viewportRef, pointerHandlers, x, y, scale, inverseScale, zoomBy, centerOn, reset } =
    useMapView(onPickPoint);
  const picking = Boolean(onPickPoint);
  const tier2Opacity = useTierOpacity(scale, TIER_MIN_PX[2]);
  const tier3Opacity = useTierOpacity(scale, TIER_MIN_PX[3]);

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
          "absolute inset-0 touch-none overscroll-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40",
          picking ? "cursor-crosshair" : "cursor-grab",
        )}
      >
        <MapStage x={x} y={y} scale={scale}>
          <StableMapArt />
          <MapLabels inverseScale={inverseScale} tier2Opacity={tier2Opacity} tier3Opacity={tier3Opacity} />

          {userPoint && (
            <MapAnchor x={userPoint.x} y={userPoint.y} inverseScale={inverseScale}>
              <UserLocationDot />
            </MapAnchor>
          )}

          <EventMarkers
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={onSelectEvent}
            inverseScale={inverseScale}
            interactive={!picking}
          />

          {draftPin && (
            <MapAnchor x={draftPin.x} y={draftPin.y} inverseScale={inverseScale} className="z-[3]">
              <motion.div
                initial={{ y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="absolute"
                style={{ translateX: "-50%", translateY: "-100%" }}
              >
                <div className="cc-pin-shadow relative" style={{ width: 39, height: 50 }}>
                  <MarkerPin markerColor={draftPin.markerColor} iconType={draftPin.iconType} selected />
                </div>
              </motion.div>
            </MapAnchor>
          )}
        </MapStage>
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

const StableMapArt = memo(CampusMapArt);

/**
 * The illustrated layer. Pan and zoom write one translate3d/scale here, so
 * markers ride along instead of each computing a screen position.
 */
function MapStage({
  x,
  y,
  scale,
  children,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let queued = false;
    const paint = () => {
      queued = false;
      el.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0) scale(${scale.get()})`;
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(paint);
    };
    paint();
    const unsubs = [x.on("change", schedule), y.on("change", schedule), scale.on("change", schedule)];
    return () => unsubs.forEach((unsub) => unsub());
  }, [x, y, scale]);
  return (
    <div
      ref={ref}
      className="absolute left-0 top-0"
      style={{
        transformOrigin: "0 0",
        width: LAYER_SIZE.width,
        height: LAYER_SIZE.height,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}

const MapLabels = memo(function MapLabels({
  inverseScale,
  tier2Opacity,
  tier3Opacity,
}: {
  inverseScale: MotionValue<number>;
  tier2Opacity: MotionValue<number>;
  tier3Opacity: MotionValue<number>;
}) {
  const tierOpacity = { 1: undefined, 2: tier2Opacity, 3: tier3Opacity } as const;
  return (
    <>
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

      {MAP_LABELS.parks.map((park) => (
        <MapAnchor key={park.label} x={park.x} y={park.y} inverseScale={inverseScale}>
          <span
            className="absolute w-max whitespace-nowrap font-serif text-[15px] italic leading-none text-[#5B7F4E] [text-shadow:0_1px_3px_rgba(255,255,255,0.8)]"
            style={{ transform: `translate(-50%, -50%) rotate(${park.rotate}deg)` }}
          >
            {park.label}
          </span>
        </MapAnchor>
      ))}

      {BUILDING_LABELS.map((building) => (
        <MapAnchor
          key={building.text}
          x={building.x}
          y={building.y}
          inverseScale={inverseScale}
          opacity={tierOpacity[building.tier]}
        >
          <span
            className={cn(
              "absolute w-max whitespace-pre-line text-center font-serif leading-[1.2] font-normal text-map-label [text-shadow:0_1px_3px_rgba(255,255,255,0.95)]",
              building.tier === 3 ? "text-[13px]" : "text-[15px]",
            )}
            style={{ transform: "translate(-50%, -50%)" }}
          >
            {building.text}
          </span>
        </MapAnchor>
      ))}

      <MapAnchor x={ALMA_MATER.mapX} y={ALMA_MATER.mapY} inverseScale={inverseScale} opacity={tier2Opacity}>
        <Crown
          size={19}
          strokeWidth={2}
          aria-hidden
          className="absolute -translate-x-1/2 -translate-y-1/2 text-[#3F6FB5]"
        />
      </MapAnchor>
    </>
  );
});

const EventMarkers = memo(function EventMarkers({
  events,
  selectedEventId,
  onSelectEvent,
  inverseScale,
  interactive,
}: {
  events: CampusEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  inverseScale: MotionValue<number>;
  interactive: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {events.map((event) => {
        const point = eventPoint(event);
        return point ? (
          <EventMarker
            key={event.id}
            event={event}
            point={point}
            selected={event.id === selectedEventId}
            onSelect={onSelectEvent}
            inverseScale={inverseScale}
            interactive={interactive}
          />
        ) : null;
      })}
    </AnimatePresence>
  );
});

/** Opacity that switches a label tier on once the map is zoomed in far enough. */
function useTierOpacity(scale: MotionValue<number>, minPxPerUnit: number) {
  return useTransform(scale, (s): number => (s * PX_PER_UNIT >= minPxPerUnit ? 1 : 0));
}

/** "You are here" dot, only rendered from a real browser location. */
function UserLocationDot() {
  return (
    <span aria-label="Your location" role="img" className="absolute grid place-items-center">
      <span className="absolute h-[42px] w-[42px] rounded-full bg-[#1D6AEE]/12" />
      <span className="absolute h-[27px] w-[27px] rounded-full bg-white/85" />
      <span className="absolute h-[20px] w-[20px] rounded-full bg-[#1D6AEE] shadow-[0_1px_3px_rgba(15,37,71,0.3)]" />
      <span className="absolute top-[16px] w-max rounded-full bg-white/90 px-[7px] py-[1px] text-[11px] font-semibold text-[#1559D0] shadow-[0_1px_3px_rgba(15,37,71,0.18)]">
        You are here
      </span>
    </span>
  );
}
