import { mapToGeo, metersBetween, worldToMap, type MapPoint } from "@/lib/geo";

/**
 * The one registry of named places on the campus map. Positions are authored
 * in world units (the Morningside campus map PDF) at each building's
 * footprint; map % and lat/lng are derived from them through `@/lib/geo`, so
 * markers, labels, directions and "near me" all agree.
 */
export interface CampusLocation {
  id: string;
  name: string;
  /** Other names people use; matched case- and punctuation-insensitively. */
  aliases: string[];
  address: string;
  /** % of the map layer */
  mapX: number;
  mapY: number;
  lat: number;
  lng: number;
  /** Map label; lower tiers only appear once the map is zoomed in. */
  label?: { text: string; tier: 1 | 2 | 3; x: number; y: number };
}

interface Entry {
  id: string;
  name: string;
  aliases?: string[];
  address: string;
  /** World units */
  at: [number, number];
  label?: { text?: string; tier: 1 | 2 | 3; at?: [number, number] };
}

const ENTRIES: Entry[] = [
  {
    id: "low-library",
    name: "Low Library",
    aliases: ["Low", "Low Memorial Library", "Low Library Rotunda"],
    address: "Low Memorial Library, 535 W 116th St",
    at: [329, 326],
    label: { tier: 1 },
  },
  {
    id: "low-steps",
    name: "Low Steps",
    aliases: ["Low Library Steps", "The Steps", "Steps of Low"],
    address: "Low Memorial Library steps, 535 W 116th St",
    at: [330, 360],
  },
  {
    id: "alma-mater",
    name: "Alma Mater",
    aliases: ["Alma Mater Statue"],
    address: "Low Plaza, 535 W 116th St",
    at: [330, 368],
  },
  {
    id: "college-walk",
    name: "College Walk",
    aliases: ["116th Street Walk"],
    address: "College Walk, W 116th St between Broadway and Amsterdam Ave",
    at: [330, 404],
  },
  {
    id: "butler-library",
    name: "Butler Library",
    aliases: ["Butler", "Nicholas Murray Butler Library"],
    address: "Butler Library, 535 W 114th St",
    at: [330, 500],
    label: { tier: 1 },
  },
  {
    id: "south-field",
    name: "South Field",
    aliases: ["South Lawn", "South Field Lawns"],
    address: "South Field, 116th St & Broadway",
    at: [330, 456],
    label: { tier: 2, at: [300, 456] },
  },
  {
    id: "lerner-hall",
    name: "Lerner Hall",
    aliases: ["Lerner", "Alfred Lerner Hall", "Lerner Student Center"],
    address: "Lerner Hall, 2920 Broadway",
    at: [267, 486],
    label: { tier: 1, at: [267, 489] },
  },
  {
    id: "carman-hall",
    name: "Carman Hall",
    aliases: ["Carman"],
    address: "Carman Hall, 545 W 114th St",
    at: [267, 511],
    label: { tier: 3 },
  },
  {
    id: "furnald-hall",
    name: "Furnald Hall",
    aliases: ["Furnald"],
    address: "Furnald Hall, 2940 Broadway",
    at: [251, 450],
    label: { text: "Furnald", tier: 3 },
  },
  {
    id: "pulitzer-hall",
    name: "Pulitzer Hall",
    aliases: ["Pulitzer", "Journalism School", "Columbia Journalism School"],
    address: "Pulitzer Hall, 2950 Broadway",
    at: [267, 422],
    label: { text: "Pulitzer", tier: 3 },
  },
  {
    id: "hamilton-hall",
    name: "Hamilton Hall",
    aliases: ["Hamilton"],
    address: "Hamilton Hall, 1130 Amsterdam Ave",
    at: [392, 422],
    label: { tier: 2 },
  },
  {
    id: "hartley-hall",
    name: "Hartley Hall",
    aliases: ["Hartley"],
    address: "Hartley Hall, 1124 Amsterdam Ave",
    at: [408, 450],
    label: { text: "Hartley", tier: 3 },
  },
  {
    id: "wallach-hall",
    name: "Wallach Hall",
    aliases: ["Wallach", "Livingston Hall"],
    address: "Wallach Hall, 1116 Amsterdam Ave",
    at: [408, 483],
    label: { text: "Wallach", tier: 3 },
  },
  {
    id: "john-jay-hall",
    name: "John Jay Hall",
    aliases: ["John Jay", "JJ's Place", "John Jay Dining Hall"],
    address: "John Jay Hall, 519 W 114th St",
    at: [392, 511],
    label: { text: "John Jay", tier: 2 },
  },
  {
    id: "dodge-hall",
    name: "Dodge Hall",
    aliases: ["Miller Theatre", "Dodge Hall Miller Theatre"],
    address: "Dodge Hall, 2960 Broadway",
    at: [267, 387],
    label: { text: "Dodge Hall", tier: 3 },
  },
  {
    id: "earl-hall",
    name: "Earl Hall",
    aliases: ["Earl"],
    address: "Earl Hall, 2980 Broadway",
    at: [268, 326],
    label: { text: "Earl", tier: 3 },
  },
  {
    id: "kent-hall",
    name: "Kent Hall",
    aliases: ["Kent"],
    address: "Kent Hall, 1140 Amsterdam Ave",
    at: [392, 386],
    label: { text: "Kent", tier: 3 },
  },
  {
    id: "philosophy-hall",
    name: "Philosophy Hall",
    aliases: ["Philosophy"],
    address: "Philosophy Hall, 1150 Amsterdam Ave",
    at: [408, 357],
  },
  {
    id: "st-pauls-chapel",
    name: "St. Paul's Chapel",
    aliases: ["St Pauls Chapel", "Saint Paul's Chapel", "St. Paul's"],
    address: "St. Paul's Chapel, 1160 Amsterdam Ave",
    at: [392, 326],
    label: { text: "St. Paul's", tier: 3 },
  },
  {
    id: "avery-hall",
    name: "Avery Hall",
    aliases: ["Avery", "Avery Library", "Avery Architectural and Fine Arts Library"],
    address: "Avery Hall, 1172 Amsterdam Ave",
    at: [375, 296],
    label: { text: "Avery", tier: 3 },
  },
  {
    id: "schermerhorn-hall",
    name: "Schermerhorn Hall",
    aliases: ["Schermerhorn"],
    address: "Schermerhorn Hall, 1190 Amsterdam Ave",
    at: [390, 261],
    label: { text: "Schermerhorn", tier: 2 },
  },
  {
    id: "uris-hall",
    name: "Uris Hall",
    aliases: ["Uris", "Uris Business School"],
    address: "Uris Hall, 3022 Broadway",
    at: [332, 242],
    label: { tier: 1 },
  },
  {
    id: "havemeyer-hall",
    name: "Havemeyer Hall",
    aliases: ["Havemeyer"],
    address: "Havemeyer Hall, 3000 Broadway",
    at: [272, 239],
    label: { text: "Havemeyer", tier: 3 },
  },
  {
    id: "mathematics-hall",
    name: "Mathematics Hall",
    aliases: ["Math Building", "Mathematics Building"],
    address: "Mathematics Hall, 2990 Broadway",
    at: [250, 291],
  },
  {
    id: "dodge-fitness-center",
    name: "Dodge Fitness Center",
    aliases: ["Dodge", "Dodge Gym", "Dodge Physical Fitness Center"],
    address: "Dodge Fitness Center, 3030 Broadway",
    at: [276, 214],
  },
  {
    id: "pupin-hall",
    name: "Pupin Hall",
    aliases: ["Pupin", "Pupin Physics Laboratories", "Pupin Labs"],
    address: "Pupin Hall, 550 W 120th St",
    at: [282, 189],
    label: { text: "Pupin", tier: 2 },
  },
  {
    id: "schapiro-cepsr",
    name: "Schapiro CEPSR",
    aliases: ["CEPSR", "Schapiro Center"],
    address: "Schapiro CEPSR, 530 W 120th St",
    at: [328, 192],
    label: { text: "CEPSR", tier: 3 },
  },
  {
    id: "mudd-building",
    name: "Mudd Building",
    aliases: ["Mudd", "Mudd Hall", "Seeley W. Mudd Building", "Seeley Mudd"],
    address: "Seeley W. Mudd Building, 500 W 120th St",
    at: [386, 190],
    label: { text: "Mudd", tier: 2 },
  },
  {
    id: "teachers-college",
    name: "Teachers College",
    aliases: ["TC", "Teachers College Columbia"],
    address: "Teachers College, 525 W 120th St",
    at: [330, 130],
    label: { tier: 1 },
  },
  {
    id: "barnard-college",
    name: "Barnard College",
    aliases: ["Barnard", "Barnard Hall"],
    address: "Barnard College, 3009 Broadway",
    at: [184, 300],
    label: { text: "Barnard\nCollege", tier: 1, at: [184, 282] },
  },
  {
    id: "international-affairs",
    name: "International Affairs Building",
    aliases: ["SIPA", "IAB", "International Affairs", "School of International and Public Affairs"],
    address: "International Affairs Building, 420 W 118th St",
    at: [465, 301],
    label: { text: "International\nAffairs", tier: 2 },
  },
  {
    id: "greene-hall",
    name: "Jerome L. Greene Hall",
    aliases: ["Greene Hall", "Law School", "Columbia Law School", "Jerome Greene Hall"],
    address: "Jerome L. Greene Hall, 435 W 116th St",
    at: [455, 366],
    label: { text: "Greene\n(Law)", tier: 2 },
  },
  {
    id: "faculty-house",
    name: "Faculty House",
    aliases: [],
    address: "Faculty House, 64 Morningside Dr",
    at: [524, 356],
    label: { text: "Faculty\nHouse", tier: 3 },
  },
  {
    id: "east-campus",
    name: "East Campus",
    aliases: ["East Campus Residence Hall"],
    address: "East Campus, 410 W 116th St",
    at: [515, 318],
    label: { tier: 3 },
  },
  {
    id: "riverside-church",
    name: "Riverside Church",
    aliases: ["The Riverside Church"],
    address: "Riverside Church, 490 Riverside Dr",
    at: [121, 100],
    label: { text: "Riverside\nChurch", tier: 2 },
  },
  {
    id: "union-theological-seminary",
    name: "Union Theological Seminary",
    aliases: ["Union Seminary", "UTS"],
    address: "Union Theological Seminary, 3041 Broadway",
    at: [187, 100],
    label: { text: "Union\nTheological\nSeminary", tier: 3 },
  },
  {
    id: "cathedral-st-john",
    name: "Cathedral of St. John the Divine",
    aliases: ["St. John the Divine", "Cathedral of Saint John the Divine", "The Cathedral"],
    address: "Cathedral of St. John the Divine, 1047 Amsterdam Ave",
    at: [505, 640],
    label: { text: "Cathedral of\nSt. John the Divine", tier: 1, at: [505, 690] },
  },
];

function toLocation({ at, label, aliases = [], ...entry }: Entry): CampusLocation {
  const point = worldToMap({ x: at[0], y: at[1] });
  const geo = mapToGeo(point);
  const labelAt = worldToMap({ x: (label?.at ?? at)[0], y: (label?.at ?? at)[1] });
  return {
    ...entry,
    aliases,
    mapX: point.x,
    mapY: point.y,
    lat: Number(geo.lat.toFixed(6)),
    lng: Number(geo.lng.toFixed(6)),
    label: label && { text: label.text ?? entry.name, tier: label.tier, x: labelAt.x, y: labelAt.y },
  };
}

export const CAMPUS_LOCATIONS: CampusLocation[] = ENTRIES.map(toLocation);

const BY_ID = new Map(CAMPUS_LOCATIONS.map((location) => [location.id, location]));

/** "St. Paul's Chapel!" -> "st pauls chapel" */
export function normalizeLocationText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

const BY_ALIAS = new Map<string, CampusLocation>();
for (const location of CAMPUS_LOCATIONS) {
  for (const name of [location.name, location.id.replace(/-/g, " "), ...location.aliases]) {
    BY_ALIAS.set(normalizeLocationText(name), location);
  }
}

export function getCampusLocation(id: string | null | undefined): CampusLocation | null {
  return (id && BY_ID.get(id)) || null;
}

/**
 * Exact alias lookup after normalising case and punctuation, e.g. "Lerner",
 * "Alfred Lerner Hall" and "lerner hall" all resolve to Lerner Hall. Text
 * after a comma or " - " (room numbers, addresses) is tried separately.
 * Deliberately no fuzzy matching: unknown places resolve to null.
 */
export function resolveCampusLocation(text: string | null | undefined): CampusLocation | null {
  if (!text) return null;
  const whole = BY_ALIAS.get(normalizeLocationText(text));
  if (whole) return whole;
  for (const part of text.split(/,| - | – | \| /)) {
    const match = BY_ALIAS.get(normalizeLocationText(part));
    if (match) return match;
  }
  return null;
}

/** The registry place closest to a map point, if it is within `maxMeters`. */
export function nearestCampusLocation(point: MapPoint, maxMeters = 30): CampusLocation | null {
  let best: CampusLocation | null = null;
  let bestDistance = maxMeters;
  for (const location of CAMPUS_LOCATIONS) {
    const distance = metersBetween(point, { x: location.mapX, y: location.mapY });
    if (distance <= bestDistance) {
      best = location;
      bestDistance = distance;
    }
  }
  return best;
}
