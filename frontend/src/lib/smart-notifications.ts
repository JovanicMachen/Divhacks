import type { NewNotification } from "./notifications-backend";
import { humanizeMinutes } from "./utils";
import type { CampusEvent, EventCategory } from "@/types/event";

export type NotificationType =
  | "event_cancelled"
  | "going_starting_now"
  | "going_starts_soon"
  | "saved_starts_soon"
  | "free_food_posted"
  | "free_food_now"
  | "category_starts_soon"
  | "new_event"
  | "official_added";

/** Lower is more relevant; mirrors the order the product asks for. */
const PRIORITY: Record<NotificationType, number> = {
  event_cancelled: 0,
  going_starting_now: 1,
  going_starts_soon: 1,
  saved_starts_soon: 2,
  free_food_posted: 4,
  free_food_now: 4,
  category_starts_soon: 5,
  new_event: 7,
  official_added: 8,
};

export const priorityOf = (type: string) => PRIORITY[type as NotificationType] ?? 9;

const MINUTE = 60_000;
const SOON_MINUTES = 30;
const CATEGORY_SOON_MINUTES = 15;
const STARTING_NOW_WINDOW_MINUTES = 10;
const FRESH_POST_MINUTES = 60;
const JUST_POSTED_MINUTES = 15;
/** At most this many new notifications per pass, most relevant first. */
const MAX_PER_PASS = 4;
/** Cancellations older than this are history, not news. */
const CANCELLED_NOTICE_HOURS = 72;

interface Timing {
  start: number;
  end: number;
  posted: number | null;
}

/** Only events with real timestamps can drive time-based notifications. */
function timingOf(event: CampusEvent): Timing | null {
  if (!event.startsAt || !event.endsAt) return null;
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const posted = event.createdAt ? Date.parse(event.createdAt) : NaN;
  return { start, end, posted: Number.isNaN(posted) ? null : posted };
}

export interface SmartInput {
  events: CampusEvent[];
  going: Set<string>;
  saved: Set<string>;
  userId: string;
  /** Categories of events the user marked Going, Saved, or posted. */
  interests: Set<EventCategory>;
  now: number;
}

type Candidate = NewNotification & { priority: number };

/**
 * Notifications that the current data supports right now. Every fact comes from
 * the event record or the user's own Going / Saved; nothing is estimated.
 * dedupe_key makes each condition fire once per user and event.
 */
export function smartNotifications({ events, going, saved, userId, interests, now }: SmartInput): NewNotification[] {
  const out: Candidate[] = [];
  const push = (type: NotificationType, event: CampusEvent, title: string, body?: string) =>
    out.push({
      type,
      title,
      body: body ?? `${event.title} · ${event.locationName}`,
      event_id: event.id,
      dedupe_key: `${type}:${event.id}`,
      metadata: { priority: PRIORITY[type], category: event.category },
      priority: PRIORITY[type],
    });

  for (const event of events) {
    if (event.status === "abandoned") {
      const cancelledAt = event.abandonedAt ? Date.parse(event.abandonedAt) : NaN;
      if (
        (going.has(event.id) || saved.has(event.id)) &&
        event.createdBy !== userId &&
        !Number.isNaN(cancelledAt) &&
        now - cancelledAt <= CANCELLED_NOTICE_HOURS * 60 * MINUTE
      ) {
        push("event_cancelled", event, "Event cancelled", `“${event.title}” was cancelled by its organizer.`);
      }
      continue;
    }
    const timing = timingOf(event);
    if (!timing || timing.end <= now) continue;
    const { start, end, posted } = timing;
    const untilStart = (start - now) / MINUTE;
    const happening = start <= now && now < end;
    const postedByOther = event.createdBy !== userId;
    const freshlyPosted = posted !== null && postedByOther && now - posted <= FRESH_POST_MINUTES * MINUTE;

    if (going.has(event.id)) {
      if (happening && now - start <= STARTING_NOW_WINDOW_MINUTES * MINUTE)
        push("going_starting_now", event, "An event you're going to is starting now");
      else if (untilStart > 0 && untilStart <= SOON_MINUTES) push("going_starts_soon", event, "An event you're going to starts soon");
      continue;
    }

    if (saved.has(event.id) && untilStart > 0 && untilStart <= SOON_MINUTES) {
      push("saved_starts_soon", event, "Your saved event starts soon");
      continue;
    }

    if (event.category === "Free Food" && postedByOther && (happening || untilStart <= SOON_MINUTES)) {
      if (posted !== null && now - posted <= JUST_POSTED_MINUTES * MINUTE)
        push("free_food_posted", event, `Free food was just posted at ${event.locationName}`);
      else if (happening) push("free_food_now", event, `Free food happening now at ${event.locationName}`);
      continue;
    }

    if (
      postedByOther &&
      interests.has(event.category) &&
      !saved.has(event.id) &&
      untilStart > 0 &&
      untilStart <= CATEGORY_SOON_MINUTES
    ) {
      push("category_starts_soon", event, `A ${event.category} event starts soon`);
      continue;
    }

    if (freshlyPosted) {
      if (event.source === "official") push("official_added", event, "A new official Columbia event was added");
      else push("new_event", event, `A new ${event.category} event was posted`);
    }
  }

  return out
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_PER_PASS)
    .map((candidate) => ({
      type: candidate.type,
      title: candidate.title,
      body: candidate.body,
      event_id: candidate.event_id,
      dedupe_key: candidate.dedupe_key,
      metadata: candidate.metadata,
    }));
}

/**
 * The second line of a notification, recomputed from the live event on every
 * render. The countdown itself is shown beside it as a chip.
 */
export function liveStatus(event: CampusEvent | undefined, now: number): { text: string; available: boolean } {
  if (!event) return { text: "This event is no longer available", available: false };
  if (event.status === "abandoned") return { text: `Cancelled · ${event.locationName}`, available: true };
  const timing = timingOf(event);
  if (!timing) return { text: event.locationName, available: true };
  const { end, posted } = timing;
  if (end <= now) return { text: `Ended · ${event.locationName}`, available: true };
  const parts: string[] = [];
  if (posted !== null && now - posted < FRESH_POST_MINUTES * MINUTE)
    parts.push(`Posted ${humanizeMinutes(Math.max(1, Math.round((now - posted) / MINUTE)))} ago`);
  parts.push(event.locationName);
  return { text: parts.join(" · "), available: true };
}

/** "now", "4m", "2h", "3d" — how long ago the notification arrived. */
export function ageLabel(createdAt: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(createdAt)) / MINUTE);
  if (Number.isNaN(minutes) || minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
