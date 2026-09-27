import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { CATEGORY_STYLE } from "./constants";
import { blobToDataUrl, preparePhoto, removeEventPhoto, uploadEventPhoto } from "./event-photos";
import { localAccountStore } from "./local-account";
import { geoToMap, isOnMap } from "./geo";
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
  /** Real-world position (the live table's existing columns). */
  latitude: number | null;
  longitude: number | null;
  host_name: string | null;
  /** Null on rows created before the app stored times. */
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  /** Public URL of the cover photo; absent until the event photos migration runs. */
  image_url?: string | null;
}

/** What the client sends; the owner and source are never taken from here. */
export type NewEventRow = Omit<EventRow, "id" | "created_by" | "source" | "created_at" | "start_time" | "end_time" | "image_url"> & {
  start_time: string;
  end_time: string;
};

export type EventChange = { type: "upsert"; row: EventRow } | { type: "delete"; id: string } | { type: "reload" };

export interface EventsBackend {
  list: () => Promise<EventRow[]>;
  /** Resolves with the stored row; rejects with a user-facing message. `photo` is optional. */
  insert: (row: NewEventRow, photo?: File | null) => Promise<EventRow>;
  /** Rejects when nothing was deleted (not the owner, or already gone). Also removes the event's own photo. */
  remove: (id: string) => Promise<void>;
  subscribe: (onChange: (change: EventChange) => void) => () => void;
}

const NETWORK_ERROR = "Couldn't reach Campus Connect's servers. Check your connection and try again.";

function describe(error: PostgrestError | { message: string; code?: string }, action: string): Error {
  const message = error.message ?? "";
  if (/failed to fetch|network|load failed/i.test(message)) return new Error(NETWORK_ERROR);
  if (error.code === "42P01" || error.code === "PGRST205" || /could not find the table|does not exist/i.test(message))
    return new Error("The events table doesn't exist yet. Run backend/supabase/migrations in the Supabase SQL editor first.");
  if (/image_url/.test(message))
    return new Error("Event photos need one more database update. Run backend/supabase/migrations/20260926240000_event_photos.sql, or post without a photo.");
  if (/events_image_in_owner_folder/.test(message))
    return new Error("That photo isn't in your own upload folder, so it can't be attached.");
  if (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find the '.*' column/i.test(message))
    return new Error("The events table is missing columns this app needs. Run backend/supabase/migrations/20260926221000_events_live_schema_compat_v2.sql first.");
  if (error.code === "23503")
    return new Error("This event can't be deleted yet because other people marked it Going or Saved. The database needs to remove those rows with the event.");
  if (error.code === "42501" || /row-level security/i.test(message))
    return new Error(`You don't have permission to ${action} this event.`);
  return new Error(message || `Couldn't ${action} the event. Please try again.`);
}

export function createSupabaseEventsBackend(supabase: SupabaseClient): EventsBackend {
  return {
    async list() {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_time", { ascending: true, nullsFirst: false });
      if (error) throw describe(error, "load");
      return (data ?? []) as EventRow[];
    },
    async insert(row, photo) {
      // created_by defaults to auth.uid() in the database, and RLS rejects any
      // row whose owner isn't the caller, so it is deliberately not sent.
      if (!photo) {
        const { data, error } = await supabase
          .from("events")
          .insert({ ...row, source: "student" })
          .select("*")
          .single();
        if (error) throw describe(error, "post");
        return data as EventRow;
      }

      // The photo goes to <user id>/<event id>/, so the id is chosen here and the
      // row is saved with its photo in one insert (other clients get both at once).
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("You need to be signed in to post an event.");
      const id = crypto.randomUUID();
      const { url } = await uploadEventPhoto(supabase, userId, id, await preparePhoto(photo));
      const { data, error } = await supabase
        .from("events")
        .insert({ ...row, id, image_url: url, source: "student" })
        .select("*")
        .single();
      if (error) {
        await removeEventPhoto(supabase, userId, id, url);
        throw describe(error, "post");
      }
      return data as EventRow;
    },
    async remove(id) {
      const { data, error } = await supabase.from("events").delete().eq("id", id).select("*");
      if (error) throw describe(error, "delete");
      // RLS silently filters rows the caller doesn't own, so zero rows means "not yours".
      if (!data || data.length === 0) throw new Error("This event couldn't be deleted. Only its host can delete it.");
      const deleted = data[0] as EventRow;
      await removeEventPhoto(supabase, deleted.created_by, deleted.id, deleted.image_url);
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

type StoredLocalRow = EventRow & { starts_at?: string; ends_at?: string; lat?: number; lng?: number };

function readLocal(): EventRow[] {
  try {
    const rows: StoredLocalRow[] = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]");
    if (!Array.isArray(rows)) return [];
    // Local preview posts saved before the live column names were adopted.
    return rows.map(({ starts_at, ends_at, lat, lng, ...row }) => ({
      ...row,
      start_time: row.start_time ?? starts_at ?? null,
      end_time: row.end_time ?? ends_at ?? null,
      latitude: row.latitude ?? lat ?? null,
      longitude: row.longitude ?? lng ?? null,
    }));
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
    async insert(row, photo) {
      const owner = currentUserId();
      if (!owner) throw new Error("You need to be signed in to post an event.");
      // No Storage in local preview: keep a small copy of the photo on the row.
      const image_url = photo ? await blobToDataUrl(await preparePhoto(photo, 720, 0.78)) : null;
      const stored: EventRow = {
        ...row,
        image_url,
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

/** When and for how long, as shown in the drawer and lists. */
function scheduleFor(row: EventRow, now: Date) {
  const start = row.start_time ? new Date(row.start_time) : null;
  const end = row.end_time ? new Date(row.end_time) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const posted = new Date(row.created_at);
    return {
      timeStatus: "Time not set",
      startTime: "Time not set",
      endTime: "",
      dateLabel: Number.isNaN(posted.getTime())
        ? "Date not set"
        : `Posted ${posted.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    };
  }
  return {
    timeStatus: statusFor(start, end, now),
    startTime: clock(start),
    endTime: clock(end),
    dateLabel: sameDay(start, now)
      ? todayLabel(now)
      : start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
  };
}

/** Where to draw the marker: stored map position, then the registry place, then latitude/longitude. */
function mapPointFor(row: EventRow, place: ReturnType<typeof getCampusLocation>) {
  if (row.map_x !== null && row.map_y !== null) return { x: row.map_x, y: row.map_y };
  if (place) return { x: place.mapX, y: place.mapY };
  if (row.latitude !== null && row.longitude !== null) {
    const point = geoToMap({ lat: row.latitude, lng: row.longitude });
    if (isOnMap(point)) return point;
  }
  return null;
}

/** A stored student event, shaped for the map, drawer and lists. */
export function rowToEvent(row: EventRow, now: Date = new Date()): CampusEvent {
  const place = getCampusLocation(row.location_id);
  const point = mapPointFor(row, place);
  const style = CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.Social;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    locationName: row.location_name || place?.name || "Pinned location",
    address: place?.address ?? (row.location_name || "Pinned on the campus map"),
    description: row.description || "No description provided.",
    locationId: place?.id ?? null,
    mapX: point?.x ?? null,
    mapY: point?.y ?? null,
    distance: "On campus",
    ...scheduleFor(row, now),
    goingCount: 0,
    interestedCount: 0,
    host: row.host_name || "A Columbia student",
    markerColor: style.markerColor,
    iconType: style.iconType,
    source: row.source,
    createdBy: row.created_by,
    startsAt: row.start_time ?? undefined,
    endsAt: row.end_time ?? undefined,
    createdAt: row.created_at,
    imageUrl: row.image_url ?? null,
  };
}
