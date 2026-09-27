"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  createLocalNotificationsBackend,
  createMemoryNotificationsBackend,
  createSupabaseNotificationsBackend,
  type NotificationChange,
  type NotificationRow,
  type NotificationsBackend,
} from "./notifications-backend";
import { smartNotifications } from "./smart-notifications";
import { getSupabase } from "./supabase/client";
import { useUserEvents } from "./user-events";
import { useAccount } from "@/components/account/AccountProvider";
import type { EventCategory } from "@/types/event";

/** Re-evaluate time-based conditions (starts soon, starting now) once a minute. */
const TICK_MS = 60_000;

interface NotificationsValue {
  notifications: NotificationRow[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Where notifications are kept: the database, this browser, or this session only. */
  storage: "database" | "browser" | "session";
  /** Current time, refreshed every minute so relative labels stay honest. */
  now: number;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

interface Loaded {
  userId: string;
  backend: NotificationsBackend;
  storage: NotificationsValue["storage"];
  rows: NotificationRow[];
}

function applyChange(rows: NotificationRow[], change: NotificationChange): NotificationRow[] {
  if (change.type === "delete") return rows.filter((row) => row.id !== change.id);
  if (change.type === "upsert") return [change.row, ...rows.filter((row) => row.id !== change.row.id)];
  return rows;
}

/**
 * The signed-in user's notifications. Rows are stored per user (Supabase when
 * configured) and synced to their other devices in realtime; new ones are
 * derived from the same event data the map uses.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, mode } = useAccount();
  const userId = user?.id ?? null;
  const { events, ready, going, saved, myEvents } = useUserEvents();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let unsubscribe = () => {};
    attempted.current = new Set();

    const start = async (backend: NotificationsBackend, storage: Loaded["storage"]) => {
      const rows = await backend.list();
      if (!active) return;
      setLoaded({ userId, backend, storage, rows });
      unsubscribe = backend.subscribe((change) => {
        if (change.type === "reload") {
          void backend.list().then((next) => {
            if (active) setLoaded((prev) => (prev?.userId === userId ? { ...prev, rows: next } : prev));
          });
          return;
        }
        setLoaded((prev) => (prev?.userId === userId ? { ...prev, rows: applyChange(prev.rows, change) } : prev));
      });
    };

    const supabase = mode === "supabase" ? getSupabase() : null;
    const primary = supabase
      ? start(createSupabaseNotificationsBackend(supabase, userId), "database")
      : start(createLocalNotificationsBackend(userId), "browser");
    primary.catch((error: Error) => {
      console.warn("Notifications aren't being saved:", error.message);
      if (active) void start(createMemoryNotificationsBackend(userId), "session");
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, mode]);

  const current = loaded && loaded.userId === userId ? loaded : null;

  // Derive new notifications from live data; dedupe_key keeps each one to a single row per user.
  useEffect(() => {
    if (!current || !ready || !userId) return;
    const interests = new Set<EventCategory>();
    for (const event of [...events.filter((e) => going.has(e.id) || saved.has(e.id)), ...myEvents])
      interests.add(event.category);
    const known = new Set(current.rows.map((row) => row.dedupe_key));
    const fresh = smartNotifications({ events, going, saved, userId, interests, now }).filter(
      (row) => !known.has(row.dedupe_key) && !attempted.current.has(row.dedupe_key),
    );
    if (fresh.length === 0) return;
    fresh.forEach((row) => attempted.current.add(row.dedupe_key));
    const { backend } = current;
    backend.add(fresh).then(
      (created) => {
        if (created.length === 0) return;
        setLoaded((prev) => {
          if (prev?.userId !== userId) return prev;
          const ids = new Set(prev.rows.map((row) => row.id));
          return { ...prev, rows: [...created.filter((row) => !ids.has(row.id)), ...prev.rows] };
        });
      },
      (error: Error) => console.warn("Couldn't save notifications:", error.message),
    );
  }, [current, ready, userId, events, going, saved, myEvents, now]);

  const markRead = useCallback(
    (id: string) => {
      if (!current) return;
      const stamp = new Date().toISOString();
      setLoaded((prev) =>
        prev ? { ...prev, rows: prev.rows.map((row) => (row.id === id && !row.read_at ? { ...row, read_at: stamp } : row)) } : prev,
      );
      current.backend.markRead([id]).catch((error: Error) => console.warn("Couldn't mark read:", error.message));
    },
    [current],
  );

  const markAllRead = useCallback(() => {
    if (!current) return;
    const ids = current.rows.filter((row) => !row.read_at).map((row) => row.id);
    if (ids.length === 0) return;
    const stamp = new Date().toISOString();
    setLoaded((prev) => (prev ? { ...prev, rows: prev.rows.map((row) => (row.read_at ? row : { ...row, read_at: stamp })) } : prev));
    current.backend.markRead(ids).catch((error: Error) => console.warn("Couldn't mark all read:", error.message));
  }, [current]);

  const value = useMemo<NotificationsValue>(() => {
    const rows = current?.rows ?? [];
    return {
      notifications: rows,
      unreadCount: rows.filter((row) => !row.read_at).length,
      markRead,
      markAllRead,
      storage: current?.storage ?? (mode === "supabase" ? "database" : "browser"),
      now,
    };
  }, [current, markRead, markAllRead, mode, now]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return context;
}
