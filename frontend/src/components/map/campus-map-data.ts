/**
 * Geometry for the illustrated campus map, authored in world units (the
 * Morningside campus map PDF, see `@/lib/geo`) and traced from it: street
 * centrelines, block outlines and building footprints. `CampusMapArt` draws
 * everything `ART_SCALE` times larger so strokes and window grids keep the
 * proportions of the original illustration.
 */

import { WORLD } from "@/lib/geo";

export const ART_SCALE = 4;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Softer fill for off-campus buildings. */
  alt?: boolean;
  /** Draws a dome on the roof (Low Library). */
  dome?: boolean;
}

type Pt = [number, number];

/** Rect from world-unit corners, in art units. */
const r = (x0: number, y0: number, x1: number, y1: number, extra: Partial<Rect> = {}): Rect => ({
  x: x0 * ART_SCALE,
  y: y0 * ART_SCALE,
  w: (x1 - x0) * ART_SCALE,
  h: (y1 - y0) * ART_SCALE,
  ...extra,
});

const TOP = WORLD.y - 20;
const BOTTOM = WORLD.y + WORLD.height + 20;
const LEFT = WORLD.x - 20;
const RIGHT = WORLD.x + WORLD.width + 20;

/** Street centrelines (world y). */
export const STREET_Y = {
  122: 43,
  121: 99,
  120: 163,
  119: 222,
  118: 283,
  117: 337,
  116: 403,
  115: 466,
  114: 526,
  113: 586,
  112: 648,
  111: 705,
  110: 763,
} as const;

const HALF_STREET = 5;
const CLAREMONT = 150;
const BROADWAY = { x0: 213, x1: 239, median: [222, 229] } as const;
const AMSTERDAM = { x0: 419, x1: 433 } as const;

/** Riverside Dr and Morningside Dr bend with the parks, so they are polylines. */
const RIVERSIDE: Pt[] = [
  [87, TOP],
  [87, 280],
  [84, 400],
  [88, 500],
  [100, 620],
  [114, BOTTOM],
];
const MORNINGSIDE: Pt[] = [
  [486, TOP],
  [512, 43],
  [535, 92],
  [542, 140],
  [542, 480],
  [548, 528],
  [574, 572],
  [640, 660],
];
const CURVED_ROAD_WIDTH = 11;

function xAt(line: Pt[], y: number): number {
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    if (y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1);
  }
  return line[line.length - 1][0];
}

const westEdge = (y: number) => xAt(RIVERSIDE, y) + CURVED_ROAD_WIDTH / 2 + 1;
const eastEdge = (y: number) => xAt(MORNINGSIDE, y) - CURVED_ROAD_WIDTH / 2 - 1;

const scaled = (line: Pt[]) => line.map(([x, y]) => `${x * ART_SCALE},${y * ART_SCALE}`).join(" ");
export const CURVED_ROADS = {
  width: CURVED_ROAD_WIDTH * ART_SCALE,
  riverside: scaled(RIVERSIDE),
  morningside: scaled(MORNINGSIDE),
};

export interface StreetSegment extends Rect {
  vertical?: boolean;
}

const hStreet = (y: number, x0: number, x1: number): StreetSegment =>
  r(x0, y - HALF_STREET, x1, y + HALF_STREET);
const S = STREET_Y;

export const STREETS: StreetSegment[] = [
  hStreet(S[122], 87, 520),
  hStreet(S[121], BROADWAY.x0, 540),
  hStreet(S[120], 87, 542),
  hStreet(214, 87, CLAREMONT),
  hStreet(S[119], AMSTERDAM.x0, 542),
  hStreet(S[118], AMSTERDAM.x0, 542),
  hStreet(S[116], 84, BROADWAY.x1),
  hStreet(S[116], AMSTERDAM.x0, 542),
  hStreet(S[115], 84, BROADWAY.x1),
  hStreet(S[115], AMSTERDAM.x0, 544),
  hStreet(S[114], 88, 548),
  hStreet(S[113], 95, 566),
  hStreet(S[112], 100, AMSTERDAM.x1),
  hStreet(S[111], 105, AMSTERDAM.x1),
  hStreet(S[110], 110, RIGHT),
  { ...r(CLAREMONT - 5, TOP, CLAREMONT + 5, S[116] + HALF_STREET), vertical: true },
  { ...r(BROADWAY.x0, TOP, BROADWAY.x1, BOTTOM), vertical: true },
  { ...r(AMSTERDAM.x0, TOP, AMSTERDAM.x1, BOTTOM), vertical: true },
];

const streetGaps = [S[122], S[121], S[120], 214, S[116], S[115], S[114], S[113], S[112], S[111], S[110]];
/** Broadway's planted median, broken at each crossing. */
export const MEDIANS: Rect[] = [TOP, ...streetGaps].map((y, i, all) => {
  const next = all[i + 1] ?? BOTTOM;
  return r(BROADWAY.median[0], y + (i === 0 ? 0 : 8), BROADWAY.median[1], next - 8);
});

/** Pedestrian walks on the campus superblock. */
export const WALKS: Rect[] = [
  r(BROADWAY.x1, 398, AMSTERDAM.x0, 409), // College Walk
  r(433, 334, 537, 340), // W 117th St is a walk east of Amsterdam
  r(300, 366, 360, 397), // Low Plaza
  r(327, 409, 333, 481), // South Field centre walk
  r(262, 297, 400, 301),
  r(300, 206, 360, 212),
  r(360, 405, 419, 432),
];

/** Sidewalk-coloured city blocks between the streets. */
export const BLOCKS: Rect[] = [];
/** Campus superblocks, drawn in the lighter plaza colour. */
export const CAMPUS_GROUNDS: Rect[] = [
  r(BROADWAY.x1, 168, AMSTERDAM.x0, 398),
  r(BROADWAY.x1, 409, AMSTERDAM.x0, 521),
  r(433, 288, eastEdge(340), 398),
];

const block = (x0: number, y0: number, x1: number, y1: number) => {
  BLOCKS.push(r(x0, y0, x1, y1));
  return [x0, y0, x1, y1] as const;
};

// Rows of blocks, north to south. Returned corners seed generated buildings.
const west = (y0: number, y1: number, east = 145) => block(westEdge((y0 + y1) / 2), y0, east, y1);
const colB = (y0: number, y1: number) => block(155, y0, BROADWAY.x0, y1);
const colC = (y0: number, y1: number) => block(BROADWAY.x1, y0, AMSTERDAM.x0, y1);
const colD = (y0: number, y1: number) => block(AMSTERDAM.x1, y0, eastEdge((y0 + y1) / 2), y1);

const generated: (readonly [number, number, number, number])[] = [];
const auto = (corners: readonly [number, number, number, number]) => generated.push(corners);

block(westEdge(20), TOP, 145, 38);
auto(colB(TOP, 38));
auto(colC(TOP, 38));
auto(block(AMSTERDAM.x1, TOP, 490, 38));
west(48, 158);
colB(48, 158);
colC(48, 94);
colD(48, 94);
colC(104, 158);
colD(104, 158);
west(168, 209);
auto(west(219, 398));
colB(168, 398);
colD(168, 217);
colD(227, 278);
const westAB = (y0: number, y1: number) => block(westEdge((y0 + y1) / 2), y0, BROADWAY.x0, y1);
westAB(408, 461);
colD(408, 461);
auto(westAB(471, 521));
colD(471, 521);
auto(westAB(531, 581));
colC(531, 581);
auto(colD(531, 581));
auto(westAB(591, 643));
colC(591, 643);
auto(westAB(653, 700));
colC(653, 700);
auto(westAB(710, 758));
colC(710, 758);
auto(westAB(768, BOTTOM));
auto(colC(768, BOTTOM));
auto(block(AMSTERDAM.x1, 768, RIGHT, BOTTOM));

/** Cathedral close, from Amsterdam Ave to Morningside Dr. */
export const CATHEDRAL_GROUNDS = r(AMSTERDAM.x1, 591, RIGHT, 758);

export const PARKS = {
  riverside: [
    [LEFT, TOP],
    ...RIVERSIDE.map(([x, y]) => [x - CURVED_ROAD_WIDTH / 2 - 1, y] as Pt),
    [LEFT, BOTTOM],
  ] as Pt[],
  morningside: [
    ...MORNINGSIDE.map(([x, y]) => [x + CURVED_ROAD_WIDTH / 2 + 1, y] as Pt),
    [RIGHT + 60, 660],
    [RIGHT + 60, TOP],
  ] as Pt[],
  sakura: r(99, TOP, 143, 34),
};

export const parkPoints = (pts: Pt[]) => scaled(pts);

export const LAWNS: Rect[] = [
  r(264, 436, 325, 477), // South Field West
  r(335, 436, 362, 477), // South Field East
  r(368, 436, 396, 465), // Van Am Quad
  r(368, 470, 396, 498),
  r(262, 302, 300, 318),
  r(283, 336, 302, 372),
  r(358, 340, 399, 376),
  r(262, 203, 300, 224),
  r(245, 395.5, 322, 397.6),
  r(338, 395.5, 415, 397.6),
  r(245, 409.8, 322, 412),
  r(338, 409.8, 415, 412),
  r(169, 183, 201, 204), // Milbank quad
  r(184, 258, 211, 302), // Barnard lawn
  r(171, 360, 199, 373),
  r(170, 62, 196, 136), // Union Theological Seminary quad
  r(476, 318, 495, 340),
  r(472, 344, 502, 394),
  r(262, 108, 298, 136), // Teachers College courtyard
];

/** Columbia and affiliated buildings, traced from the campus map. */
export const CAMPUS_BUILDINGS: Rect[] = [
  // North campus
  r(243, 172, 261, 222), // Northwest Corner
  r(263, 179, 302, 199), // Pupin
  r(306, 180, 352, 204), // Schapiro CEPSR
  r(356, 180, 414, 199), // Mudd
  r(366, 200, 384, 236), // Fairchild
  r(400, 202, 414, 266), // Computer Science
  r(243, 226, 259, 250), // Chandler
  r(243, 252, 298, 272), // Havemeyer
  r(306, 214, 356, 238), // University Hall
  r(304, 240, 358, 277), // Uris
  r(368, 250, 411, 272), // Schermerhorn
  r(243, 280, 258, 313), // Mathematics
  r(366, 278, 383, 314), // Avery
  r(400, 276, 415, 316), // Fayerweather
  r(256, 319, 279, 333), // Earl
  r(243, 336, 258, 372), // Lewisohn
  r(306, 302, 352, 350, { dome: true }), // Low Library
  r(377, 316, 408, 336), // St. Paul's Chapel
  r(364, 344, 376, 358), // Buell
  r(401, 339, 415, 374), // Philosophy
  r(368, 379, 415, 393), // Kent
  r(243, 379, 291, 395), // Dodge Hall
  // South campus
  r(244, 416, 290, 429), // Pulitzer
  r(244, 433, 258, 467), // Furnald
  r(243, 473, 290, 502), // Lerner
  r(243, 504, 290, 520), // Carman
  r(300, 481, 359, 519), // Butler Library
  r(368, 415, 415, 428), // Hamilton
  r(400, 433, 415, 467), // Hartley
  r(400, 470, 415, 496), // Wallach
  r(369, 502, 415, 520), // John Jay
  // Barnard College
  r(160, 170, 210, 181),
  r(160, 181, 168, 205),
  r(202, 181, 210, 205),
  r(160, 222, 178, 255),
  r(190, 222, 210, 255),
  r(160, 262, 178, 300),
  r(160, 305, 196, 342),
  r(160, 344, 205, 358),
  r(160, 358, 170, 392),
  r(170, 376, 200, 392),
  r(202, 370, 210, 392),
  // Teachers College
  r(241, 104, 258, 152),
  r(258, 104, 300, 118),
  r(300, 104, 330, 118),
  r(330, 104, 386, 118),
  r(258, 138, 310, 156),
  r(318, 140, 360, 156),
  r(362, 138, 386, 156),
  r(392, 104, 414, 156),
  r(434, 108, 450, 124),
  // Union Theological Seminary and Riverside Church
  r(162, 51, 205, 60),
  r(158, 60, 168, 155),
  r(198, 60, 211, 155),
  r(168, 139, 198, 155),
  r(118, 52, 142, 110),
  r(97, 116, 135, 133),
  // East of Amsterdam
  r(434, 48, 458, 80), // School of Social Work
  r(458, 60, 482, 94), // Lenfest
  r(441, 173, 534, 212),
  r(494, 228, 534, 246), // Butler Hall
  r(441, 248, 534, 276),
  r(444, 292, 487, 311), // International Affairs
  r(502, 283, 532, 290),
  r(497, 291, 533, 331), // East Campus
  r(434, 310, 448, 332), // Casa Italiana
  r(441, 342, 469, 391), // Greene Hall (Law)
  r(504, 352, 516, 392), // Wien
  r(519, 346, 535, 366), // Faculty House
  r(519, 373, 531, 392),
  r(441, 412, 503, 458),
  r(505, 412, 535, 458),
  // West of Broadway, 116th–114th
  r(120, 410, 211, 425),
  r(95, 433, 150, 461),
  r(152, 427, 211, 461),
  r(150, 474, 180, 500), // Watson
  r(182, 474, 196, 496),
  // Morningside residences south of 114th
  r(241, 533, 265, 548),
  r(267, 533, 360, 552),
  r(362, 533, 417, 552),
  r(241, 594, 268, 640),
  r(270, 594, 360, 612),
  r(270, 620, 360, 640),
  r(241, 656, 290, 690),
  r(300, 656, 360, 672),
  r(362, 656, 390, 696),
  r(290, 716, 306, 740),
  r(346, 716, 370, 740),
];

/** Off-campus buildings: a few soft blocks inside each generic city block. */
export const OFFCAMPUS_BUILDINGS: Rect[] = [
  r(99, 170, 143, 208, { alt: true }), // Interchurch Center
  r(100, 136, 116, 152, { alt: true }),
  r(160, TOP, 211, 36, { alt: true }), // Manhattan School of Music
  r(436, 474, 500, 518, { alt: true }), // Mount Sinai Morningside
  r(502, 474, 520, 518, { alt: true }),
  r(522, 477, 545, 500, { alt: true }),
  r(270, 716, 288, 740, { alt: true }),
  r(308, 716, 344, 740, { alt: true }),
  r(241, 716, 268, 756, { alt: true }),
  r(372, 716, 417, 756, { alt: true }),
  r(270, 742, 370, 756, { alt: true }),
  r(362, 594, 417, 640, { alt: true }),
  r(392, 656, 417, 696, { alt: true }),
  r(300, 674, 360, 696, { alt: true }),
  r(241, 692, 298, 698, { alt: true }),
  r(241, 554, 417, 578, { alt: true }),
  r(198, 474, 211, 518, { alt: true }),
  r(westEdge(495) + 2, 474, 148, 518, { alt: true }),
  r(150, 502, 196, 518, { alt: true }),
  r(484, 60, 530, 94, { alt: true }),
  r(441, 128, 530, 156, { alt: true }),
  r(452, 106, 530, 126, { alt: true }),
  r(244, 50, 414, 92, { alt: true }),
  ...generated.flatMap(([x0, y0, x1, y1]) => fill(x0, y0, x1, y1)),
].filter((b) => b.w > 0 && b.h > 0);

/** Splits a city block into two rows of alt buildings. */
function fill(x0: number, y0: number, x1: number, y1: number): Rect[] {
  const inset = 3;
  const gap = 3;
  const w = x1 - x0 - inset * 2;
  const h = y1 - y0 - inset * 2;
  if (w < 12 || h < 12) return [];
  const rows = h > 60 ? 3 : h > 28 ? 2 : 1;
  const cols = Math.max(1, Math.round(w / 42));
  const bw = (w - gap * (cols - 1)) / cols;
  const bh = (h - gap * (rows - 1)) / rows;
  const out: Rect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // The middle row stays open like a rear courtyard on wide blocks.
      if (rows === 3 && row === 1 && col > 0 && col < cols - 1) continue;
      const bx = x0 + inset + col * (bw + gap);
      const by = y0 + inset + row * (bh + gap);
      out.push(r(bx, by, bx + bw, by + bh, { alt: true }));
    }
  }
  return out;
}

/** The cathedral: nave, transept and apse. */
export const CATHEDRAL: Rect[] = [
  r(452, 624, 556, 652),
  r(500, 606, 528, 670),
  r(556, 628, 566, 648),
];

export const LOW_STEPS = { x: 310 * ART_SCALE, y: 351 * ART_SCALE, w: 40 * ART_SCALE, step: 3 * ART_SCALE, count: 5 };
export const PLAZA_CIRCLES = [
  { cx: 330 * ART_SCALE, cy: 368 * ART_SCALE, r: 4.5 * ART_SCALE }, // Alma Mater
  { cx: 330 * ART_SCALE, cy: 417 * ART_SCALE, r: 2.5 * ART_SCALE }, // Sundial
  { cx: 391 * ART_SCALE, cy: 467 * ART_SCALE, r: 2.5 * ART_SCALE },
];

/** Deterministic pseudo-random tree placement (stable across SSR + client). */
function buildTrees() {
  let seed = 20260410;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const trees: Array<{ x: number; y: number; r: number; tone: number }> = [];
  const plant = (x: number, y: number, jitter: number) =>
    trees.push({
      x: (x + (rand() - 0.5) * jitter) * ART_SCALE,
      y: (y + (rand() - 0.5) * jitter) * ART_SCALE,
      r: 7 + rand() * 7,
      tone: rand(),
    });

  // Street trees on both sidewalks, with gaps so rows read as plantings.
  const lanes: Array<[number, number, number, number, number]> = [];
  for (const street of STREETS) {
    const [x0, y0, x1, y1] = [street.x, street.y, street.x + street.w, street.y + street.h].map((v) => v / ART_SCALE);
    if (street.vertical) {
      lanes.push([x0 - 3.5, Math.max(y0, TOP), x0 - 3.5, Math.min(y1, BOTTOM), 11]);
      lanes.push([x1 + 3.5, Math.max(y0, TOP), x1 + 3.5, Math.min(y1, BOTTOM), 11]);
    } else {
      lanes.push([x0, y0 - 3.5, Math.min(x1, RIGHT), y0 - 3.5, 11]);
      lanes.push([x0, y1 + 3.5, Math.min(x1, RIGHT), y1 + 3.5, 11]);
    }
  }
  // Campus rows along the walks and lawns.
  lanes.push(
    [245, 394, 415, 394, 8],
    [245, 414, 415, 414, 8],
    [262, 433, 398, 433, 8],
    [262, 479, 362, 479, 8],
    [398, 436, 398, 498, 8],
    [262, 200, 300, 200, 8],
    [304, 293, 400, 293, 9],
    [262, 376, 298, 376, 8],
    [362, 376, 398, 376, 8],
    [440, 339, 535, 339, 8],
  );
  for (const [x0, y0, x1, y1, spacing] of lanes) {
    const count = Math.round(Math.hypot(x1 - x0, y1 - y0) / spacing);
    for (let i = 0; i < count; i++) {
      if (rand() < 0.22) continue;
      const t = (i + 0.5) / count;
      plant(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 4);
    }
  }

  // Parks: scattered canopy.
  for (let y = TOP; y < BOTTOM; y += 11) {
    for (let x = LEFT; x < xAt(RIVERSIDE, y) - 9; x += 11) if (rand() < 0.5) plant(x, y, 9);
    if (y < 650) for (let x = xAt(MORNINGSIDE, y) + 12; x < RIGHT; x += 11) if (rand() < 0.5) plant(x, y, 9);
  }
  for (let y = 598; y < 752; y += 12) {
    for (let x = 440; x < RIGHT; x += 12) {
      const onCathedral = x > 446 && x < 572 && y > 600 && y < 676;
      if (!onCathedral && rand() < 0.3) plant(x, y, 8);
    }
  }
  return trees;
}

export const TREES = buildTrees();

export const ART_BOUNDS = r(WORLD.x, WORLD.y, WORLD.x + WORLD.width, WORLD.y + WORLD.height);
export const ART_VIEWBOX = `${ART_BOUNDS.x} ${ART_BOUNDS.y} ${ART_BOUNDS.w} ${ART_BOUNDS.h}`;
