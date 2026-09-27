/**
 * Locally drawn illustration of Morningside Heights, from Riverside Park to
 * Morningside Park and 110th to 122nd St. Plain SVG — no tiles, no network.
 * Geometry lives in `campus-map-data.ts`; the SVG covers exactly the `WORLD`
 * rectangle, so map % positions line up with the art at any size.
 */

import {
  ART_BOUNDS,
  ART_VIEWBOX,
  BLOCKS,
  CAMPUS_BUILDINGS,
  CAMPUS_GROUNDS,
  CATHEDRAL,
  CATHEDRAL_GROUNDS,
  CURVED_ROADS,
  LAWNS,
  LOW_STEPS,
  MEDIANS,
  OFFCAMPUS_BUILDINGS,
  PARKS,
  PLAZA_CIRCLES,
  STREETS,
  TREES,
  WALKS,
  parkPoints,
  type Rect,
  type StreetSegment,
} from "./campus-map-data";

export function CampusMapArt() {
  return (
    <svg
      viewBox={ART_VIEWBOX}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      role="img"
      aria-label="Illustrated map of Columbia University's Morningside Heights campus"
    >
      <defs>
        <linearGradient id="cc-roof" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#DFE7F2" />
          <stop offset="1" stopColor="#C6D1E2" />
        </linearGradient>
        <linearGradient id="cc-roof-alt" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#D9E1ED" />
          <stop offset="1" stopColor="#C0CADB" />
        </linearGradient>
        <radialGradient id="cc-tree" cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#AFCF9B" />
          <stop offset="1" stopColor="#85B070" />
        </radialGradient>
        <radialGradient id="cc-tree-cool" cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#A9CA9C" />
          <stop offset="1" stopColor="#7CA97B" />
        </radialGradient>
      </defs>

      <rect {...box(ART_BOUNDS)} fill="var(--color-map-ground)" />

      <polygon points={parkPoints(PARKS.riverside)} fill="var(--color-map-lawn)" opacity={0.8} />
      <polygon points={parkPoints(PARKS.morningside)} fill="var(--color-map-lawn)" opacity={0.8} />

      {BLOCKS.map((b, i) => (
        <rect key={`blk-${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill="var(--color-map-walk)" />
      ))}
      <rect {...box(PARKS.sakura)} rx={8} fill="var(--color-map-lawn)" />
      {CAMPUS_GROUNDS.map((g, i) => (
        <rect key={`cg-${i}`} {...box(g)} rx={10} fill="#F1EEE7" />
      ))}
      <rect {...box(CATHEDRAL_GROUNDS)} rx={10} fill="var(--color-map-lawn)" opacity={0.85} />

      <CurvedRoad points={CURVED_ROADS.riverside} />
      <CurvedRoad points={CURVED_ROADS.morningside} />
      {STREETS.map((s, i) => (
        <Street key={`st-${i}`} {...s} />
      ))}
      {MEDIANS.map((m, i) => (
        <rect key={`med-${i}`} {...box(m)} rx={6} fill="var(--color-map-lawn)" />
      ))}

      {WALKS.map((walk, i) => (
        <rect key={`walk-${i}`} {...box(walk)} fill="#F7F4EE" />
      ))}

      {LAWNS.map((lawn, i) => (
        <rect key={`lawn-${i}`} {...box(lawn)} rx={8} fill="var(--color-map-lawn)" />
      ))}

      {/* Low Steps terracing */}
      <g opacity={0.55}>
        {Array.from({ length: LOW_STEPS.count }).map((_, i) => (
          <rect
            key={`step-${i}`}
            x={LOW_STEPS.x}
            y={LOW_STEPS.y + i * LOW_STEPS.step}
            width={LOW_STEPS.w}
            height={5}
            rx={2.5}
            fill="#DBD6CC"
          />
        ))}
      </g>

      {PLAZA_CIRCLES.map((c, i) => (
        <circle key={`pc-${i}`} {...c} fill="#EFEBE3" stroke="#DDD8CF" strokeWidth={2} />
      ))}

      {[...OFFCAMPUS_BUILDINGS, ...CAMPUS_BUILDINGS, ...CATHEDRAL].map((b, i) => (
        <Building key={`b-${i}`} {...b} />
      ))}

      {TREES.map((t, i) => (
        <g key={`t-${i}`}>
          <ellipse
            cx={t.x + 1.5}
            cy={t.y + t.r * 0.6}
            rx={t.r * 0.85}
            ry={t.r * 0.4}
            fill="#0F2547"
            opacity={0.055}
          />
          <circle cx={t.x} cy={t.y} r={t.r} fill={t.tone > 0.55 ? "url(#cc-tree-cool)" : "url(#cc-tree)"} />
          <circle cx={t.x - t.r * 0.26} cy={t.y - t.r * 0.28} r={t.r * 0.44} fill="#C2DBAC" opacity={0.5} />
        </g>
      ))}
    </svg>
  );
}

const box = ({ x, y, w, h }: Rect) => ({ x, y, width: w, height: h });

function CurvedRoad({ points }: { points: string }) {
  const common = { points, fill: "none", strokeLinejoin: "round", strokeLinecap: "butt" } as const;
  return (
    <g>
      <polyline {...common} stroke="var(--color-map-street-line)" strokeWidth={CURVED_ROADS.width} />
      <polyline {...common} stroke="var(--color-map-street)" strokeWidth={CURVED_ROADS.width - 4} />
      <polyline {...common} stroke="#F8F9FA" strokeWidth={2} />
    </g>
  );
}

function Street({ x, y, w, h, vertical = false }: StreetSegment) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--color-map-street)" />
      {vertical ? (
        <>
          <rect x={x + w / 2 - 1} y={y} width={2} height={h} fill="#F8F9FA" />
          <rect x={x} y={y} width={2} height={h} fill="var(--color-map-street-line)" />
          <rect x={x + w - 2} y={y} width={2} height={h} fill="var(--color-map-street-line)" />
        </>
      ) : (
        <>
          <rect x={x} y={y + h / 2 - 1} width={w} height={2} fill="#F8F9FA" />
          <rect x={x} y={y} width={w} height={2} fill="var(--color-map-street-line)" />
          <rect x={x} y={y + h - 2} width={w} height={2} fill="var(--color-map-street-line)" />
        </>
      )}
    </g>
  );
}

function Building({ x, y, w, h, alt = false, dome = false }: Rect) {
  const cols = Math.max(2, Math.round(w / 30));
  const rows = Math.max(1, Math.round(h / 34));
  const pad = 10;
  const stepX = (w - pad * 2) / cols;
  const stepY = (h - pad * 2) / rows;

  return (
    <g>
      <rect x={x + 4} y={y + 5} width={w} height={h} rx={4} fill="#0F2547" opacity={0.1} />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill={alt ? "url(#cc-roof-alt)" : "url(#cc-roof)"}
        stroke="var(--color-map-building-edge)"
        strokeWidth={1.6}
      />
      <rect x={x + 7} y={y + 7} width={w - 14} height={h - 14} rx={3} fill={alt ? "#CBD4E3" : "#D2DCEA"} />
      {dome ? (
        <>
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.3} fill="url(#cc-roof)" stroke="var(--color-map-building-edge)" strokeWidth={1.6} />
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.12} fill="#B5C7E1" opacity={0.7} />
        </>
      ) : (
        <g opacity={alt ? 0.55 : 0.68}>
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((_, c) => (
              <rect
                key={`${r}-${c}`}
                x={x + pad + c * stepX + stepX * 0.22}
                y={y + pad + r * stepY + stepY * 0.3}
                width={stepX * 0.46}
                height={stepY * 0.3}
                rx={1.2}
                fill="#B5C7E1"
              />
            )),
          )}
        </g>
      )}
    </g>
  );
}
