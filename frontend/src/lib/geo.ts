/**
 * Coordinate systems for the illustrated campus map.
 *
 * - World units: the coordinate space of Columbia's Morningside campus map PDF
 *   (612 × 792 points, streets drawn left–right, avenues top–bottom). The map
 *   art is authored in these units.
 * - Map points: % of the drawn world rectangle (`WORLD`), used to position
 *   markers, labels and the user's location dot on the map layer.
 * - Lat/lng: real coordinates, related to world units by an affine transform
 *   fitted (least squares) to the OpenStreetMap positions of 22 campus
 *   buildings — 8.5 m RMS error, with the street grid at −29.5° as in reality.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapPoint {
  /** % of map width */
  x: number;
  /** % of map height */
  y: number;
}

/** A position in the reference map's own units. */
export interface WorldPoint {
  x: number;
  y: number;
}

/** Riverside Park to Morningside Park, north of 122nd St to south of 110th St. */
export const WORLD = { x: 40, y: 10, width: 560, height: 780 } as const;

export function worldToMap({ x, y }: WorldPoint): MapPoint {
  return {
    x: ((x - WORLD.x) / WORLD.width) * 100,
    y: ((y - WORLD.y) / WORLD.height) * 100,
  };
}

export function mapToWorld({ x, y }: MapPoint): WorldPoint {
  return {
    x: WORLD.x + (x / 100) * WORLD.width,
    y: WORLD.y + (y / 100) * WORLD.height,
  };
}

const ORIGIN: LatLng = { lat: 40.8075, lng: -73.962 };
const METERS_PER_DEG_LAT = 111_320;
const METERS_PER_DEG_LNG = METERS_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** metres east / north of ORIGIN = [a b; d e] · world + [c; f] */
const A = 1.192824;
const B = -0.656802;
const C = -166.11388;
const D = -0.675222;
const E = -1.165088;
const F = 678.63069;
const DET = A * E - B * D;

function worldToMeters({ x, y }: WorldPoint) {
  return { east: A * x + B * y + C, north: D * x + E * y + F };
}

export function mapToGeo(point: MapPoint): LatLng {
  const { east, north } = worldToMeters(mapToWorld(point));
  return {
    lat: ORIGIN.lat + north / METERS_PER_DEG_LAT,
    lng: ORIGIN.lng + east / METERS_PER_DEG_LNG,
  };
}

export function geoToMap({ lat, lng }: LatLng): MapPoint {
  const east = (lng - ORIGIN.lng) * METERS_PER_DEG_LNG - C;
  const north = (lat - ORIGIN.lat) * METERS_PER_DEG_LAT - F;
  return worldToMap({
    x: (E * east - B * north) / DET,
    y: (A * north - D * east) / DET,
  });
}

/** True when a point falls inside the drawn map area. */
export function isOnMap({ x, y }: MapPoint): boolean {
  return x >= 0 && x <= 100 && y >= 0 && y <= 100;
}

/** Straight-line distance between two map points, in metres. */
export function metersBetween(a: MapPoint, b: MapPoint): number {
  const p = worldToMeters(mapToWorld(a));
  const q = worldToMeters(mapToWorld(b));
  return Math.hypot(p.east - q.east, p.north - q.north);
}

/** Approximate walking time between two map points (~80 m per minute). */
export function walkingMinutes(a: MapPoint, b: MapPoint): number {
  return Math.max(1, Math.round(metersBetween(a, b) / 80));
}
