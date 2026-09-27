import type { SupabaseClient } from "@supabase/supabase-js";

/** A row of `public.notifications` (see backend/supabase/migrations). */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  event_id: string | null;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

/** What the client sends; the owner always comes from the session. */
export type NewNotification = Pick<NotificationRow, "type" | "title" | "body" | "event_id" | "dedupe_key" | "metadata">;

export type NotificationChange =
  | { type: "upsert"; row: NotificationRow }
  | { type: "delete"; id: string }
  | { type: "reload" };

export interface NotificationsBackend {
  list: () => Promise<NotificationRow[]>;
  /** Inserts rows whose dedupe_key is new for this user; returns only the ones created. */
  add: (rows: NewNotification[]) => Promise<NotificationRow[]>;
  markRead: (ids: string[]) => Promise<void>;
  subscribe: (onChange: (change: NotificationChange) => void) => () => void;
}

const LIST_LIMIT = 50;

export function createSupabaseNotificationsBackend(supabase: SupabaseClient, userId: string): NotificationsBackend {
  return {
    async list() {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []) as NotificationRow[];
    },
    async add(rows) {
      if (rows.length === 0) return [];
      // user_id defaults to auth.uid() in the database; RLS rejects any other owner.
      const { data, error } = await supabase
        .from("notifications")
        .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as NotificationRow[];
    },
    async markRead(ids) {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .is("read_at", null);
      if (error) throw new Error(error.message);
    },
    subscribe(onChange) {
      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as Partial<NotificationRow>).id;
              if (id) onChange({ type: "delete", id });
            } else {
              onChange({ type: "upsert", row: payload.new as NotificationRow });
            }
          },
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}

/**
 * Local preview stand-in: rows live in this browser's localStorage per account,
 * and other tabs hear about changes over a BroadcastChannel.
 */
export function createLocalNotificationsBackend(userId: string): NotificationsBackend {
  const key = `campus-connect.notifications.${userId}`;
  const channelName = `campus-connect.notifications.${userId}`;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(channelName) : null;
  const read = (): NotificationRow[] => {
    try {
      const rows = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const write = (rows: NotificationRow[]) => {
    window.localStorage.setItem(key, JSON.stringify(rows.slice(0, LIST_LIMIT)));
    channel?.postMessage({ type: "reload" } satisfies NotificationChange);
  };

  return {
    async list() {
      return read();
    },
    async add(rows) {
      const existing = read();
      const seen = new Set(existing.map((row) => row.dedupe_key));
      const created: NotificationRow[] = rows
        .filter((row) => !seen.has(row.dedupe_key))
        .map((row) => ({
          ...row,
          id: crypto.randomUUID(),
          user_id: userId,
          read_at: null,
          created_at: new Date().toISOString(),
        }));
      if (created.length > 0) write([...created, ...existing]);
      return created;
    },
    async markRead(ids) {
      const wanted = new Set(ids);
      const now = new Date().toISOString();
      write(read().map((row) => (wanted.has(row.id) && !row.read_at ? { ...row, read_at: now } : row)));
    },
    subscribe(onChange) {
      const listener = channel ? new BroadcastChannel(channelName) : null;
      const onMessage = (e: MessageEvent<NotificationChange>) => onChange(e.data);
      const onStorage = (e: StorageEvent) => e.key === key && onChange({ type: "reload" });
      listener?.addEventListener("message", onMessage);
      window.addEventListener("storage", onStorage);
      return () => {
        listener?.close();
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

/** Session-only fallback when the notifications table hasn't been created yet. */
export function createMemoryNotificationsBackend(userId: string): NotificationsBackend {
  let rows: NotificationRow[] = [];
  return {
    async list() {
      return rows;
    },
    async add(next) {
      const seen = new Set(rows.map((row) => row.dedupe_key));
      const created = next
        .filter((row) => !seen.has(row.dedupe_key))
        .map((row) => ({ ...row, id: crypto.randomUUID(), user_id: userId, read_at: null, created_at: new Date().toISOString() }));
      rows = [...created, ...rows].slice(0, LIST_LIMIT);
      return created;
    },
    async markRead(ids) {
      const wanted = new Set(ids);
      const now = new Date().toISOString();
      rows = rows.map((row) => (wanted.has(row.id) && !row.read_at ? { ...row, read_at: now } : row));
    },
    subscribe() {
      return () => undefined;
    },
  };
}
