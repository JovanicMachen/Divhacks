import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { CATEGORY_STYLE } from "./constants";
import { blobToDataUrl, preparePhoto, removeEventPhoto, uploadEventPhoto } from "./event-photos";
import { localAccountStore } from "./local-account";
import { geoToMap, isOnMap } from "./geo";
import { formatClock, humanizeMinutes, todayLabel } from "./utils";
import { getCampusLocation } from "@/data/campus-locations";
import type { CampusEvent, EventCategory, EventKind, EventSource, EventStatus, RallyStatus } from "@/types/event";

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
  /**
   * The live database keeps an older status vocabulary (see
   * campus_event_status_map), so any string can arrive here; toStatus maps it.
   */
  status?: string | null;
  /** Cancellation time; the live table may use cancelled_at or canceled_at instead. */
  abandoned_at?: string | null;
  cancelled_at?: string | null;
  canceled_at?: string | null;
  pinned_message_id?: string | null;
  /** Absent until 20260927020000_rallies_organizations.sql runs; treated as a normal event. */
  event_type?: EventKind | null;
  rally_status?: RallyStatus | null;
  rally_min_participants?: number | null;
  rally_expires_at?: string | null;
  rally_anonymous?: boolean | null;
  rally_participant_count?: number | null;
  rally_activated_at?: string | null;
  organization_event?: boolean | null;
  is_paid?: boolean | null;
  price_display?: string | null;
}

/** What the client sends; the owner and source are never taken from here. */
export type NewEventRow = Omit<
  EventRow,
  | "id"
  | "created_by"
  | "source"
  | "created_at"
  | "start_time"
  | "end_time"
  | "image_url"
  | "status"
  | "abandoned_at"
  | "pinned_message_id"
  | "rally_status"
  | "rally_participant_count"
  | "rally_activated_at"
  | "organization_event"
> & {
  start_time: string;
  end_time: string;
};

export const STATUS_MIGRATION = "backend/supabase/migrations/20260927050000_live_chat_compat.sql";

const CANCELLED_STATUSES = new Set(["abandoned", "cancelled", "canceled"]);
const CLOSED_STATUSES = new Set(["ended", "completed", "complete", "expired", "past", "closed", "finished", "archived"]);

/** Cancellation time, whichever column the live table uses. */
function cancelledAtOf(row: EventRow): string | null {
  return row.abandoned_at ?? row.cancelled_at ?? row.canceled_at ?? null;
}

/** Maps any stored status (old or new vocabulary) onto the app's three states. */
function toStatus(row: EventRow): EventStatus {
  const status = (row.status ?? "").toLowerCase();
  if (cancelledAtOf(row) || CANCELLED_STATUSES.has(status)) return "abandoned";
  if (CLOSED_STATUSES.has(status)) return "ended";
  return "active";
}
export const RALLY_MIGRATION = "backend/supabase/migrations/20260927020000_rallies_organizations.sql";

/** How long an active Rally stays on the map (the database uses the same hour). */
const RALLY_ACTIVE_MS = 60 * 60 * 1000;

export type EventChange = { type: "upsert"; row: EventRow } | { type: "delete"; id: string } | { type: "reload" };

export interface EventsBackend {
  list: () => Promise<EventRow[]>;
  /** Resolves with the stored row; rejects with a user-facing message. `photo` is optional. */
  insert: (row: NewEventRow, photo?: File | null) => Promise<EventRow>;
  /** Rejects when nothing was deleted (not the owner, or already gone). Also removes the event's own photo. */
  remove: (id: string) => Promise<void>;
  /** Marks the owner's event cancelled (status 'abandoned'); the row stays. Resolves with the stored row. */
  cancel: (id: string) => Promise<EventRow>;
  /** Pins one of the organizer's own chat messages, or clears the pin with null. */
  setPinned: (id: string, messageId: string | null) => Promise<EventRow>;
  /** Adds the signed-in user to a Rally. The database counts and activates it. */
  joinRally: (id: string) => Promise<EventRow>;
  /** Asks the database to mark Rallies whose window closed as expired. */
  expireRallies: () => Promise<void>;
  /** Rallies the signed-in user has joined (including ones they started). */
  myRallies: () => Promise<string[]>;
  /** Events the signed-in user marked Going, or null when Going isn't stored in the database yet. */
  listGoing: () => Promise<string[] | null>;
  /** Marks or unmarks the signed-in user as going. */
  setGoing: (id: string, going: boolean) => Promise<void>;
  /** Local preview only: the demo admin override after the server accepted the code. */
  adminApply?: (id: string, action: "delete" | "cancel") => Promise<EventRow | null>;
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
  if (/\b(status|abandoned_at|pinned_message_id)\b/.test(message) && /column|schema cache/i.test(message))
    return new Error(`Cancelling events needs one more database update. Run ${STATUS_MIGRATION} first.`);
  if (/can't be restored|can only be cancelled/i.test(message))
    return new Error("This event was already cancelled.");
  if (/can be pinned/i.test(message)) return new Error("Only your own messages in this event can be pinned.");
  if (/rally_participants|event_type|rally_|organization_event|is_paid|price_display/.test(message) && /column|schema cache|does not exist/i.test(message))
    return new Error(`Rallies and organization events need one more database update. Run ${RALLY_MIGRATION} first.`);
  if (/Rally needs between|Rally window is/.test(message)) return new Error(message);
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
    async cancel(id) {
      // cancel_event() writes the cancelled value the live status constraint allows
      // and the cancellation time; it checks ownership in the database.
      const rpc = await supabase.rpc("cancel_event", { target: id });
      if (!rpc.error) return rpc.data as EventRow;
      const missing = rpc.error.code === "PGRST202" || rpc.error.code === "42883";
      if (!missing) {
        if (/already cancelled/i.test(rpc.error.message)) throw new Error("This event was already cancelled.");
        if (rpc.error.code === "42501") throw new Error("This event couldn't be cancelled. Only its host can cancel it.");
        throw describe(rpc.error, "cancel");
      }
      // Databases set up before cancel_event() existed.
      const { data, error } = await supabase
        .from("events")
        .update({ status: "abandoned" })
        .eq("id", id)
        .eq("status", "active")
        .select("*");
      if (error) throw describe(error, "cancel");
      if (!data || data.length === 0)
        throw new Error("This event couldn't be cancelled. Only its host can cancel it, and only while it's active.");
      return data[0] as EventRow;
    },
    async setPinned(id, messageId) {
      const { data, error } = await supabase
        .from("events")
        .update({ pinned_message_id: messageId })
        .eq("id", id)
        .select("*");
      if (error) throw describe(error, "update");
      if (!data || data.length === 0) throw new Error("Only the event's host can pin messages.");
      return data[0] as EventRow;
    },
    async joinRally(id) {
      // user_id defaults to auth.uid(); RLS only accepts your own row on an open Rally.
      const { error } = await supabase.from("rally_participants").insert({ event_id: id });
      // 23505: this account already counts (a double tap, or another device) — that's joined.
      if (error && error.code !== "23505") {
        if (error.code === "42501" || /row-level security/i.test(error.message))
          throw new Error("This Rally isn't taking new people anymore.");
        throw describe(error, "join");
      }
      const { data, error: readError } = await supabase.from("events").select("*").eq("id", id).single();
      if (readError) throw describe(readError, "load");
      return data as EventRow;
    },
    async expireRallies() {
      const { error } = await supabase.rpc("expire_rallies");
      if (error) console.warn("Could not expire Rallies:", error.message);
    },
    async myRallies() {
      const { data, error } = await supabase.from("rally_participants").select("event_id");
      if (error) return [];
      return (data ?? []).map((row: { event_id: string }) => row.event_id);
    },
    async listGoing() {
      const { data, error } = await supabase.from("event_going").select("event_id");
      if (error) {
        console.warn("Going isn't stored in the database yet:", error.message);
        return null;
      }
      return (data ?? []).map((row: { event_id: string }) => row.event_id);
    },
    async setGoing(id, going) {
      if (going) {
        // user_id defaults to auth.uid(); RLS only accepts your own row on an open event.
        const { error } = await supabase.from("event_going").insert({ event_id: id });
        if (error && error.code !== "23505") {
          if (error.code === "42501" || /row-level security/i.test(error.message))
            throw new Error("This event isn't taking new people anymore.");
          throw describe(error, "join");
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      const me = data.session?.user.id;
      if (!me) throw new Error("You need to be signed in.");
      const { error } = await supabase.from("event_going").delete().eq("event_id", id).eq("user_id", me);
      if (error) throw describe(error, "update");
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
const LOCAL_RALLY_KEY = "campus-connect.local-rally-participants";

interface LocalParticipant {
  event_id: string;
  user_id: string;
  joined_at: string;
}

function readParticipants(): LocalParticipant[] {
  try {
    const rows = JSON.parse(window.localStorage.getItem(LOCAL_RALLY_KEY) ?? "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

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

  /** Same rules as the database triggers: count, then switch on at the minimum. */
  const syncRally = (rows: EventRow[], id: string): EventRow[] => {
    const count = readParticipants().filter((p) => p.event_id === id).length;
    return rows.map((row) => {
      if (row.id !== id || row.event_type !== "rally") return row;
      const now = Date.now();
      const activates =
        row.rally_status === "forming" &&
        count >= (row.rally_min_participants ?? Infinity) &&
        Date.parse(row.rally_expires_at ?? "") > now;
      return {
        ...row,
        rally_participant_count: count,
        ...(activates
          ? {
              rally_status: "active" as const,
              rally_activated_at: new Date(now).toISOString(),
              start_time: new Date(now).toISOString(),
              end_time: new Date(now + RALLY_ACTIVE_MS).toISOString(),
            }
          : {}),
      };
    });
  };

  const joinLocal = (id: string, userId: string): EventRow => {
    const rows = readLocal();
    const target = rows.find((row) => row.id === id);
    const now = Date.now();
    const open =
      target?.event_type === "rally" &&
      toStatus(target) === "active" &&
      ((target.rally_status === "forming" && Date.parse(target.rally_expires_at ?? "") > now) ||
        (target.rally_status === "active" && Date.parse(target.end_time ?? "") > now));
    if (!open) throw new Error("This Rally isn't taking new people anymore.");
    const participants = readParticipants();
    // Already counted (a double tap or another tab): that's joined, not an error.
    if (participants.some((p) => p.event_id === id && p.user_id === userId)) return target!;
    window.localStorage.setItem(
      LOCAL_RALLY_KEY,
      JSON.stringify([...participants, { event_id: id, user_id: userId, joined_at: new Date(now).toISOString() }]),
    );
    const next = syncRally(rows, id);
    const row = next.find((r) => r.id === id)!;
    write(next, { type: "upsert", row });
    return row;
  };

  const expireLocal = () => {
    const now = Date.now();
    const rows = readLocal();
    const expired = rows.filter(
      (row) => row.event_type === "rally" && row.rally_status === "forming" && Date.parse(row.rally_expires_at ?? "") <= now,
    );
    if (expired.length === 0) return;
    const ids = new Set(expired.map((row) => row.id));
    const next = rows.map((row) => (ids.has(row.id) ? { ...row, rally_status: "expired" as const } : row));
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    next.filter((row) => ids.has(row.id)).forEach((row) => channel?.postMessage({ type: "upsert", row } satisfies EventChange));
  };

  return {
    async list() {
      return readLocal();
    },
    async insert(row, photo) {
      const owner = currentUserId();
      if (!owner) throw new Error("You need to be signed in to post an event.");
      // No Storage in local preview: keep a small copy of the photo on the row.
      const image_url = photo ? await blobToDataUrl(await preparePhoto(photo, 720, 0.78)) : null;
      const isOrg = Boolean(localAccountStore.getSnapshot()?.profile.is_org);
      const now = new Date();
      const rally = row.event_type === "rally";
      const paid = isOrg && !rally && Boolean(row.is_paid) && Boolean(row.price_display);
      let stored: EventRow = {
        ...row,
        image_url,
        id: crypto.randomUUID(),
        created_by: owner,
        source: "student",
        created_at: now.toISOString(),
        event_type: rally ? "rally" : "event",
        organization_event: isOrg,
        is_paid: paid,
        price_display: paid ? row.price_display : null,
        ...(rally
          ? {
              rally_status: "forming" as const,
              rally_participant_count: 0,
              rally_activated_at: null,
              start_time: now.toISOString(),
              end_time: row.rally_expires_at ?? row.end_time,
              host_name: row.rally_anonymous ? "Anonymous student" : row.host_name,
            }
          : { rally_status: null, rally_min_participants: null, rally_expires_at: null, rally_anonymous: false }),
      };
      let rows = [...readLocal(), stored];
      if (rally) {
        window.localStorage.setItem(
          LOCAL_RALLY_KEY,
          JSON.stringify([...readParticipants(), { event_id: stored.id, user_id: owner, joined_at: now.toISOString() }]),
        );
        rows = syncRally(rows, stored.id);
        stored = rows.find((r) => r.id === stored.id) ?? stored;
      }
      write(rows, { type: "upsert", row: stored });
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
    async cancel(id) {
      const rows = readLocal();
      const target = rows.find((row) => row.id === id);
      if (!target || target.source !== "student" || target.created_by !== currentUserId())
        throw new Error("This event couldn't be cancelled. Only its host can cancel it.");
      if (toStatus(target) !== "active") throw new Error("This event was already cancelled.");
      const next: EventRow = { ...target, status: "abandoned", abandoned_at: new Date().toISOString() };
      write(
        rows.map((row) => (row.id === id ? next : row)),
        { type: "upsert", row: next },
      );
      return next;
    },
    async setPinned(id, messageId) {
      const rows = readLocal();
      const target = rows.find((row) => row.id === id);
      if (!target || target.created_by !== currentUserId()) throw new Error("Only the event's host can pin messages.");
      const next: EventRow = { ...target, pinned_message_id: messageId };
      write(
        rows.map((row) => (row.id === id ? next : row)),
        { type: "upsert", row: next },
      );
      return next;
    },
    async joinRally(id) {
      const userId = currentUserId();
      if (!userId) throw new Error("You need to be signed in to join a Rally.");
      // Tabs share localStorage; take a lock so two joins can't overwrite each other.
      if (typeof navigator !== "undefined" && navigator.locks)
        return navigator.locks.request(LOCAL_RALLY_KEY, () => joinLocal(id, userId));
      return joinLocal(id, userId);
    },
    async expireRallies() {
      const run = () => expireLocal();
      if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request(LOCAL_RALLY_KEY, run);
      else run();
    },
    async listGoing() {
      return null;
    },
    async setGoing() {},
    async myRallies() {
      const userId = currentUserId();
      return readParticipants()
        .filter((p) => p.user_id === userId)
        .map((p) => p.event_id);
    },
    async adminApply(id, action) {
      const rows = readLocal();
      const target = rows.find((row) => row.id === id);
      if (!target) throw new Error("Official listings aren't stored in the database, so they can't be changed here.");
      if (action === "delete") {
        write(
          rows.filter((row) => row.id !== id),
          { type: "delete", id },
        );
        return null;
      }
      const next: EventRow = { ...target, status: "abandoned", abandoned_at: new Date().toISOString() };
      write(
        rows.map((row) => (row.id === id ? next : row)),
        { type: "upsert", row: next },
      );
      return next;
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
    description: row.description || (row.event_type === "rally" ? "" : "No description provided."),
    locationId: place?.id ?? null,
    mapX: point?.x ?? null,
    mapY: point?.y ?? null,
    distance: "On campus",
    ...scheduleFor(row, now),
    goingCount: 0,
    interestedCount: 0,
    host: row.event_type === "rally" && row.rally_anonymous ? "Anonymous student" : row.host_name || "A Columbia student",
    markerColor: style.markerColor,
    iconType: style.iconType,
    source: row.source,
    createdBy: row.created_by,
    startsAt: row.start_time ?? undefined,
    endsAt: row.end_time ?? undefined,
    createdAt: row.created_at,
    imageUrl: row.image_url ?? null,
    status: toStatus(row),
    abandonedAt: cancelledAtOf(row),
    pinnedMessageId: row.pinned_message_id ?? null,
    kind: row.event_type === "rally" ? "rally" : "event",
    rally:
      row.event_type === "rally" && row.rally_status && row.rally_expires_at
        ? {
            status: row.rally_status,
            minParticipants: row.rally_min_participants ?? 2,
            expiresAt: row.rally_expires_at,
            anonymous: Boolean(row.rally_anonymous),
            participantCount: row.rally_participant_count ?? 0,
            activatedAt: row.rally_activated_at ?? null,
          }
        : null,
    organizationEvent: Boolean(row.organization_event),
    isPaid: Boolean(row.is_paid && row.price_display),
    priceDisplay: row.is_paid ? (row.price_display ?? null) : null,
  };
}
