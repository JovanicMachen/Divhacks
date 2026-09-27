"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CATEGORY_STYLE } from "./constants";
import { formatClock, timeStatusFor, todayLabel } from "./utils";
import { useUserEvents } from "./user-events";
import { FEATURED_EVENT_ID } from "@/data/mock-events";
import type {
  CampusEvent,
  DateFilter,
  EventCategory,
  EventDraft,
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

/** Built-in events have a route; session-only events deliberately do not. */
export function eventPath(event: CampusEvent): string | null {
  return event.isTemporary ? null : `/events/${event.id}`;
}

const APP_TITLE = "Campus Connect — Columbia University";

/** Keeps the address bar and tab title in step with the open event. */
function syncUrl(event: CampusEvent | null) {
  const path = event ? eventPath(event) ?? "/" : "/";
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  document.title = event ? `${event.title} at ${event.locationName} — Campus Connect` : APP_TITLE;
}

/**
 * All interactive state for the Phase 2 frontend. Everything lives in React
 * memory: going/saved/created events reset on refresh by design.
 */
export function useCampusState(initialEventId?: string) {
  const { events, addCreatedEvent, going, toggleGoing, saved, toggleSaved, focusId, setFocusId } =
    useUserEvents();
  const [selectedId, setSelectedId] = useState(() => {
    const requested = initialEventId ?? focusId;
    return requested && events.some((e) => e.id === requested) ? requested : FEATURED_EVENT_ID;
  });
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [mapPill, setMapPill] = useState<MapPill>("trending");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | "all">("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedId) ?? events[0];

  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!matchesQuery(event, query)) return false;
        if (sidebarFilter === "saved" && !saved.has(event.id)) return false;
        if (sidebarFilter !== "all" && sidebarFilter !== "saved" && event.category !== sidebarFilter)
          return false;
        if (mapPill === "freeFood" && event.category !== "Free Food") return false;
        if (categoryFilter !== "all" && event.category !== categoryFilter) return false;
        if (dateFilter === "today" && !event.dateLabel.startsWith("Today")) return false;
        return true;
      }),
    [events, query, sidebarFilter, saved, mapPill, categoryFilter, dateFilter],
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
    (draft: EventDraft): CampusEvent | null => {
      if (!draft.point) return null;
      const style = CATEGORY_STYLE[draft.category];
      const event: CampusEvent = {
        id: `temp-${Date.now()}`,
        title: draft.title.trim(),
        category: draft.category,
        locationName: draft.locationName.trim() || "Pinned location",
        address: draft.locationName.trim() || "Pinned on the campus map",
        description: draft.description.trim() || "No description provided.",
        mapX: draft.point.x,
        mapY: draft.point.y,
        distance: "On campus",
        timeStatus: timeStatusFor(draft.startTime, draft.endTime),
        startTime: formatClock(draft.startTime),
        endTime: formatClock(draft.endTime),
        dateLabel: todayLabel(),
        goingCount: 0,
        interestedCount: 0,
        host: "You",
        markerColor: style.markerColor,
        iconType: style.iconType,
        isTemporary: true,
      };
      addCreatedEvent(event);
      setSelectedId(event.id);
      setDrawerOpen(true);
      syncUrl(event);
      return event;
    },
    [addCreatedEvent],
  );

  const clearFilters = useCallback(() => {
    setQuery("");
    setSidebarFilter("all");
    setMapPill("trending");
    setCategoryFilter("all");
    setDateFilter("today");
  }, []);

  return {
    events,
    clearFilters,
    visibleEvents,
    selectedEvent,
    drawerOpen,
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
    createEvent,
    toast,
    showToast,
    dismissToast: () => setToast(null),
  };
}

export type CampusState = ReturnType<typeof useCampusState>;
