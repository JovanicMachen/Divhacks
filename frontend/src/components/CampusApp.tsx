"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";

import { CreateEventModal } from "@/components/events/CreateEventModal";
import { EventDrawer } from "@/components/events/EventDrawer";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";
import {
  CampusMapPlaceholder,
  type MapViewHandle,
} from "@/components/map/CampusMapPlaceholder";
import { CampusStats } from "@/components/map/CampusStats";
import { MapEmptyState } from "@/components/map/MapEmptyState";
import { MapFilters } from "@/components/map/MapFilters";
import { MapToast } from "@/components/map/MapToast";
import { PickLocationBanner } from "@/components/map/PickLocationBanner";
import { DEFAULT_USER_LOCATION } from "@/data/mock-events";
import { CATEGORY_STYLE } from "@/lib/constants";
import { geoToMap, isOnMap } from "@/lib/geo";
import { eventPath, useCampusState } from "@/lib/use-campus-state";
import { useGeolocation, type GeoStatus } from "@/lib/use-geolocation";
import { useMediaQuery } from "@/lib/use-media-query";
import type { CampusEvent, EventDraft, MapPill } from "@/types/event";

const pad = (n: number) => String(n).padStart(2, "0");

/** Fresh form: starts at the next half hour, runs for an hour. */
function emptyDraft(now = new Date()): EventDraft {
  const start = new Date(now);
  start.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const endTime = end.getDate() !== start.getDate() ? "23:59" : `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return {
    title: "",
    description: "",
    category: "Social",
    locationName: "",
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endTime,
    point: null,
  };
}

const LOCATION_MESSAGES: Partial<Record<GeoStatus, string>> = {
  denied:
    "Location access is required for location-based features like Near Me. You can allow it in your browser settings.",
  unavailable: "Your location isn't available right now. Location-based features need it to work.",
};

/** Native share sheet when available, otherwise copy the event link. */
async function shareEvent(event: CampusEvent, notify: (message: string) => void) {
  const path = eventPath(event);
  if (!path) {
    notify(
      "Share links arrive once events are saved permanently — this one only exists in your current session.",
    );
    return;
  }
  const url = `${window.location.origin}${path}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: event.title, text: `${event.title} at ${event.locationName}`, url });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    notify("Event link copied to your clipboard.");
  } catch {
    notify(`Share this link: ${url}`);
  }
}

interface CampusAppProps {
  /** Pre-selected event, used by the /events/[id] route. */
  initialEventId?: string;
}

/** The full-screen Campus Connect shell, shared by `/` and `/events/[id]`. */
export function CampusApp({ initialEventId }: CampusAppProps) {
  const state = useCampusState(initialEventId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mapRef = useRef<MapViewHandle>(null);
  const geo = useGeolocation();
  const [composer, setComposer] = useState<"closed" | "form" | "picking">("closed");
  const [draft, setDraft] = useState<EventDraft>(() => emptyDraft());
  // The mobile bottom sheet would cover the map while choosing a spot.
  const isSheet = useMediaQuery("(max-width: 899px)");
  const showDrawer = state.drawerOpen && !(isSheet && composer === "picking");

  const openComposer = () => {
    setSidebarOpen(false);
    if (!draft.title && !draft.point) setDraft(emptyDraft());
    setComposer("form");
  };

  const submitDraft = () => {
    const created = state.createEvent(draft);
    if (!created) return;
    setComposer("closed");
    setDraft(emptyDraft());
    mapRef.current?.centerOn({ x: created.mapX, y: created.mapY });
    state.showToast("Your event is on the map for this session. It will disappear when you refresh.");
  };

  useEffect(() => {
    if (composer !== "picking") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setComposer("form");
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [composer]);

  // Projected every render so the dot follows watchPosition updates.
  const userPoint = geo.position ? geoToMap(geo.position) : null;
  const userOnMap = userPoint && isOnMap(userPoint) ? userPoint : null;

  /** Centres on the user, asking for permission on first use. */
  const locateUser = async (): Promise<boolean> => {
    const result = await geo.request();
    if (!result.position) {
      const message = LOCATION_MESSAGES[result.status];
      if (message) state.showToast(message);
      return false;
    }
    const point = geoToMap(result.position);
    if (!isOnMap(point)) {
      state.showToast("You're outside the campus map area, so you can't be shown on it yet.");
      return false;
    }
    mapRef.current?.centerOn(point, 1.8);
    return true;
  };

  const handleLocateButton = async () => {
    const located = await locateUser();
    if (!located) mapRef.current?.reset();
  };

  const handlePill = async (pill: MapPill) => {
    if (pill === "nearMe") {
      if (await locateUser()) state.setMapPill("nearMe");
      return;
    }
    state.setMapPill(pill === state.mapPill && pill !== "trending" ? "trending" : pill);
  };

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-canvas">
      <TopNavbar
        onOpenSidebar={() => setSidebarOpen(true)}
        query={state.query}
        onQueryChange={state.setQuery}
        results={state.visibleEvents}
        onSelectResult={(event) => {
          state.selectEvent(event.id);
          mapRef.current?.centerOn({ x: event.mapX, y: event.mapY });
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          selected={state.sidebarFilter}
          onSelect={(filter) => {
            state.setSidebarFilter(filter);
            setSidebarOpen(false);
          }}
          savedCount={state.saved.size}
          onPostEvent={openComposer}
        />

        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-[72px] z-[55] bg-ink/25 tablet:hidden"
          />
        )}

        <main className="relative min-w-0 flex-1" aria-label="Campus map">
          <CampusMapPlaceholder
            viewRef={mapRef}
            events={state.visibleEvents}
            selectedEventId={state.drawerOpen ? state.selectedEvent.id : null}
            onSelectEvent={state.selectEvent}
            userPoint={userOnMap ?? DEFAULT_USER_LOCATION}
            onLocate={handleLocateButton}
            locating={geo.status === "requesting"}
            located={Boolean(userOnMap)}
            onPickPoint={
              composer === "picking"
                ? (point) => {
                    setDraft((d) => ({ ...d, point }));
                    setComposer("form");
                  }
                : undefined
            }
            draftPin={
              composer !== "closed" && draft.point
                ? { ...draft.point, ...CATEGORY_STYLE[draft.category] }
                : null
            }
          />
          <PickLocationBanner visible={composer === "picking"} onCancel={() => setComposer("form")} />
          {composer !== "picking" && (
          <MapFilters
            activePill={state.mapPill}
            onPillClick={handlePill}
            locating={geo.status === "requesting"}
            dateFilter={state.dateFilter}
            onDateChange={state.setDateFilter}
            categoryFilter={state.categoryFilter}
            onCategoryChange={state.setCategoryFilter}
          />
          )}
          <CampusStats />
          <MapEmptyState
            visible={state.visibleEvents.length === 0}
            message={
              state.sidebarFilter === "saved" && !state.query
                ? "You haven't saved any events yet — use the bookmark on an event."
                : "No events match your search and filters."
            }
            onReset={state.clearFilters}
          />
          <MapToast toast={state.toast} onDismiss={state.dismissToast} />
        </main>

        <CreateEventModal
          open={composer === "form"}
          draft={draft}
          onChange={setDraft}
          onClose={() => setComposer("closed")}
          onChooseOnMap={() => setComposer("picking")}
          onSubmit={submitDraft}
        />

        <AnimatePresence initial={false}>
          {showDrawer && (
            <EventDrawer
              event={state.selectedEvent}
              onClose={state.closeDrawer}
              isGoing={state.going.has(state.selectedEvent.id)}
              onToggleGoing={() => state.toggleGoing(state.selectedEvent.id)}
              isSaved={state.saved.has(state.selectedEvent.id)}
              onToggleSaved={() => state.toggleSaved(state.selectedEvent.id)}
              onShare={() => shareEvent(state.selectedEvent, state.showToast)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
