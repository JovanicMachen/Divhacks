"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";

import { useAccount } from "@/components/account/AccountProvider";
import { CreateEventModal } from "@/components/events/CreateEventModal";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
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
import { nearestCampusLocation } from "@/data/campus-locations";
import { CATEGORY_STYLE } from "@/lib/constants";
import { geoToMap, isOnMap } from "@/lib/geo";
import { eventPath, eventPoint, useCampusState } from "@/lib/use-campus-state";
import { useGeolocation, type GeoStatus } from "@/lib/use-geolocation";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUserEvents } from "@/lib/user-events";
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
    locationId: null,
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
  const url = `${window.location.origin}${eventPath(event)}`;
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
  const { mode, displayName } = useAccount();
  const { canDelete, composeRequested, setComposeRequested } = useUserEvents();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mapRef = useRef<MapViewHandle>(null);
  const geo = useGeolocation();
  const [composer, setComposer] = useState<"closed" | "form" | "picking">(() =>
    composeRequested ? "form" : "closed",
  );
  const [draft, setDraft] = useState<EventDraft>(() => emptyDraft());
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CampusEvent | null>(null);
  // The mobile bottom sheet would cover the map while choosing a spot.
  const isSheet = useMediaQuery("(max-width: 899px)");
  const selected = state.selectedEvent;
  const showDrawer = state.drawerOpen && !(isSheet && composer === "picking");

  useEffect(() => {
    if (composeRequested) setComposeRequested(false);
  }, [composeRequested, setComposeRequested]);

  /** Moves the map to an event's pin, when it has one. */
  const focusEvent = (event: CampusEvent) => {
    const point = eventPoint(event);
    if (point) mapRef.current?.centerOn(point);
  };

  // Deep links and picks from the profile page fly to the event once it has loaded.
  const focusedRequest = useRef(false);
  const requested = state.requestedId && selected?.id === state.requestedId ? selected : null;
  useEffect(() => {
    if (!requested || focusedRequest.current) return;
    focusedRequest.current = true;
    const point = eventPoint(requested);
    if (point) mapRef.current?.centerOn(point);
  }, [requested]);

  const openComposer = () => {
    setSidebarOpen(false);
    if (!draft.title && !draft.point) setDraft(emptyDraft());
    setPostError(null);
    setComposer("form");
  };

  const submitDraft = async () => {
    setPosting(true);
    setPostError(null);
    const result = await state.createEvent(draft, displayName);
    setPosting(false);
    if ("error" in result) {
      setPostError(result.error);
      return;
    }
    setComposer("closed");
    setDraft(emptyDraft());
    focusEvent(result.event);
    state.showToast(
      mode === "supabase"
        ? "Your event is posted. Everyone on Campus Connect can see it now."
        : "Your event is posted. Local preview: it's saved in this browser only.",
    );
  };

  const confirmDelete = async (): Promise<string | null> => {
    if (!deleting) return null;
    const error = await state.deleteEvent(deleting.id);
    if (error) return error;
    setDeleting(null);
    state.showToast("Event deleted.");
    return null;
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
      state.showToast("You're outside the current Campus Connect map area.");
      return false;
    }
    mapRef.current?.centerOn(point, 1.5);
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
          focusEvent(event);
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
            selectedEventId={state.drawerOpen && selected ? selected.id : null}
            onSelectEvent={state.selectEvent}
            userPoint={userOnMap}
            onLocate={handleLocateButton}
            locating={geo.status === "requesting"}
            located={Boolean(userOnMap)}
            onPickPoint={
              composer === "picking"
                ? (point) => {
                    const place = nearestCampusLocation(point, 25);
                    setDraft((d) => ({
                      ...d,
                      point,
                      locationId: place?.id ?? null,
                      locationName: place ? place.name : d.locationId ? "" : d.locationName,
                    }));
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
          <CampusStats happeningNow={state.stats.happeningNow} freeFood={state.stats.freeFood} />
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
          submitting={posting}
          submitError={postError}
          localPreview={mode === "local"}
        />

        <DeleteEventDialog event={deleting} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />

        <AnimatePresence initial={false}>
          {showDrawer && selected && (
            <EventDrawer
              event={selected}
              onClose={state.closeDrawer}
              isGoing={state.going.has(selected.id)}
              onToggleGoing={() => state.toggleGoing(selected.id)}
              isSaved={state.saved.has(selected.id)}
              onToggleSaved={() => state.toggleSaved(selected.id)}
              onShare={() => shareEvent(selected, state.showToast)}
              onDelete={canDelete(selected) ? () => setDeleting(selected) : undefined}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
