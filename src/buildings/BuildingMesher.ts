// Procedural 3D Building Mesher ported directly from jeantimex/tokyo/src/world/meshing.js
// Generates complete solid 3D buildings with:
// - Outward-facing walls with whole-number window bays and 4m foundation sink into hilly SF terrain
// - Pitched hipped & gabled roofs on residential houses (via minAreaRect)
// - Flat roofs recessed inside 4-sided parapets on commercial/apartment/mixed buildings
// - Rooftop equipment (stair/elevator penthouses, AC condenser rows, water tanks on frames, mechanical ducts)
// - Multi-floor balconies on apartment & mixed-use buildings

import earcut from 'earcut';
import { CAT, KIND, WALL } from '../world/constants';
import { latLonToENU } from '../world/coords';

const offsetENU = (p: { x: number; z: number }, dx: number, dz: number) => ({ x: p.x + dx, z: p.z + dz });

// Footprints replaced by dedicated landmark models (src/models/*); extruding them as generic
// blocks would bury the model inside a featureless slab.
const LANDMARK_EXCLUSIONS = [
  { ...latLonToENU(37.7786, -122.3893), r: 150 }, // Oracle Park
  // Salesforce stays tight: the Transit Center footprint centroid is only 29 m away and must survive.
  { ...latLonToENU(37.7897, -122.3969), r: 20 },  // Salesforce Tower
  { ...latLonToENU(37.7952, -122.4028), r: 34 },  // Transamerica Pyramid
  { ...latLonToENU(37.8024, -122.4058), r: 32 },  // Coit Tower
  // Palace of Fine Arts: rotunda plus the two colonnade wings; the exhibition hall (53 m west) is kept.
  { ...offsetENU(latLonToENU(37.8029, -122.4484), 0, 0), r: 40 },
  { ...offsetENU(latLonToENU(37.8029, -122.4484), 7, 59), r: 12 },
  { ...offsetENU(latLonToENU(37.8029, -122.4484), -12, -66), r: 12 },
  { ...latLonToENU(37.7955, -122.3937), r: 58 },  // Ferry Building
  { ...latLonToENU(37.7680, -122.3877), r: 95 },  // Chase Center
  { ...latLonToENU(37.7793, -122.4193), r: 68 },  // San Francisco City Hall
  { ...latLonToENU(37.7919, -122.4130), r: 52 },  // Grace Cathedral
  { ...latLonToENU(37.7763, -122.4328), r: 36 },  // Painted Ladies (Steiner St row)
];

function insideLandmarkExclusion(ring: number[]): boolean {
  let sx = 0;
  let sz = 0;
  const n = ring.length / 2;
  for (let k = 0; k < n; k++) {
    sx += ring[k * 2];
    sz += ring[k * 2 + 1];
  }
  sx /= n;
  sz /= n;
  for (const e of LANDMARK_EXCLUSIONS) {
    if (Math.hypot(sx - e.x, sz - e.z) < e.r) return true;
  }
  return false;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (rgb: number[]) => rgb.map(srgbToLinear);

function hash3(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

class Buf {
  public a: Float32Array;
  public length = 0;

  constructor(cap = 4096) {
    this.a = new Float32Array(cap);
  }

  public push(...v: number[]): void {
    const need = this.length + v.length;
    if (need > this.a.length) {
      let n = this.a.length;
      while (n < need) n *= 2;
      const b = new Float32Array(n);
      b.set(this.a);
      this.a = b;
    }
    this.a.set(v, this.length);
    this.length = need;
  }

  public done(): Float32Array {
    return this.a.subarray(0, this.length);
  }
}

// Wall finishes per category: [r, g, b, texture layer] from jeantimex/tokyo/src/world/meshing.js
const PALETTE: Record<number, number[][]> = {
  [CAT.HOUSE]: [
    [0.86, 0.83, 0.75, WALL.PLASTER],
    [0.9, 0.9, 0.87, WALL.PLASTER],
    [0.5, 0.4, 0.33, WALL.BRICK],
    [0.66, 0.66, 0.65, WALL.SIDING],
    [0.3, 0.33, 0.37, WALL.SIDING],
    [0.78, 0.72, 0.62, WALL.PLASTER],
    [0.82, 0.8, 0.74, WALL.SIDING],
    [0.42, 0.36, 0.32, WALL.SIDING],
  ],
  [CAT.APARTMENT]: [
    [0.9, 0.89, 0.85, WALL.TILE],
    [0.82, 0.77, 0.68, WALL.TILE],
    [0.55, 0.4, 0.31, WALL.BRICK],
    [0.72, 0.72, 0.7, WALL.PLASTER],
    [0.76, 0.66, 0.55, WALL.TILE],
    [0.62, 0.48, 0.38, WALL.BRICK],
  ],
  [CAT.MIXED]: [
    [0.84, 0.82, 0.78, WALL.TILE],
    [0.6, 0.45, 0.36, WALL.BRICK],
    [0.72, 0.72, 0.71, WALL.CONCRETE],
    [0.88, 0.84, 0.74, WALL.TILE],
  ],
  [CAT.COMMERCIAL]: [
    [0.68, 0.69, 0.7, WALL.CONCRETE],
    [0.86, 0.86, 0.84, WALL.TILE],
    [0.76, 0.71, 0.63, WALL.TILE],
    [0.34, 0.35, 0.37, WALL.CONCRETE],
    [0.56, 0.57, 0.59, WALL.CONCRETE],
    [0.8, 0.8, 0.79, WALL.PLASTER],
  ],
  [CAT.PUBLIC]: [
    [0.78, 0.76, 0.72, WALL.TILE],
    [0.64, 0.64, 0.62, WALL.CONCRETE],
    [0.7, 0.62, 0.54, WALL.BRICK],
  ],
  [CAT.GLASS]: [
    [0.5, 0.53, 0.56, WALL.CONCRETE],
    [0.62, 0.63, 0.64, WALL.CONCRETE],
    [0.32, 0.35, 0.38, WALL.CONCRETE],
  ],
};

const PITCHED_ROOFS = [
  [0.2, 0.21, 0.23],
  [0.22, 0.28, 0.36],
  [0.3, 0.22, 0.18],
  [0.42, 0.25, 0.2],
  [0.2, 0.28, 0.25],
  [0.34, 0.34, 0.35],
];

const BAY: Record<number, number> = {
  [CAT.HOUSE]: 3.4,
  [CAT.APARTMENT]: 3.3,
  [CAT.MIXED]: 3.2,
  [CAT.COMMERCIAL]: 3.0,
  [CAT.PUBLIC]: 3.4,
  [CAT.GLASS]: 1.5,
};

const SINK = 6.5; // Walls run 6.5m below base so buildings sit solidly on steep San Francisco hills

const AERIAL = 0.62;
const aerial = (c: number[]) => {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const to = 0.43 + 0.26 * Math.min(1, Math.max(0, (l - 0.3) / 0.6));
  const k = to / Math.max(l, 0.05);
  const grey = [to * 0.95, to * 1.01, to * 1.05];
  return c.map((v, i) => v * k + (grey[i] - v * k) * AERIAL);
};

// Positive area for CCW ring in (x, z) where +x is East and +z is South (-North)
function ringArea(r: number[]): number {
  let s = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  }
  return s / 2;
}

function insideRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2];
    const zi = r[i * 2 + 1];
    const xj = r[j * 2];
    const zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function edgeDistance(x: number, z: number, r: number[]): number {
  let best = Infinity;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = r[i * 2];
    const az = r[i * 2 + 1];
    const dx = r[j * 2] - ax;
    const dz = r[j * 2 + 1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

interface MinRect {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  a: number;
  b: number;
  area: number;
}

function minAreaRect(r: number[]): MinRect | null {
  const n = r.length / 2;
  let best: {
    area: number;
    dx: number;
    dz: number;
    u0: number;
    u1: number;
    v0: number;
    v1: number;
  } | null = null;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let dx = r[j * 2] - r[i * 2];
    let dz = r[j * 2 + 1] - r[i * 2 + 1];
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    dx /= len;
    dz /= len;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const u = r[k * 2] * dx + r[k * 2 + 1] * dz;
      const v = -r[k * 2] * dz + r[k * 2 + 1] * dx;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, dx, dz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { dx, dz, u0, u1, v0, v1 } = best;
  const uc = (u0 + u1) / 2;
  const vc = (v0 + v1) / 2;
  const cx = uc * dx - vc * dz;
  const cz = uc * dz + vc * dx;
  const hu = (u1 - u0) / 2;
  const hv = (v1 - v0) / 2;
  return hu >= hv
    ? { cx, cz, ax: dx, az: dz, a: hu, b: hv, area: best.area }
    : { cx, cz, ax: -dz, az: dx, a: hv, b: hu, area: best.area };
}

export interface MeshedBuildingCell {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  aFacade: Float32Array;
  aBldg: Float32Array;
  triangles: number;
}

export function meshBuildingCellBuffer(
  buffer: ArrayBuffer,
  centerX: number,
  centerZ: number,
  ix: number,
  iz: number,
  quant: number
): MeshedBuildingCell | null {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 4) return null;
  const numBuildings = dv.getUint32(0, true);
  if (numBuildings === 0) return null;

  const pos = new Buf(1 << 17);
  const nor = new Buf(1 << 17);
  const col = new Buf(1 << 17);
  const fac = new Buf(1 << 17);
  const bld = new Buf(1 << 17);

  let offset = 4;

  for (let i = 0; i < numBuildings; i++) {
    if (offset + 8 > buffer.byteLength) break;
    const base = dv.getInt16(offset, true) * 0.1;
    const height = dv.getUint16(offset + 2, true) * 0.1;
    const sampledR = dv.getUint8(offset + 4) / 255;
    const sampledG = dv.getUint8(offset + 5) / 255;
    const sampledB = dv.getUint8(offset + 6) / 255;
    const nVerts = dv.getUint8(offset + 7);
    offset += 8;

    if (offset + nVerts * 4 > buffer.byteLength) break;

    const outer: number[] = [];
    for (let k = 0; k < nVerts; k++) {
      const vx = centerX + dv.getInt16(offset, true) * quant;
      const vz = centerZ + dv.getInt16(offset + 2, true) * quant;
      offset += 4;
      outer.push(vx, vz);
    }

    if (nVerts < 3 || height < 1.5) continue;
    if (insideLandmarkExclusion(outer)) continue;

    // Guarantee CCW winding (ringArea > 0) so outward normal is always [-dz, 0, dx]
    let area = ringArea(outer);
    if (Math.abs(area) < 1.0) continue;
    if (area < 0) {
      const rev: number[] = [];
      for (let k = nVerts - 1; k >= 0; k--) {
        rev.push(outer[k * 2], outer[k * 2 + 1]);
      }
      for (let k = 0; k < rev.length; k++) outer[k] = rev[k];
      area = -area;
    }

    let kRnd = 0;
    const rnd = () => hash3(i * 31 + kRnd++, ix * 13 + 5, iz * 17 + 3);
    const seed = Math.floor(hash3(ix, iz, i) * 4096) / 4096;

    // Category classification matching jeantimex/tokyo
    let cat: number = CAT.HOUSE;
    if (height > 48 || (height > 26 && seed < 0.3)) {
      cat = CAT.GLASS;
    } else if (height > 19) {
      cat = seed < 0.75 ? CAT.COMMERCIAL : CAT.PUBLIC;
    } else if (height > 10.5) {
      cat = seed < 0.55 ? CAT.APARTMENT : CAT.MIXED;
    } else {
      cat = seed < 0.78 ? CAT.HOUSE : CAT.APARTMENT;
    }

    const pal = PALETTE[cat];
    const pick = pal[Math.floor(rnd() * pal.length)];
    const tone = 0.92 + 0.16 * rnd();
    const baseRgb = aerial(pick.slice(0, 3));
    const wallCol =
      cat === CAT.GLASS && height > 65
        ? lin([0.32 * tone, 0.37 * tone, 0.43 * tone])
        : lin([
            Math.min(1, (baseRgb[0] * 0.78 + sampledR * 0.22) * tone),
            Math.min(1, (baseRgb[1] * 0.78 + sampledG * 0.22) * tone),
            Math.min(1, (baseRgb[2] * 0.78 + sampledB * 0.22) * tone),
          ]);
    const wallLayer = pick[3];
    const top = base + height;
    const bottom = base - SINK;

    // Houses with a simple rectangular footprint get a pitched roof; everything else a flat roof with a parapet
    let roof: MinRect | null = null;
    let rise = 0;
    if (cat === CAT.HOUSE && height < 11.5 && nVerts <= 6 && rnd() < 0.45) {
      const rect = minAreaRect(outer);
      if (rect && area / rect.area > 0.78 && rect.b > 1.8) {
        rise = Math.min(2.5, rect.b * 0.48, height - 2.4);
        if (rise > 0.7) roof = rect;
      }
    }

    const wallTop = roof ? top - rise : top;
    const wallH = wallTop - base;
    const parapet = roof ? 0 : cat === CAT.HOUSE ? 0.3 : height > 30 ? 1.2 : 0.75;
    const floors = Math.max(1, Math.round(wallH / 3.2));
    const floorH = Math.min(6, Math.max(2.5, wallH / floors));

    const vtx = (
      x: number,
      y: number,
      z: number,
      n: number[],
      c: number[],
      u: number,
      v: number,
      kind: number,
      bay: number,
      layer: number
    ) => {
      pos.push(x, y, z);
      nor.push(n[0], n[1], n[2]);
      col.push(c[0], c[1], c[2]);
      fac.push(u, v, floorH, seed);
      bld.push(wallH, cat + 8 * layer, kind, bay);
    };

    const tri = (
      p: number[],
      q: number[],
      r: number[],
      ref: number[],
      c: number[],
      kind: number,
      layer: number
    ) => {
      const ux = q[0] - p[0];
      const uy = q[1] - p[1];
      const uz = q[2] - p[2];
      const vx = r[0] - p[0];
      const vy = r[1] - p[1];
      const vz = r[2] - p[2];
      let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      if (n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0) {
        [q, r] = [r, q];
        n = [-n[0], -n[1], -n[2]];
      }
      for (const s of [p, q, r]) {
        vtx(s[0], s[1], s[2], n, c, 0, s[1] - base, kind, 0, layer);
      }
    };

    const quad = (
      p: number[],
      q: number[],
      r: number[],
      s: number[],
      ref: number[],
      c: number[],
      kind: number,
      layer: number
    ) => {
      tri(p, q, r, ref, c, kind, layer);
      tri(p, r, s, ref, c, kind, layer);
    };

    const box = (
      cx: number,
      cz: number,
      y0: number,
      y1: number,
      hx: number,
      hz: number,
      dx: number,
      dz: number,
      c: number[],
      layer: number
    ) => {
      const P = (sx: number, sz: number, y: number) => [
        cx + dx * hx * sx - dz * hz * sz,
        y,
        cz + dz * hx * sx + dx * hz * sz,
      ];
      quad(P(-1, -1, y1), P(1, -1, y1), P(1, 1, y1), P(-1, 1, y1), [0, 1, 0], c, KIND.SOLID, layer);
      quad(P(-1, -1, y0), P(1, -1, y0), P(1, -1, y1), P(-1, -1, y1), [dz, 0, -dx], c, KIND.SOLID, layer);
      quad(P(-1, 1, y0), P(1, 1, y0), P(1, 1, y1), P(-1, 1, y1), [-dz, 0, dx], c, KIND.SOLID, layer);
      quad(P(1, -1, y0), P(1, 1, y0), P(1, 1, y1), P(1, -1, y1), [dx, 0, dz], c, KIND.SOLID, layer);
      quad(P(-1, -1, y0), P(-1, 1, y0), P(-1, 1, y1), P(-1, -1, y1), [-dx, 0, -dz], c, KIND.SOLID, layer);
    };

    // ---- Walls, parapet, flat roof
    const inner = wallCol.map((c) => c * 0.8);
    const flatRoof = lin(
      rnd() < 0.1
        ? [0.4, 0.45, 0.44]
        : (() => {
            const g = 0.46 + 0.16 * rnd();
            return [g * 0.96, g, g * 1.04];
          })()
    );
    let longest = { len: 0, dx: 1, dz: 0 };
    const fronts: {
      x0: number;
      z0: number;
      len: number;
      dx: number;
      dz: number;
      nrm: number[];
    }[] = [];

    for (let e = 0; e < nVerts; e++) {
      const x0 = outer[e * 2];
      const z0 = outer[e * 2 + 1];
      const x1 = outer[((e + 1) % nVerts) * 2];
      const z1 = outer[((e + 1) % nVerts) * 2 + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const dx = (x1 - x0) / len;
      const dz = (z1 - z0) / len;
      const nrm = [-dz, 0, dx]; // Outward normal for CCW outlines in (x, z)
      const bays = len < 1.8 ? 0 : Math.max(1, Math.round(len / BAY[cat]));
      const bay = bays ? len / bays : 0;
      const yT = wallTop + parapet;
      const vT = yT - base;

      vtx(x0, bottom, z0, nrm, wallCol, 0, -SINK, KIND.WALL, bay, wallLayer);
      vtx(x1, bottom, z1, nrm, wallCol, bays, -SINK, KIND.WALL, bay, wallLayer);
      vtx(x1, yT, z1, nrm, wallCol, bays, vT, KIND.WALL, bay, wallLayer);
      vtx(x0, bottom, z0, nrm, wallCol, 0, -SINK, KIND.WALL, bay, wallLayer);
      vtx(x1, yT, z1, nrm, wallCol, bays, vT, KIND.WALL, bay, wallLayer);
      vtx(x0, yT, z0, nrm, wallCol, 0, vT, KIND.WALL, bay, wallLayer);

      if (parapet && height > 22) {
        quad(
          [x0, wallTop, z0],
          [x1, wallTop, z1],
          [x1, yT, z1],
          [x0, yT, z0],
          [dz, 0, -dx],
          inner,
          KIND.SOLID,
          wallLayer
        );
      }
      if (len > longest.len) longest = { len, dx, dz };
      if (len >= 3.5) fronts.push({ x0, z0, len, dx, dz, nrm });
    }

    if (!roof) {
      const idx = earcut(outer, undefined, 2);
      const up = [0, 1, 0];
      for (let t = 0; t < idx.length; t += 3) {
        const i0 = idx[t];
        const i1 = idx[t + 1];
        const i2 = idx[t + 2];
        // earcut on CCW (x,z) produces (i0, i1, i2) with (x1-x0)*(z2-z0) - (z1-z0)*(x2-x0) > 0,
        // whose 3D cross product has ny = -cross2D < 0. Flip i1/i2 so normal is [0, +1, 0].
        for (const k of [i0, i2, i1]) {
          vtx(outer[k * 2], wallTop, outer[k * 2 + 1], up, flatRoof, 0, wallH, KIND.FLAT_ROOF, 0, WALL.ROOF);
        }
      }
    }

    // ---- Pitched roof over the bounding rectangle: hipped or gabled (jeantimex/tokyo)
    if (roof) {
      const { cx, cz, ax, az, a, b: hb } = roof;
      const sx = -az;
      const sz = ax;
      const over = 0.4;
      const c = lin(
        aerial(PITCHED_ROOFS[Math.floor(rnd() * PITCHED_ROOFS.length)]).map((v) => v * 0.8)
      );
      const eave = wallTop - (over * rise) / hb;
      const corner = (sa: number, sb: number) => [
        cx + ax * sa * (a + over) + sx * sb * (hb + over),
        eave,
        cz + az * sa * (a + over) + sz * sb * (hb + over),
      ];
      const hip = rnd() < 0.5 && a - hb > 0.3;
      const reach = hip ? a - hb : a + over;
      const r0 = [cx - ax * reach, top, cz - az * reach];
      const r1 = [cx + ax * reach, top, cz + az * reach];
      const up = [0, 1, 0];
      quad(corner(-1, 1), corner(1, 1), r1, r0, up, c, KIND.PITCHED_ROOF, WALL.SIDING);
      quad(corner(1, -1), corner(-1, -1), r0, r1, up, c, KIND.PITCHED_ROOF, WALL.SIDING);
      if (hip) {
        tri(corner(1, 1), corner(1, -1), r1, up, c, KIND.PITCHED_ROOF, WALL.SIDING);
        tri(corner(-1, -1), corner(-1, 1), r0, up, c, KIND.PITCHED_ROOF, WALL.SIDING);
      } else {
        for (const s of [-1, 1]) {
          const g = (sb: number) => [
            cx + ax * s * a + sx * sb * hb,
            wallTop,
            cz + az * s * a + sz * sb * hb,
          ];
          tri(
            g(-1),
            g(1),
            [cx + ax * s * a, top, cz + az * s * a],
            [ax * s, 0, az * s],
            wallCol,
            KIND.SOLID,
            wallLayer
          );
        }
      }
    }

    // ---- Rooftop equipment on flat roofs: stair/lift housing, AC condensers, water tanks, ducts
    const distSq = centerX * centerX + centerZ * centerZ;
    if (!roof && area > 145 && height > 15 && distSq < 11500000) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let e = 0; e < outer.length; e += 2) {
        x0 = Math.min(x0, outer[e]);
        x1 = Math.max(x1, outer[e]);
        z0 = Math.min(z0, outer[e + 1]);
        z1 = Math.max(z1, outer[e + 1]);
      }
      const place = (half: number): [number, number] | null => {
        for (let t = 0; t < 5; t++) {
          const x = x0 + rnd() * (x1 - x0);
          const z = z0 + rnd() * (z1 - z0);
          if (insideRing(x, z, outer) && edgeDistance(x, z, outer) > half + 0.7) return [x, z];
        }
        return null;
      };
      const { dx, dz } = longest;
      const grey = lin([0.74, 0.75, 0.75]);
      if (floors >= 5 && area > 160) {
        const hx = 1.6 + rnd() * 1.2;
        const hz = 1.5 + rnd() * 0.8;
        const p = place(Math.hypot(hx, hz));
        if (p) {
          box(p[0], p[1], wallTop, wallTop + 2.7 + rnd() * 0.9, hx, hz, dx, dz, wallCol, wallLayer);
        }
      }
      const count = Math.min(cat === CAT.GLASS ? 2 : 3, Math.floor(area / 240) + 1);
      for (let e = 0; e < count; e++) {
        const type = rnd();
        if (type < 0.6) {
          const units = 1 + Math.floor(rnd() * 2);
          const p = place(units * 0.6 + 0.3);
          if (p) {
            for (let u = 0; u < units; u++) {
              const off = (u - (units - 1) / 2) * 1.15;
              box(
                p[0] + dx * off,
                p[1] + dz * off,
                wallTop,
                wallTop + 0.95,
                0.48,
                0.24,
                dx,
                dz,
                grey,
                WALL.SIDING
              );
            }
          }
        } else if (type < 0.78 && cat !== CAT.GLASS) {
          const p = place(1.3);
          if (p) {
            box(p[0], p[1], wallTop + 0.7, wallTop + 2.7, 1.0, 1.0, dx, dz, lin([0.82, 0.82, 0.78]), WALL.PLASTER);
            box(p[0], p[1], wallTop, wallTop + 0.7, 0.8, 0.8, dx, dz, lin([0.4, 0.4, 0.4]), WALL.SIDING);
          }
        } else {
          const hx = 1 + rnd() * (cat === CAT.GLASS ? 3.0 : 1.4);
          const hz = 0.7 + rnd() * (cat === CAT.GLASS ? 2.2 : 0.8);
          const p = place(Math.hypot(hx, hz));
          if (p) {
            box(p[0], p[1], wallTop, wallTop + 1.1 + rnd() * 1.4, hx, hz, dx, dz, lin([0.6, 0.61, 0.62]), WALL.SIDING);
          }
        }
      }
    }

    // ---- Balconies on apartment & mixed-use blocks (jeantimex/tokyo)
    if ((cat === CAT.APARTMENT || cat === CAT.MIXED) && floors >= 4 && height < 36 && distSq < 9500000 && fronts.length && rnd() < 0.25) {
      const score = (f: (typeof fronts)[0]) => f.len * (0.65 + 0.35 * f.nrm[2]);
      const main = fronts.reduce((m, f) => (score(f) > score(m) ? f : m));
      const depth = 1.05;
      const c = rnd() < 0.6 ? wallCol.map((v) => v + (1 - v) * 0.35) : lin([0.5, 0.51, 0.52]);
      for (const f of fronts) {
        if (f.nrm[0] * main.nrm[0] + f.nrm[2] * main.nrm[2] < 0.85 || f.len < 4.5) continue;
        const { dx, dz, nrm } = f;
        const inset = 0.35;
        const ax = f.x0 + dx * inset;
        const az = f.z0 + dz * inset;
        const bx = f.x0 + dx * (f.len - inset);
        const bz = f.z0 + dz * (f.len - inset);
        const ox = nrm[0] * depth;
        const oz = nrm[2] * depth;
        for (let fl = 1; fl < floors; fl++) {
          const y0 = base + fl * floorH - 0.12;
          const y1 = y0 + 1.15;
          if (y1 > wallTop - 0.4) break;
          const A = (y: number) => [ax, y, az];
          const B = (y: number) => [bx, y, bz];
          const C = (y: number) => [bx + ox, y, bz + oz];
          const D = (y: number) => [ax + ox, y, az + oz];
          quad(A(y0), B(y0), C(y0), D(y0), [0, -1, 0], c, KIND.SOLID, WALL.PLASTER);
          quad(A(y0 + 0.12), B(y0 + 0.12), C(y0 + 0.12), D(y0 + 0.12), [0, 1, 0], c, KIND.SOLID, WALL.PLASTER);
          quad(D(y0), C(y0), C(y1), D(y1), nrm, c, KIND.SOLID, WALL.PLASTER);
          quad(D(y0), C(y0), C(y1), D(y1), [-nrm[0], 0, -nrm[2]], inner, KIND.SOLID, WALL.PLASTER);
          quad(A(y0), D(y0), D(y1), A(y1), [-dx, 0, -dz], c, KIND.SOLID, WALL.PLASTER);
          quad(B(y0), C(y0), C(y1), B(y1), [dx, 0, dz], c, KIND.SOLID, WALL.PLASTER);
        }
      }
    }
  }

  if (pos.length === 0) return null;

  return {
    position: pos.done(),
    normal: nor.done(),
    color: col.done(),
    aFacade: fac.done(),
    aBldg: bld.done(),
    triangles: pos.length / 9,
  };
}
