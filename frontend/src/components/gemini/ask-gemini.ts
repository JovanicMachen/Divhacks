import { liveTimeStatus } from "@/lib/event-clock";
import type { CampusEvent, EventCategory } from "@/types/event";

const withLiveStatus = (event: CampusEvent): CampusEvent => ({ ...event, timeStatus: liveTimeStatus(event) });

export interface GeminiReply {
  text: string;
  matches: CampusEvent[];
}

/** Calls the Next.js /gemini route. Throws when the live model is unavailable. */
export async function fetchGeminiReply(
  message: string,
  events: CampusEvent[],
  selectedEvent: CampusEvent | null,
): Promise<GeminiReply> {
  const response = await fetch("/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      currentEvents: events.map(withLiveStatus),
      selectedEvent: selectedEvent && withLiveStatus(selectedEvent),
    }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Gemini is unavailable right now.");
  const text =
    data && typeof data === "object" && "text" in data && typeof data.text === "string" ? data.text : "";
  const eventIds =
    data && typeof data === "object" && "eventIds" in data && Array.isArray(data.eventIds)
      ? data.eventIds.filter((id): id is string => typeof id === "string")
      : [];
  const matches = events.filter(
    (event) =>
      eventIds.includes(event.id) ||
      (eventIds.length === 0 && text.toLowerCase().includes(event.title.toLowerCase())),
  );
  return { text, matches };
}

const CATEGORY_HINTS: Array<{ keys: string[]; category: EventCategory }> = [
  { keys: ["free food", "food", "pizza", "eat", "snack", "lunch", "dinner"], category: "Free Food" },
  { keys: ["social", "party", "meetup", "hang"], category: "Social" },
  { keys: ["academic", "study", "class", "lecture", "library"], category: "Academic" },
  { keys: ["career", "job", "recruit", "internship", "resume"], category: "Career" },
  { keys: ["sport", "game", "basketball", "soccer", "workout"], category: "Sports" },
  { keys: ["entertainment", "music", "concert", "show", "movie"], category: "Entertainment" },
];

function includesAny(text: string, keys: string[]): boolean {
  return keys.some((key) => text.includes(key));
}

function scoreEvent(event: CampusEvent, query: string): number {
  const haystack = [event.title, event.category, event.locationName, event.host, event.description]
    .join(" ")
    .toLowerCase();
  if (haystack.includes(query)) return 3;
  return query
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

function listEvents(events: CampusEvent[]): string {
  return events
    .slice(0, 5)
    .map((event) => `${event.title} — ${event.locationName} (${liveTimeStatus(event)})`)
    .join("\n");
}

/**
 * Campus answers used when Gemini has no API key. Replies stay grounded in
 * the events currently loaded on the map.
 */
export function answerCampusQuestion(
  question: string,
  events: CampusEvent[],
  selectedEvent: CampusEvent | null,
): GeminiReply {
  const query = question.trim().toLowerCase();

  if (!query) {
    return { text: "Ask me what's happening on campus, where the free food is, or how to post an event.", matches: [] };
  }

  if (includesAny(query, ["post", "create", "host", "publish", "list an event"])) {
    return {
      text: "Tap Post Event in the sidebar, add a title and time, then choose a spot on the Columbia map. Signed-in students can see what you post.",
      matches: [],
    };
  }

  if (includesAny(query, ["direction", "walk", "how do i get", "navigate"])) {
    if (selectedEvent) {
      return {
        text: `Open ${selectedEvent.title} and tap Directions — Campus Connect will offer walking directions to ${selectedEvent.locationName}.`,
        matches: [selectedEvent],
      };
    }
    return {
      text: "Select an event on the map, then tap Directions in the detail panel for a walking route.",
      matches: [],
    };
  }

  if (includesAny(query, ["save", "bookmark", "going"])) {
    return {
      text: "Open any event to bookmark it or tap I'm Going. Saved events show up under Saved in the sidebar.",
      matches: [],
    };
  }

  if (selectedEvent && includesAny(query, ["this event", "this one", "selected", "tell me about"])) {
    return {
      text: `${selectedEvent.title} is a ${selectedEvent.category.toLowerCase()} event at ${selectedEvent.locationName}. ${liveTimeStatus(selectedEvent)}. Hosted by ${selectedEvent.host}.`,
      matches: [selectedEvent],
    };
  }

  const hinted = CATEGORY_HINTS.find(({ keys }) => includesAny(query, keys));
  if (hinted) {
    const matches = events.filter((event) => event.category === hinted.category);
    if (matches.length === 0) {
      return {
        text: `No ${hinted.category.toLowerCase()} events are on the map right now. Post one if you're hosting, or check back later.`,
        matches: [],
      };
    }
    return {
      text: `I found ${matches.length} ${hinted.category.toLowerCase()} event${matches.length === 1 ? "" : "s"}:\n${listEvents(matches)}`,
      matches,
    };
  }

  const scored = events
    .map((event) => ({ event, score: scoreEvent(event, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.event);

  if (scored.length > 0) {
    return {
      text: `Here's what matches “${question.trim()}”:\n${listEvents(scored)}`,
      matches: scored,
    };
  }

  if (includesAny(query, ["happen", "now", "today", "what's on", "whats on", "events", "going on"])) {
    if (events.length === 0) {
      return {
        text: "The campus map is quiet right now — nothing is posted yet. Use Post Event to add something, or check back later.",
        matches: [],
      };
    }
    return {
      text: `There ${events.length === 1 ? "is" : "are"} ${events.length} event${events.length === 1 ? "" : "s"} on the map:\n${listEvents(events)}`,
      matches: events,
    };
  }

  if (events.length === 0) {
    return {
      text: "I can help you find campus events, free food, or walk you through posting. The map is empty at the moment.",
      matches: [],
    };
  }

  return {
    text: "I can look up campus events, free food, directions, or how to post. Try “what's happening now?” or name a place or category.",
    matches: [],
  };
}
