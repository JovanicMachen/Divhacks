import { worldToMap } from "./geo";
import type { EventCategory, MarkerColor, MarkerIcon } from "@/types/event";

export const EVENT_CATEGORIES: EventCategory[] = [
  "Free Food",
  "Social",
  "Academic",
  "Career",
  "Sports",
  "Entertainment",
];

/** Marker colour and glyph a newly posted event gets for its category. */
export const CATEGORY_STYLE: Record<EventCategory, { markerColor: MarkerColor; iconType: MarkerIcon }> = {
  "Free Food": { markerColor: "coral", iconType: "pizza" },
  Social: { markerColor: "pink", iconType: "users" },
  Academic: { markerColor: "blue", iconType: "book" },
  Career: { markerColor: "orange", iconType: "briefcase" },
  Sports: { markerColor: "green", iconType: "run" },
  Entertainment: { markerColor: "purple", iconType: "music" },
};

/**
 * Layout dimensions measured from the Campus Connect reference design
 * (values are for the primary ~1536x864 desktop target).
 */
export const LAYOUT = {
  navbarHeight: 72,
  sidebarWidth: 276,
  sidebarWidthCompact: 236,
  drawerColumnWidth: 416,
  drawerColumnWidthCompact: 360,
  searchMaxWidth: 620,
} as const;

/** Category palette sampled from the reference screenshot. */
export interface CategoryPalette {
  /** Saturated marker / icon fill. */
  solid: string;
  /** Soft tinted background for pills and badges. */
  soft: string;
  /** Readable text colour on top of `soft`. */
  text: string;
}

export const MARKER_PALETTE: Record<MarkerColor, CategoryPalette> = {
  coral: { solid: "#F13F2D", soft: "#FCE2E3", text: "#E23522" },
  pink: { solid: "#F7609B", soft: "#FDE4EF", text: "#DE3C7E" },
  blue: { solid: "#1B68EA", soft: "#E2EBFB", text: "#1559D0" },
  orange: { solid: "#FA8625", soft: "#FDEBD8", text: "#D96C10" },
  green: { solid: "#30B45E", soft: "#DFF3E6", text: "#1F914A" },
  purple: { solid: "#9451EE", soft: "#EDE4FD", text: "#7B39D8" },
  teal: { solid: "#2FB7C9", soft: "#DDF2F5", text: "#1B96A7" },
};

interface MapTextLabel {
  label: string;
  x: number;
  y: number;
  rotate: number;
}

/** [label, world x, world y, rotation] — see `@/lib/geo` for world units. */
const worldLabel = ([label, wx, wy, rotate = 0]: [string, number, number, number?]): MapTextLabel => ({
  label,
  rotate,
  ...worldToMap({ x: wx, y: wy }),
});

/** Street and park names drawn over the campus map (building names come from the location registry). */
export const MAP_LABELS: { streets: MapTextLabel[]; parks: MapTextLabel[] } = {
  streets: (
    [
      ["W 122nd St", 330, 43],
      ["W 121st St", 330, 99],
      ["W 120th St", 330, 163],
      ["W 119th St", 480, 222],
      ["W 118th St", 480, 283],
      ["W 117th St", 470, 337],
      ["W 116th St", 188, 403],
      ["College Walk", 290, 403.5],
      ["W 115th St", 188, 466],
      ["W 114th St", 330, 526],
      ["W 113th St", 330, 586],
      ["W 112th St", 330, 648],
      ["W 111th St", 330, 705],
      ["W 110th St", 330, 763],
      ["Broadway", 234, 590, 90],
      ["Amsterdam Ave", 426, 590, 90],
      ["Claremont Ave", 150, 300, 90],
      ["Riverside Dr", 86, 330, 90],
      ["Morningside Dr", 542, 420, 90],
    ] as [string, number, number, number?][]
  ).map(worldLabel),
  parks: (
    [
      ["Riverside Park", 60, 520, -90],
      ["Morningside Park", 578, 330, 90],
      ["Sakura Park", 121, 22],
    ] as [string, number, number, number?][]
  ).map(worldLabel),
};
