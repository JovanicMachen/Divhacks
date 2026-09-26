import type { CampusEvent } from "@/types/event";

/**
 * Mock campus events for the Phase 1 visual prototype.
 *
 * `mapX` / `mapY` are normalised percentages of the placeholder map surface
 * (the pin tip, not the pin centre) rather than geographic coordinates, so the
 * markers keep their composition at any viewport size. Phase 2 replaces these
 * with real lng/lat once Mapbox is wired in.
 */
export const MOCK_EVENTS: CampusEvent[] = [
  {
    id: "free-pizza",
    title: "Free Pizza",
    category: "Free Food",
    locationName: "Lerner Hall",
    address: "Lerner Hall, 2920 Broadway",
    description:
      "Free pizza for Columbia students! Come grab a slice and meet other students. Hosted by the Columbia Undergraduate Council (CUC). First come, first served while supplies last!",
    mapX: 53.3,
    mapY: 19.4,
    distance: "4 min away",
    timeStatus: "Ends in 34 min",
    startTime: "12:00 PM",
    endTime: "2:00 PM",
    dateLabel: "Today, Apr 10",
    goingCount: 87,
    interestedCount: 214,
    host: "Columbia Undergraduate Council",
    markerColor: "coral",
    iconType: "pizza",
    emphasis: "Columbia students!",
  },
  {
    id: "live-music",
    title: "Live Music",
    category: "Entertainment",
    locationName: "Low Steps",
    address: "Low Memorial Library, 535 W 116th St",
    description:
      "Student bands playing all afternoon on the steps. Bring a blanket, stay for a set or two.",
    mapX: 29.9,
    mapY: 28.4,
    distance: "6 min away",
    timeStatus: "Starts in 1 hr",
    startTime: "3:00 PM",
    endTime: "6:00 PM",
    dateLabel: "Today, Apr 10",
    goingCount: 142,
    interestedCount: 389,
    host: "Columbia Music Collective",
    markerColor: "purple",
    iconType: "music",
  },
  {
    id: "ai-study-session",
    title: "AI Study Session",
    category: "Academic",
    locationName: "Uris Hall",
    address: "Uris Hall, 3022 Broadway",
    description:
      "Working through problem sets together ahead of Thursday's midterm. Laptops encouraged.",
    mapX: 77.5,
    mapY: 31.8,
    distance: "8 min away",
    timeStatus: "Ends in 2 hr",
    startTime: "1:00 PM",
    endTime: "4:00 PM",
    dateLabel: "Today, Apr 10",
    goingCount: 34,
    interestedCount: 96,
    host: "Columbia Data Science Society",
    markerColor: "blue",
    iconType: "book",
  },
  {
    id: "startup-networking",
    title: "Startup Networking",
    category: "Career",
    locationName: "Schermerhorn Hall",
    address: "Schermerhorn Hall, 1190 Amsterdam Ave",
    description:
      "Meet founders and early engineers from the Columbia startup community over coffee.",
    mapX: 79.5,
    mapY: 50.6,
    distance: "5 min away",
    timeStatus: "Starts in 45 min",
    startTime: "2:30 PM",
    endTime: "4:30 PM",
    dateLabel: "Today, Apr 10",
    goingCount: 58,
    interestedCount: 173,
    host: "Columbia Entrepreneurship",
    markerColor: "orange",
    iconType: "briefcase",
  },
  {
    id: "study-session",
    title: "Study Session",
    category: "Academic",
    locationName: "Butler Library",
    address: "Butler Library, 535 W 114th St",
    description:
      "Quiet group study on the third floor. Snacks provided, stay as long as you like.",
    mapX: 27.1,
    mapY: 59.8,
    distance: "3 min away",
    timeStatus: "Ends in 4 hr",
    startTime: "11:00 AM",
    endTime: "7:00 PM",
    dateLabel: "Today, Apr 10",
    goingCount: 21,
    interestedCount: 64,
    host: "Columbia Library Services",
    markerColor: "teal",
    iconType: "graduation",
  },
  {
    id: "pickup-basketball",
    title: "Pickup Basketball",
    category: "Sports",
    locationName: "Dodge Fitness Center",
    address: "Dodge Fitness Center, 3030 Broadway",
    description:
      "Open run on the main court. All skill levels welcome, teams sorted on the spot.",
    mapX: 70.2,
    mapY: 64.0,
    distance: "7 min away",
    timeStatus: "Happening now",
    startTime: "12:30 PM",
    endTime: "3:00 PM",
    dateLabel: "Today, Apr 10",
    goingCount: 26,
    interestedCount: 71,
    host: "Columbia Recreation",
    markerColor: "green",
    iconType: "run",
  },
  {
    id: "campus-meetup",
    title: "Campus Meetup",
    category: "Social",
    locationName: "Hamilton Hall",
    address: "Hamilton Hall, 1130 Amsterdam Ave",
    description:
      "Casual meetup for first-years and transfers. Come say hi, no sign-up needed.",
    mapX: 29.6,
    mapY: 70.6,
    distance: "4 min away",
    timeStatus: "Ends in 1 hr",
    startTime: "12:00 PM",
    endTime: "2:30 PM",
    dateLabel: "Today, Apr 10",
    goingCount: 49,
    interestedCount: 118,
    host: "Columbia College Student Council",
    markerColor: "pink",
    iconType: "users",
  },
];

/** The event selected when the app first opens. */
export const FEATURED_EVENT_ID = "free-pizza";

/**
 * Default "you are here" spot on the campus map (Low Steps / College Walk).
 * A granted browser location replaces this while the user is on the map.
 */
export const DEFAULT_USER_LOCATION = { x: 38.7, y: 52.4 } as const;

/** Bottom status bar figures shown over the map. */
export const CAMPUS_STATS = {
  happeningNow: 12,
  activeOnCampus: 143,
  freeFoodEvents: 3,
} as const;
