import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { CATEGORY_STYLE } from "./constants";
import { localAccountStore } from "./local-account";
import { formatClock, humanizeMinutes, todayLabel } from "./utils";
import { getCampusLocation } from "@/data/campus-locations";
import type { CampusEvent, EventCategory, EventSource } from "@/types/event";

/** A row of `public.events` (see backend/supabase/migrations). */
export interface EventRow {
  id: string;
  created_by: string;
  source: EventSource;
  title: string;
  category: EventCategory;
  description: string;
  location_name: string;
  location_id: string | null;
  map_x: number | null;
  map_y: number | null;
  lat: number | null;
  lng: number | null;
  host_name: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

/** What the client sends; the owner and source are never taken from here. */
export type NewEventRow = Omit<EventRow, "id" | "created_by" | "source" | "created_at">;

export type EventChange = { type: "upsert"; row: EventRow } | { type: "delete"; id: string } | { type: "reload" };

export interface EventsBackend {
  list: () => Promise<EventRow[]>;
  /** Resolves with the stored row; rejects with a user-facing message. */
  insert: (row: NewEventRow) => Promise<EventRow>;
  /** Rejects when nothing was deleted (not the owner, or already gone). */
  remove: (id: string) => Promise<void>;
  subscribe: (onChange: (change: EventChange) => void) => () => void;
}

const NETWORK_ERROR = "Couldn't reach Campus Connect's servers. Check your connection and try again.";

function describe(error: PostgrestError | { message: string; code?: string }, action: string): Error {
  const message = error.message ?? "";
  if (/failed to fetch|network|load failed/i.test(message)) return new Error(NETWORK_ERROR);
  if (error.code === "42P01" || error.code === "PGRST205" || /could not find the table|does not exist/i.test(message))
    return new Error("The events table doesn't exist yet. Run backend/supabase/migrations in the Supabase SQL editor first.");
  if (error.code === "42501" || /row-level security/i.test(message))
    return new Error(`You don't have permission to ${action} this event.`);
  return new Error(message || `Couldn't ${action} the event. Please try again.`);
}

export function createSupabaseEventsBackend(supabase: SupabaseClient): EventsBackend {
  return {
    async list() {
      const { data, error } = await supabase.from("events").select("*").order("starts_at", { ascending: true });
      if (error) throw describe(error, "load");
      return (data ?? []) as EventRow[];
    },
    async insert(row) {
      // created_by defaults to auth.uid() in the database, and RLS rejects any
      // row whose owner isn't the caller, so it is deliberately not sent.
      const { data, error } = await supabase
        .from("events")
        .insert({ ...row, source: "student" })
        .select("*")
        .single();
      if (error) throw describe(error, "post");
      return data as EventRow;
    },
    async remove(id) {
      const { data, error } = await supabase.from("events").delete().eq("id", id).select("id");
      if (error) throw describe(error, "delete");
      // RLS silently filters rows the caller doesn't own, so zero rows means "not yours".
      if (!data || data.length === 0) throw new Error("This event couldn't be deleted. Only its host can delete it.");
    },
    subscribe(onChange) {
      const channel = supabase
        .channel("events")
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<EventRow>).id;
            if (id) onChange({ type: "delete", id });
          } else {
            onChange({ type: "upsert", row: payload.new as EventRow });
          }
        })
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}

const LOCAL_KEY = "campus-connect.local-events";
const CHANNEL = "campus-connect.events";

function readLocal(): EventRow[] {
  try {
    const rows = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Local preview stand-in for the events table: rows live in this browser's
 * localStorage and other tabs hear about changes over a BroadcastChannel.
 * It applies the same rules as the RLS policies — the owner is always the
 * signed-in local user, and only that user can delete their own rows.
 */
export function createLocalEventsBackend(): EventsBackend {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
  const write = (rows: EventRow[], change: EventChange) => {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
    } catch {
      throw new Error("This browser couldn't save the change. Check that site storage is allowed and try again.");
    }
    channel?.postMessage(change);
  };
  const currentUserId = () => localAccountStore.getSnapshot()?.user.id ?? null;

  return {
    async list() {
      return readLocal();
    },
    async insert(row) {
      const owner = currentUserId();
      if (!owner) throw new Error("You need to be signed in to post an event.");
      const stored: EventRow = {
        ...row,
        id: crypto.randomUUID(),
        created_by: owner,
        source: "student",
        created_at: new Date().toISOString(),
      };
      write([...readLocal(), stored], { type: "upsert", row: stored });
      return stored;
    },
    async remove(id) {
      const rows = readLocal();
      const target = rows.find((row) => row.id === id);
      if (!target || target.source !== "student" || target.created_by !== currentUserId())
        throw new Error("This event couldn't be deleted. Only its host can delete it.");
      write(
        rows.filter((row) => row.id !== id),
        { type: "delete", id },
      );
    },
    subscribe(onChange) {
      const listener = channel ? new BroadcastChannel(CHANNEL) : null;
      const onMessage = (e: MessageEvent<EventChange>) => onChange(e.data);
      const onStorage = (e: StorageEvent) => e.key === LOCAL_KEY && onChange({ type: "reload" });
      listener?.addEventListener("message", onMessage);
      window.addEventListener("storage", onStorage);
      return () => {
        listener?.close();
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const clock = (d: Date) => formatClock(`${d.getHours()}:${d.getMinutes()}`);

function statusFor(start: Date, end: Date, now: Date): string {
  const minutes = (to: Date) => Math.max(1, Math.round((to.getTime() - now.getTime()) / 60_000));
  if (now < start) {
    return sameDay(start, now) || minutes(start) < 12 * 60
      ? `Starts in ${humanizeMinutes(minutes(start))}`
      : `Starts ${start.toLocaleDateString("en-US", { weekday: "short" })}`;
  }
  if (now < end) return `Ends in ${humanizeMinutes(minutes(end))}`;
  return "Ended";
}

/** A stored student event, shaped for the map, drawer and lists. */
export function rowToEvent(row: EventRow, now: Date = new Date()): CampusEvent {
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const place = getCampusLocation(row.location_id);
  const style = CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.Social;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    locationName: row.location_name || place?.name || "Pinned location",
    address: place?.address ?? (row.location_name || "Pinned on the campus map"),
    description: row.description || "No description provided.",
    locationId: place?.id ?? null,
    mapX: row.map_x ?? place?.mapX ?? null,
    mapY: row.map_y ?? place?.mapY ?? null,
    distance: "On campus",
    timeStatus: statusFor(start, end, now),
    startTime: clock(start),
    endTime: clock(end),
    dateLabel: sameDay(start, now)
      ? todayLabel(now)
      : start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    goingCount: 0,
    interestedCount: 0,
    host: row.host_name || "A Columbia student",
    markerColor: style.markerColor,
    iconType: style.iconType,
    source: row.source,
    createdBy: row.created_by,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}
