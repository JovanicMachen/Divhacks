"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { MOCK_EVENTS } from "@/data/mock-events";
import type { CampusEvent } from "@/types/event";

interface UserEventsValue {
  /** Built-in events plus anything posted this session. */
  events: CampusEvent[];
  createdEvents: CampusEvent[];
  addCreatedEvent: (event: CampusEvent) => void;
  going: Set<string>;
  toggleGoing: (id: string) => void;
  saved: Set<string>;
  toggleSaved: (id: string) => void;
  /** Event to open when the map next mounts (e.g. picked from the profile page). */
  focusId: string | null;
  setFocusId: (id: string | null) => void;
}

const UserEventsContext = createContext<UserEventsValue | null>(null);

const toggled = (prev: Set<string>, id: string) => {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/**
 * The user's own event activity, kept above the routes so the map and the
 * profile page share it. Memory only: it resets on refresh by design.
 */
export function UserEventsProvider({ children }: { children: React.ReactNode }) {
  const [createdEvents, setCreatedEvents] = useState<CampusEvent[]>([]);
  const [going, setGoing] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const addCreatedEvent = useCallback((event: CampusEvent) => setCreatedEvents((prev) => [...prev, event]), []);
  const toggleGoing = useCallback((id: string) => setGoing((prev) => toggled(prev, id)), []);
  const toggleSaved = useCallback((id: string) => setSaved((prev) => toggled(prev, id)), []);

  const value = useMemo(
    () => ({
      events: [...MOCK_EVENTS, ...createdEvents],
      createdEvents,
      addCreatedEvent,
      going,
      toggleGoing,
      saved,
      toggleSaved,
      focusId,
      setFocusId,
    }),
    [createdEvents, addCreatedEvent, going, toggleGoing, saved, toggleSaved, focusId],
  );

  return <UserEventsContext.Provider value={value}>{children}</UserEventsContext.Provider>;
}

export function useUserEvents(): UserEventsValue {
  const context = useContext(UserEventsContext);
  if (!context) throw new Error("useUserEvents must be used inside <UserEventsProvider>");
  return context;
}
