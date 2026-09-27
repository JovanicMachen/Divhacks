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
import { requestAdminAction, type AdminAction } from "./demo-codes";
import { useLifecycleNow } from "./event-clock";
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
  /** Cancels the owner's event without deleting it. Resolves with an error message, or null. */
  cancelEvent: (id: string) => Promise<string | null>;
  /** Pins (or with null, unpins) an organizer message in the event chat. */
  pinMessage: (eventId: string, messageId: string | null) => Promise<string | null>;
  /** Rallies the signed-in user has joined, including ones they started. */
  joinedRallies: Set<string>;
  /** Resolves with an error message, or null once joined. */
  joinRally: (id: string) => Promise<string | null>;
  /** Temporary demo admin override; the server checks the code. */
  adminEventAction: (id: string, action: AdminAction, code: string) => Promise<string | null>;
  /** Called with events removed by someone else (e.g. deleted in another tab). */
  onRemoteDelete: (listener: (id: string) => void) => () => void;
  /** Called once per browser session for each new Rally someone else starts. */
  onNewRally: (listener: (event: CampusEvent) => void) => () => void;
  going: Set<string>;
  /** Marks or unmarks Going. Resolves with an error message, or null once saved. */
  toggleGoing: (id: string) => Promise<string | null>;
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

const SEEN_RALLIES_KEY = "campus-connect.seen-rallies";

/** Rally ids this tab session has already announced (or that existed on load). */
function markRalliesSeen(ids: string[]): string[] {
  let seen: string[] = [];
  try {
    seen = JSON.parse(window.sessionStorage.getItem(SEEN_RALLIES_KEY) ?? "[]");
  } catch {
    seen = [];
  }
  const fresh = ids.filter((id) => !seen.includes(id));
  if (fresh.length) window.sessionStorage.setItem(SEEN_RALLIES_KEY, JSON.stringify([...seen, ...fresh].slice(-200)));
  return fresh;
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
  const [newRallyListeners] = useState(() => new Set<(event: CampusEvent) => void>());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [composeRequested, setComposeRequested] = useState(false);

  useEffect(() => {
    if (!backend || !userId) return;
    let active = true;
    // Rallies already on the map when this tab opens aren't announced; later ones are, once.
    let first = true;
    const announce = (rows: EventRow[]) => {
      const candidates = rows.filter(
        (row) => row.event_type === "rally" && row.rally_status === "forming" && row.created_by !== userId,
      );
      const fresh = new Set(markRalliesSeen(candidates.map((row) => row.id)));
      candidates
        .filter((row) => fresh.has(row.id))
        .forEach((row) => {
          const event = rowToEvent(row);
          newRallyListeners.forEach((listener) => listener(event));
        });
    };
    const reload = () =>
      backend.list().then(
        (rows) => {
          if (!active) return;
          if (first) markRalliesSeen(rows.filter((row) => row.event_type === "rally").map((row) => row.id));
          else announce(rows);
          first = false;
          setLoaded({ userId, rows, error: null });
        },
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
      if (change.type === "upsert") announce([change.row]);
      setLoaded((prev) => (prev && prev.userId === userId ? { ...prev, rows: applyChange(prev.rows, change) } : prev));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend, userId, remoteDeleteListeners, newRallyListeners]);

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

  // When a forming Rally's window closes, ask the database to mark it expired so
  // every device gets the change. Every client already hides it at that moment.
  const lifecycleNow = useLifecycleNow(studentEvents);
  useEffect(() => {
    if (!backend || !userId || lifecycleNow === 0) return;
    const due = studentEvents.some(
      (event) => event.rally?.status === "forming" && Date.parse(event.rally.expiresAt) <= lifecycleNow,
    );
    if (due) void backend.expireRallies();
  }, [backend, userId, studentEvents, lifecycleNow]);

  const activity = useMemo(() => {
    const parsed = parseActivity(activityRaw);
    return { going: new Set(parsed.going), saved: new Set(parsed.saved) };
  }, [activityRaw]);

  const canDelete = useCallback(
    (event: CampusEvent) => event.source === "student" && Boolean(userId) && event.createdBy === userId,
    [userId],
  );

  const [joined, setJoined] = useState<{ userId: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!backend || !userId) return;
    let active = true;
    void backend.myRallies().then((ids) => active && setJoined({ userId, ids: new Set(ids) }));
    return () => {
      active = false;
    };
  }, [backend, userId]);

  const postEvent = useCallback(
    async (row: NewEventRow, photo?: File | null) => {
      if (!backend || !userId) return { error: "You need to be signed in to post an event." };
      try {
        const stored = await backend.insert(row, photo);
        // The database adds a Rally's creator as its first participant.
        if (stored.event_type === "rally")
          setJoined((prev) => ({
            userId,
            ids: new Set([...(prev && prev.userId === userId ? prev.ids : []), stored.id]),
          }));
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

  const storeRow = useCallback(
    (row: EventRow) =>
      setLoaded((prev) =>
        prev && prev.userId === userId ? { ...prev, rows: applyChange(prev.rows, { type: "upsert", row }) } : prev,
      ),
    [userId],
  );

  const cancelEvent = useCallback(
    async (id: string) => {
      if (!backend || !userId) return "You need to be signed in to cancel an event.";
      try {
        storeRow(await backend.cancel(id));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't cancel the event. Please try again.";
      }
    },
    [backend, userId, storeRow],
  );

  const pinMessage = useCallback(
    async (eventId: string, messageId: string | null) => {
      if (!backend || !userId) return "You need to be signed in.";
      try {
        storeRow(await backend.setPinned(eventId, messageId));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't update the pinned message.";
      }
    },
    [backend, userId, storeRow],
  );

  const joinedRallies = useMemo(
    () => (joined && joined.userId === userId ? joined.ids : new Set<string>()),
    [joined, userId],
  );

  const joinRally = useCallback(
    async (id: string) => {
      if (!backend || !userId) return "You need to be signed in to join a Rally.";
      try {
        storeRow(await backend.joinRally(id));
        setJoined((prev) => ({
          userId,
          ids: new Set([...(prev && prev.userId === userId ? prev.ids : []), id]),
        }));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't join the Rally. Please try again.";
      }
    },
    [backend, userId, storeRow],
  );

  const adminEventAction = useCallback(
    async (id: string, action: AdminAction, code: string) => {
      if (!backend || !userId) return "You need to be signed in.";
      const result = await requestAdminAction(id, action, code, mode === "supabase" ? getSupabase() : null);
      if ("error" in result) return result.error;
      try {
        if (result.mode === "local" && backend.adminApply) {
          const row = await backend.adminApply(id, action);
          if (row) storeRow(row);
        } else if (result.row) {
          storeRow(result.row as EventRow);
        }
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't apply the admin action.";
      }
      if (action === "delete") {
        setLoaded((prev) =>
          prev && prev.userId === userId ? { ...prev, rows: applyChange(prev.rows, { type: "delete", id }) } : prev,
        );
      }
      return null;
    },
    [backend, userId, mode, storeRow],
  );

  const onNewRally = useCallback(
    (listener: (event: CampusEvent) => void) => {
      newRallyListeners.add(listener);
      return () => {
        newRallyListeners.delete(listener);
      };
    },
    [newRallyListeners],
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

  const cancelledIds = useMemo(
    () => new Set(studentEvents.filter((event) => event.status === "abandoned").map((event) => event.id)),
    [studentEvents],
  );
  // With Supabase, Going lives in event_going so the database can check it
  // (event chat requires it). This browser keeps a copy for local preview.
  const [remoteGoing, setRemoteGoing] = useState<{ userId: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!backend || !userId) return;
    let active = true;
    void backend.listGoing().then(async (ids) => {
      if (!active || ids === null) return;
      // Carry over Going marked in this browser before it moved to the database.
      const stored = new Set(ids);
      const local = parseActivity(window.localStorage.getItem(activityKey(userId))).going.filter((id) => !stored.has(id));
      for (const id of local) {
        await backend.setGoing(id, true).then(
          () => stored.add(id),
          () => undefined,
        );
      }
      if (active) setRemoteGoing({ userId, ids: stored });
    });
    return () => {
      active = false;
    };
  }, [backend, userId]);
  const remote = remoteGoing && remoteGoing.userId === userId ? remoteGoing : null;

  // A cancelled event takes no new Going; someone already going can still leave it.
  const toggleGoing = useCallback(
    async (id: string): Promise<string | null> => {
      if (!backend || !userId) return "You need to be signed in.";
      const current = remote ? remote.ids.has(id) : parseActivity(window.localStorage.getItem(activityKey(userId))).going.includes(id);
      if (!current && cancelledIds.has(id)) return "This event was cancelled.";
      const next = !current;
      const apply = (on: boolean) =>
        setRemoteGoing((prev) => {
          if (!prev || prev.userId !== userId) return prev;
          const ids = new Set(prev.ids);
          if (on) ids.add(id);
          else ids.delete(id);
          return { userId, ids };
        });
      if (remote) {
        apply(next);
        try {
          await backend.setGoing(id, next);
        } catch (error) {
          apply(current);
          return error instanceof Error ? error.message : "Couldn't update Going. Please try again.";
        }
      }
      updateActivity(userId, (a) => ({
        ...a,
        going: next ? [...a.going.filter((x) => x !== id), id] : a.going.filter((x) => x !== id),
      }));
      return null;
    },
    [backend, userId, remote, cancelledIds],
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
      cancelEvent,
      pinMessage,
      joinedRallies,
      joinRally,
      adminEventAction,
      onRemoteDelete,
      onNewRally,
      going: onlyKnown(remote ? remote.ids : activity.going),
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
    cancelEvent,
    pinMessage,
    joinedRallies,
    joinRally,
    adminEventAction,
    onRemoteDelete,
    onNewRally,
    activity,
    remote,
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
