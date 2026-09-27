"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { eventWindow, isCancelled, isOffLiveMap, phaseAt, useLifecycleNow } from "./event-clock";
import { mapToGeo, type MapPoint } from "./geo";
import { useUserEvents } from "./user-events";
import { FEATURED_EVENT_ID } from "@/data/mock-events";
import type {
  CampusEvent,
  DateFilter,
  EventCategory,
  EventDraft,
  KindFilter,
  MapPill,
  SidebarFilter,
} from "@/types/event";

export interface Toast {
  id: number;
  message: string;
}

function matchesQuery(event: CampusEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [event.title, event.category, event.locationName, event.host].some((field) =>
    field.toLowerCase().includes(q),
  );
}

/** Every event has a route; student events resolve theirs on the client. */
export function eventPath(event: CampusEvent): string {
  return `/events/${event.id}`;
}

/** Where the event's pin sits, or null for events that aren't on the map. */
export function eventPoint(event: CampusEvent): MapPoint | null {
  return event.mapX === null || event.mapY === null ? null : { x: event.mapX, y: event.mapY };
}

/** Currently running: official listings say so in their status, student events by their times. */
export function isHappeningNow(event: CampusEvent, now: number = Date.now()): boolean {
  if (isCancelled(event)) return false;
  const span = eventWindow(event);
  if (span) return phaseAt(span, now) === "live";
  return event.timeStatus === "Happening now" || event.timeStatus.startsWith("Ends in");
}

const APP_TITLE = "Campus Connect — Columbia University";
const MISSING_TOAST: Toast = { id: -1, message: "This event is no longer available." };

/** Keeps the address bar and tab title in step with the open event. */
function syncUrl(event: CampusEvent | null) {
  const path = event ? eventPath(event) : "/";
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  document.title = event ? `${event.title} at ${event.locationName} — Campus Connect` : APP_TITLE;
}

const toLocalIso = (time: string, now = new Date()) => {
  const [h, m] = time.split(":").map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return at.toISOString();
};

/** All interactive state for the map screen. */
export function useCampusState(initialEventId?: string) {
  const {
    events,
    ready,
    postEvent,
    deleteEvent: removeEvent,
    cancelEvent,
    onRemoteDelete,
    going,
    toggleGoing,
    saved,
    toggleSaved,
    focusId,
    setFocusId,
  } = useUserEvents();
  const [requestedId] = useState(() => initialEventId ?? focusId);
  const [selectedId, setSelectedId] = useState<string | null>(() => requestedId ?? FEATURED_EVENT_ID);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [mapPill, setMapPill] = useState<MapPill>("trending");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | "all">("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null;
  /** A deep link to an event that no longer exists (once student events have loaded). */
  const missingRequested = ready && requestedId !== null && selectedId === requestedId && !selectedEvent;

  // Moves only when an event starts or ends, so lists and counts follow the real times.
  const lifecycleNow = useLifecycleNow(events);
  /** What the live map shows: ended and cancelled events leave it but stay in the data for profile lists. */
  const liveEvents = useMemo(() => events.filter((event) => !isOffLiveMap(event, lifecycleNow)), [events, lifecycleNow]);

  const visibleEvents = useMemo(
    () =>
      liveEvents.filter((event) => {
        if (!matchesQuery(event, query)) return false;
        if (kindFilter === "rally" && event.kind !== "rally") return false;
        if (kindFilter === "events" && event.kind === "rally") return false;
        if (sidebarFilter === "saved" && !saved.has(event.id)) return false;
        if (sidebarFilter !== "all" && sidebarFilter !== "saved" && event.category !== sidebarFilter)
          return false;
        if (mapPill === "freeFood" && event.category !== "Free Food") return false;
        if (categoryFilter !== "all" && event.category !== categoryFilter) return false;
        if (dateFilter === "today" && event.kind !== "rally" && !event.dateLabel.startsWith("Today")) return false;
        return true;
      }),
    [liveEvents, query, sidebarFilter, saved, mapPill, categoryFilter, dateFilter, kindFilter],
  );

  const stats = useMemo(
    () => ({
      happeningNow: liveEvents.filter((event) => isHappeningNow(event, lifecycleNow)).length,
      freeFood: liveEvents.filter((event) => event.category === "Free Food").length,
    }),
    [liveEvents, lifecycleNow],
  );

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    if (focusId) setFocusId(null);
  }, [focusId, setFocusId]);

  useEffect(() => {
    if (missingRequested) syncUrl(null);
  }, [missingRequested]);
  const [missingDismissed, setMissingDismissed] = useState(false);
  const shownToast = toast ?? (missingRequested && !missingDismissed ? MISSING_TOAST : null);

  // Someone else deleted the event this screen has open.
  useEffect(
    () =>
      onRemoteDelete((id) => {
        if (id !== selectedId) return;
        setSelectedId(null);
        syncUrl(null);
        showToast("This event was removed by its host.");
      }),
    [onRemoteDelete, selectedId, showToast],
  );

  const selectEvent = useCallback(
    (id: string) => {
      const event = events.find((e) => e.id === id);
      if (!event) return;
      setSelectedId(id);
      setDrawerOpen(true);
      syncUrl(event);
    },
    [events],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    syncUrl(null);
  }, []);

  const createEvent = useCallback(
    async (draft: EventDraft, hostName: string): Promise<{ event: CampusEvent } | { error: string }> => {
      if (!draft.point) return { error: "Choose where it's happening on the map." };
      const geo = mapToGeo(draft.point);
      const rally = draft.kind === "rally";
      const now = Date.now();
      const rallyEnd = new Date(now + draft.rallyWindowMinutes * 60_000).toISOString();
      const result = await postEvent({
        title: draft.title.trim(),
        category: draft.category,
        description: draft.description.trim(),
        location_name: draft.locationName.trim() || "Pinned location",
        location_id: draft.locationId,
        map_x: draft.point.x,
        map_y: draft.point.y,
        latitude: Number(geo.lat.toFixed(6)),
        longitude: Number(geo.lng.toFixed(6)),
        host_name: rally && draft.rallyAnonymous ? "Anonymous student" : hostName,
        start_time: rally ? new Date(now).toISOString() : toLocalIso(draft.startTime),
        end_time: rally ? rallyEnd : toLocalIso(draft.endTime),
        event_type: rally ? "rally" : "event",
        ...(rally
          ? {
              rally_min_participants: draft.rallyMinParticipants,
              rally_expires_at: rallyEnd,
              rally_anonymous: draft.rallyAnonymous,
            }
          : {
              is_paid: draft.isPaid && Boolean(draft.priceDisplay.trim()),
              price_display: draft.isPaid && draft.priceDisplay.trim() ? draft.priceDisplay.trim() : null,
            }),
      }, rally ? null : draft.photo);
      if ("event" in result) {
        setSelectedId(result.event.id);
        setDrawerOpen(true);
        syncUrl(result.event);
      }
      return result;
    },
    [postEvent],
  );

  const deleteEvent = useCallback(
    async (id: string): Promise<string | null> => {
      const error = await removeEvent(id);
      if (error) return error;
      if (selectedId === id) {
        setSelectedId(null);
        setDrawerOpen(false);
        syncUrl(null);
      }
      return null;
    },
    [removeEvent, selectedId],
  );

  const clearFilters = useCallback(() => {
    setQuery("");
    setSidebarFilter("all");
    setKindFilter("all");
    setMapPill("trending");
    setCategoryFilter("all");
    setDateFilter("today");
  }, []);

  return {
    events,
    liveEvents,
    ready,
    clearFilters,
    visibleEvents,
    stats,
    selectedEvent,
    drawerOpen: drawerOpen && selectedEvent !== null,
    requestedId,
    selectEvent,
    closeDrawer,
    going,
    toggleGoing,
    saved,
    toggleSaved,
    query,
    setQuery,
    sidebarFilter,
    setSidebarFilter,
    mapPill,
    setMapPill,
    dateFilter,
    setDateFilter,
    categoryFilter,
    setCategoryFilter,
    kindFilter,
    setKindFilter,
    createEvent,
    deleteEvent,
    cancelEvent,
    toast: shownToast,
    showToast,
    dismissToast: () => {
      setToast(null);
      setMissingDismissed(true);
    },
  };
}

export type CampusState = ReturnType<typeof useCampusState>;
