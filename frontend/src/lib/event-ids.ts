import { OFFICIAL_EVENTS } from "@/data/mock-events";

/** Student events have uuid ids and are resolved on the client after sign-in. */
const STUDENT_EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OFFICIAL_IDS = new Set(OFFICIAL_EVENTS.map((event) => event.id));

export function isRoutableEventId(id: string): boolean {
  return OFFICIAL_IDS.has(id) || STUDENT_EVENT_ID.test(id);
}
