import { CATEGORY_STYLE } from "./constants";
import { resolveCampusLocation } from "@/data/campus-locations";
import type { CampusEvent, EventCategory, MarkerColor, MarkerIcon } from "@/types/event";

/** An official Columbia listing as it arrives from a feed, before mapping. */
export interface RawOfficialEvent {
  id: string;
  title: string;
  category: EventCategory;
  /** Free-text venue, e.g. "Alfred Lerner Hall, Room 555". */
  location: string;
  address?: string;
  description: string;
  startTime: string;
  endTime: string;
  dateLabel: string;
  timeStatus: string;
  distance?: string;
  goingCount?: number;
  interestedCount?: number;
  host: string;
  markerColor?: MarkerColor;
  iconType?: MarkerIcon;
  emphasis?: string;
}

/**
 * Maps an official listing onto the campus map by resolving its venue text
 * against the location registry. Unknown venues keep their original text and
 * simply get no marker.
 */
export function normalizeOfficialEvent(raw: RawOfficialEvent): CampusEvent {
  const place = resolveCampusLocation(raw.location);
  const style = CATEGORY_STYLE[raw.category];
  const locationName = raw.location.trim();
  return {
    id: raw.id,
    title: raw.title.trim(),
    category: raw.category,
    locationName,
    address: raw.address ?? place?.address ?? locationName,
    description: raw.description,
    locationId: place?.id ?? null,
    mapX: place?.mapX ?? null,
    mapY: place?.mapY ?? null,
    distance: raw.distance ?? (place ? "On campus" : "Off the map"),
    timeStatus: raw.timeStatus,
    startTime: raw.startTime,
    endTime: raw.endTime,
    dateLabel: raw.dateLabel,
    goingCount: raw.goingCount ?? 0,
    interestedCount: raw.interestedCount ?? 0,
    host: raw.host,
    markerColor: raw.markerColor ?? style.markerColor,
    iconType: raw.iconType ?? style.iconType,
    emphasis: raw.emphasis,
    source: "official",
    createdBy: null,
    status: "active",
  };
}
