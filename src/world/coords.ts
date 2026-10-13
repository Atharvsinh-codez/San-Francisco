// Shared Local ENU Coordinate System for SF 3D
// Origin: San Francisco City Hall (37.7793° N, -122.4193° W)
// Three.js Right-Handed Frame: +X = East (m), +Y = Up (m), -Z = North (+Z = South, m)

export type VisualMode = 'satellite' | 'vector';

export const ORIGIN_LAT = 37.7793;
export const ORIGIN_LON = -122.4193;

// WGS84 ellipsoid exact radii of curvature at 37.7793° N
export const METERS_PER_DEG_LAT = 110992.06;
export const METERS_PER_DEG_LON = 88083.39;

// Core SF + Golden Gate + Marin Headlands + Alcatraz + Treasure Island + Bay Bridge bounds
// In ENU meters relative to City Hall:
// West: -10,500 m (~ -122.5385°, past Ocean Beach & Point Bonita)
// East: +9,500 m (~ -122.3114°, past Treasure Island / East Bay touchdown)
// South: +9,000 m in Z (~ 37.6982°, Daly City / San Bruno Mountain)
// North: -11,000 m in Z (~ 37.8784°, Marin Headlands / Sausalito / Tiburon)
export const WORLD_BOUNDS = {
  minX: -10500,
  maxX: 9500,
  minZ: -11000, // North
  maxZ: 9000,   // South
  width: 20000,
  height: 20000,
  minLat: 37.6982,
  maxLat: 37.8784,
  minLon: -122.5385,
  maxLon: -122.3114,
};

// Far-field bounds (80 km x 80 km covering Peninsula, Marin, East Bay, Pacific Ocean)
export const FAR_BOUNDS = {
  minX: -40000,
  maxX: 40000,
  minZ: -40000,
  maxZ: 40000,
};

export interface LatLon {
  lat: number;
  lon: number;
}

export interface ENUPoint {
  x: number; // East (m)
  y: number; // Up (m)
  z: number; // South (m, -North)
}

export function latLonToENU(lat: number, lon: number, alt = 0): ENUPoint {
  const x = (lon - ORIGIN_LON) * METERS_PER_DEG_LON;
  const z = -(lat - ORIGIN_LAT) * METERS_PER_DEG_LAT;
  return { x, y: alt, z };
}

export function enuToLatLon(x: number, z: number): LatLon {
  const lon = ORIGIN_LON + x / METERS_PER_DEG_LON;
  const lat = ORIGIN_LAT - z / METERS_PER_DEG_LAT;
  return { lat, lon };
}

// Web Mercator slippy tile helpers (used for AWS Terrarium & ortho tile indexing)
export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, z)
  );
}

export function tileXToLon(tx: number, z: number): number {
  return (tx / Math.pow(2, z)) * 360 - 180;
}

export function tileYToLat(ty: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * ty) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Quantize floats to compact integer / 1-decimal representation for baked geometry
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
