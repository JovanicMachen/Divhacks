/** Core domain types for Campus Connect. */

export type EventCategory =
  | "Free Food"
  | "Social"
  | "Academic"
  | "Career"
  | "Sports"
  | "Entertainment";

/** Which category palette an event marker and its badges use. */
export type MarkerColor =
  | "coral"
  | "pink"
  | "blue"
  | "orange"
  | "green"
  | "purple"
  | "teal";

/** Lucide icon slot rendered inside a map marker. */
export type MarkerIcon =
  | "pizza"
  | "music"
  | "book"
  | "briefcase"
  | "graduation"
  | "run"
  | "users";

/** Official Columbia listings vs. events posted by students in the app. */
export type EventSource = "official" | "student";

export interface CampusEvent {
  id: string;
  title: string;
  category: EventCategory;
  locationName: string;
  address: string;
  description: string;
  /** Campus location registry id, when the location resolved to a known place. */
  locationId: string | null;
  /**
   * Pin position on the campus map, 0–100 (% of map width / height). Null when
   * the location isn't on the map: the event stays in search and lists but
   * gets no marker.
   */
  mapX: number | null;
  mapY: number | null;
  distance: string;
  timeStatus: string;
  startTime: string;
  endTime: string;
  dateLabel: string;
  goingCount: number;
  interestedCount: number;
  host: string;
  markerColor: MarkerColor;
  iconType: MarkerIcon;
  /** Phrase in `description` rendered in bold, as in the reference drawer. */
  emphasis?: string;
  source: EventSource;
  /** Auth user id of the student who posted it; null for official listings. */
  createdBy: string | null;
  /** ISO timestamps; official demo listings only carry display labels. */
  startsAt?: string;
  endsAt?: string;
  /** When the row was stored; only events from the database have it. */
  createdAt?: string;
  /** Cover photo URL, when the host added one. */
  imageUrl?: string | null;
  /** `abandoned` once the organizer cancels it; the row is kept, not deleted. */
  status: EventStatus;
  /** When the organizer cancelled it (database clock). */
  abandonedAt?: string | null;
  /** Organizer message pinned to the top of the event chat. */
  pinnedMessageId?: string | null;
  /** A normal listing, or a short-lived Rally that needs enough people to happen. */
  kind: EventKind;
  /** Rally state from the database; null for normal events. */
  rally: RallyInfo | null;
  /** Posted by an organization account (set by the database, not the poster). */
  organizationEvent: boolean;
  /** Informational only: no payment is taken in the app. */
  isPaid: boolean;
  priceDisplay: string | null;
}

export type EventKind = "event" | "rally";
export type RallyStatus = "forming" | "active" | "expired";

export interface RallyInfo {
  status: RallyStatus;
  minParticipants: number;
  /** When a forming Rally closes if it hasn't filled. */
  expiresAt: string;
  anonymous: boolean;
  /** Counted by the database from rally_participants. */
  participantCount: number;
  activatedAt: string | null;
}

/** Stored lifecycle. Ended is derived from end_time, so the app only reads `active` and `abandoned`. */
export type EventStatus = "active" | "abandoned" | "ended";

/** Sidebar selection: a category, every event, or the user's saved events. */
export type SidebarFilter = "all" | "saved" | EventCategory;

/** Normal events only, Rallies only, or both. */
export type KindFilter = "all" | "events" | "rally";

/** Single-select view pills floating over the map. */
export type MapPill = "trending" | "nearMe" | "freeFood";

export type DateFilter = "today" | "any";

/** Form state for the Post Event modal. */
export interface EventDraft {
  title: string;
  description: string;
  category: EventCategory;
  locationName: string;
  /** Registry place picked from the list, or matched from a map tap. */
  locationId: string | null;
  startTime: string;
  endTime: string;
  /** Pin position on the campus map in %, from the picked place or a map tap. */
  point: { x: number; y: number } | null;
  /** Optional cover photo, uploaded when the event is posted. */
  photo: File | null;
  kind: EventKind;
  rallyMinParticipants: number;
  rallyWindowMinutes: number;
  rallyAnonymous: boolean;
  /** Organization accounts only. */
  isPaid: boolean;
  priceDisplay: string;
}

export const RALLY_LIMITS = {
  minParticipants: { min: 2, max: 20, default: 3 },
  windowMinutes: { min: 2, max: 15, default: 5 },
} as const;
