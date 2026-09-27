"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createLocalEventsBackend,
  createSupabaseEventsBackend,
  rowToEvent,
  type EventChange,
  type EventRow,
  type EventsBackend,
  type NewEventRow,
} from "./events-backend";
import { getSupabase } from "./supabase/client";
import { useAccount } from "@/components/account/AccountProvider";
import { OFFICIAL_EVENTS } from "@/data/mock-events";
import type { CampusEvent } from "@/types/event";

interface UserEventsValue {
  /** Official listings plus every student-posted event. */
  events: CampusEvent[];
  /** False until the student events have loaded for the signed-in user. */
  ready: boolean;
  /** Set when loading student events failed (e.g. the table is missing). */
  loadError: string | null;
  /** Events posted by the signed-in user. */
  myEvents: CampusEvent[];
  /** True when the signed-in user may delete this event. */
  canDelete: (event: CampusEvent) => boolean;
  /** Resolves with the stored event, or a user-facing error message. */
  postEvent: (row: NewEventRow, photo?: File | null) => Promise<{ event: CampusEvent } | { error: string }>;
  /** Resolves with a user-facing error message, or null once deleted. */
  deleteEvent: (id: string) => Promise<string | null>;
  /** Called with events removed by someone else (e.g. deleted in another tab). */
  onRemoteDelete: (listener: (id: string) => void) => () => void;
  going: Set<string>;
  toggleGoing: (id: string) => void;
  saved: Set<string>;
  toggleSaved: (id: string) => void;
  /** Event to open when the map next mounts (e.g. picked from the profile page). */
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  /** Ask the map to open the Post Event form when it next mounts. */
  composeRequested: boolean;
  setComposeRequested: (value: boolean) => void;
}

const UserEventsContext = createContext<UserEventsValue | null>(null);

/**
 * Going / Saved are kept per account in this browser's localStorage.
 * backend/supabase/migrations also creates event_attendees / saved_events
 * for when those lists move to the database.
 */
const activityKey = (userId: string) => `campus-connect.activity.${userId}`;
const activityListeners = new Set<() => void>();

function subscribeActivity(listener: () => void) {
  activityListeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key?.startsWith("campus-connect.activity.") && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    activityListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

interface Activity {
  going: string[];
  saved: string[];
}

function parseActivity(raw: string | null): Activity {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return { going: Array.isArray(value?.going) ? value.going : [], saved: Array.isArray(value?.saved) ? value.saved : [] };
  } catch {
    return { going: [], saved: [] };
  }
}

function updateActivity(userId: string, update: (activity: Activity) => Activity) {
  const key = activityKey(userId);
  window.localStorage.setItem(key, JSON.stringify(update(parseActivity(window.localStorage.getItem(key)))));
  activityListeners.forEach((listener) => listener());
}

const toggledList = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function applyChange(rows: EventRow[], change: EventChange): EventRow[] {
  if (change.type === "delete") return rows.filter((row) => row.id !== change.id);
  if (change.type === "upsert") {
    const others = rows.filter((row) => row.id !== change.row.id);
    return [...others, change.row];
  }
  return rows;
}

export function UserEventsProvider({ children }: { children: React.ReactNode }) {
  const { user, mode } = useAccount();
  const userId = user?.id ?? null;
  const backend = useMemo<EventsBackend | null>(() => {
    if (typeof window === "undefined") return null;
    const supabase = getSupabase();
    return mode === "supabase" && supabase ? createSupabaseEventsBackend(supabase) : createLocalEventsBackend();
  }, [mode]);

  const [loaded, setLoaded] = useState<{ userId: string; rows: EventRow[]; error: string | null } | null>(null);
  const [remoteDeleteListeners] = useState(() => new Set<(id: string) => void>());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [composeRequested, setComposeRequested] = useState(false);

  useEffect(() => {
    if (!backend || !userId) return;
    let active = true;
    const reload = () =>
      backend.list().then(
        (rows) => active && setLoaded({ userId, rows, error: null }),
        (error: Error) => {
          console.warn("Could not load events:", error.message);
          if (active) setLoaded({ userId, rows: [], error: error.message });
        },
      );
    void reload();
    const unsubscribe = backend.subscribe((change) => {
      if (change.type === "reload") {
        void reload();
        return;
      }
      if (change.type === "delete") remoteDeleteListeners.forEach((listener) => listener(change.id));
      setLoaded((prev) => (prev && prev.userId === userId ? { ...prev, rows: applyChange(prev.rows, change) } : prev));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend, userId, remoteDeleteListeners]);

  const rows = loaded && loaded.userId === userId ? loaded.rows : null;

  const activityRaw = useSyncExternalStore(
    subscribeActivity,
    () => (userId ? window.localStorage.getItem(activityKey(userId)) : null),
    () => null,
  );

  const studentEvents = useMemo(() => {
    const now = new Date();
    return (rows ?? [])
      .map((row) => rowToEvent(row, now))
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  }, [rows]);

  const events = useMemo(() => {
    const ids = new Set(studentEvents.map((event) => event.id));
    return [...OFFICIAL_EVENTS, ...studentEvents].filter(
      (event) => event.source === "student" || !ids.has(event.id),
    );
  }, [studentEvents]);

  const activity = useMemo(() => {
    const parsed = parseActivity(activityRaw);
    return { going: new Set(parsed.going), saved: new Set(parsed.saved) };
  }, [activityRaw]);

  const canDelete = useCallback(
    (event: CampusEvent) => event.source === "student" && Boolean(userId) && event.createdBy === userId,
    [userId],
  );

  const postEvent = useCallback(
    async (row: NewEventRow, photo?: File | null) => {
      if (!backend || !userId) return { error: "You need to be signed in to post an event." };
      try {
        const stored = await backend.insert(row, photo);
        setLoaded((prev) =>
          prev && prev.userId === userId ? { ...prev, rows: applyChange(prev.rows, { type: "upsert", row: stored }) } : prev,
        );
        return { event: rowToEvent(stored) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Couldn't post the event. Please try again." };
      }
    },
    [backend, userId],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      if (!backend || !userId) return "You need to be signed in to delete an event.";
      try {
        await backend.remove(id);
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't delete the event. Please try again.";
      }
      setLoaded((prev) =>
        prev && prev.userId === userId ? { ...prev, rows: applyChange(prev.rows, { type: "delete", id }) } : prev,
      );
      updateActivity(userId, (a) => ({ going: a.going.filter((x) => x !== id), saved: a.saved.filter((x) => x !== id) }));
      return null;
    },
    [backend, userId],
  );

  const onRemoteDelete = useCallback(
    (listener: (id: string) => void) => {
      remoteDeleteListeners.add(listener);
      return () => {
        remoteDeleteListeners.delete(listener);
      };
    },
    [remoteDeleteListeners],
  );

  const toggleGoing = useCallback(
    (id: string) => userId && updateActivity(userId, (a) => ({ ...a, going: toggledList(a.going, id) })),
    [userId],
  );
  const toggleSaved = useCallback(
    (id: string) => userId && updateActivity(userId, (a) => ({ ...a, saved: toggledList(a.saved, id) })),
    [userId],
  );

  const value = useMemo<UserEventsValue>(() => {
    const known = new Set(events.map((event) => event.id));
    const onlyKnown = (ids: Set<string>) => new Set([...ids].filter((id) => known.has(id)));
    return {
      events,
      ready: rows !== null,
      loadError: loaded && loaded.userId === userId ? loaded.error : null,
      myEvents: studentEvents.filter((event) => event.createdBy === userId),
      canDelete,
      postEvent,
      deleteEvent,
      onRemoteDelete,
      going: onlyKnown(activity.going),
      toggleGoing,
      saved: onlyKnown(activity.saved),
      toggleSaved,
      focusId,
      setFocusId,
      composeRequested,
      setComposeRequested,
    };
  }, [
    events,
    rows,
    loaded,
    userId,
    studentEvents,
    canDelete,
    postEvent,
    deleteEvent,
    onRemoteDelete,
    activity,
    toggleGoing,
    toggleSaved,
    focusId,
    composeRequested,
  ]);

  return <UserEventsContext.Provider value={value}>{children}</UserEventsContext.Provider>;
}

export function useUserEvents(): UserEventsValue {
  const context = useContext(UserEventsContext);
  if (!context) throw new Error("useUserEvents must be used inside <UserEventsProvider>");
  return context;
}
