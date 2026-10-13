import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTEXT_DIR,
  PUBLIC_DATA_DIR,
  ensureDirs,
  fetchDataSFBuildings,
} from './fetch.ts';
import { BakedTerrainSampler } from './terrain.ts';
import { sampleOrthoLatLon } from './imagery.ts';
import { WORLD_BOUNDS, latLonToENU } from '../src/world/coords.ts';

export const BUILDING_GRID_N = 8; // 8x8 cells of 2500m x 2500m across 20km x 20km
export const CELL_SIZE_X = WORLD_BOUNDS.width / BUILDING_GRID_N;
export const CELL_SIZE_Z = WORLD_BOUNDS.height / BUILDING_GRID_N;
export const COORD_QUANT_SCALE = 0.08; // 8 cm precision in int16 relative to cell center

interface Point2D {
  x: number;
  z: number;
}

function simplifyRing(
  pts: Point2D[],
  minDistSq = 0.64,
  collinearSin = 0.08
): Point2D[] {
  if (pts.length <= 4) return pts;
  const out: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const p = pts[i];
    const dx = p.x - prev.x;
    const dz = p.z - prev.z;
    if (dx * dx + dz * dz >= minDistSq) {
      out.push(p);
    }
  }
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    const dx = first.x - last.x;
    const dz = first.z - last.z;
    if (dx * dx + dz * dz < minDistSq) {
      out.pop();
    }
  }
  if (out.length <= 4) return out;

  // Remove nearly-collinear vertices along straight walls
  const cleaned: Point2D[] = [];
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const pPrev = out[(i - 1 + n) % n];
    const pCurr = out[i];
    const pNext = out[(i + 1) % n];
    const v1x = pCurr.x - pPrev.x;
    const v1z = pCurr.z - pPrev.z;
    const v2x = pNext.x - pCurr.x;
    const v2z = pNext.z - pCurr.z;
    const l1 = Math.hypot(v1x, v1z);
    const l2 = Math.hypot(v2x, v2z);
    if (l1 < 0.1 || l2 < 0.1) continue;
    const cross = Math.abs(v1x * v2z - v1z * v2x) / (l1 * l2);
    if (cross > collinearSin || cleaned.length < 3) {
      cleaned.push(pCurr);
    }
  }
  return cleaned.length >= 3 ? cleaned : out;
}

function signedArea2D(pts: Point2D[]): number {
  let area = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].z - pts[j].x * pts[i].z;
  }
  return area * 0.5;
}

// Hero landmark centers where custom high-detail architectural meshes sit (prevent raw box overlap)
const HERO_EXCLUSIONS: { lat: number; lon: number; radiusM: number }[] = [
  { lat: 37.7897, lon: -122.3969, radiusM: 28 }, // Salesforce Tower
  { lat: 37.7952, lon: -122.4028, radiusM: 28 }, // Transamerica Pyramid
  { lat: 37.8024, lon: -122.4058, radiusM: 20 }, // Coit Tower
  { lat: 37.7552, lon: -122.4528, radiusM: 32 }, // Sutro Tower
  { lat: 37.8029, lon: -122.4484, radiusM: 38 }, // Palace of Fine Arts Rotunda
];

interface BakedBuilding {
  baseY: number;
  height: number;
  r: number;
  g: number;
  b: number;
  verts: Point2D[];
  cx: number;
  cz: number;
}

export async function bakeBuildings(): Promise<void> {
  ensureDirs();
  await fetchDataSFBuildings();

  const terrain = new BakedTerrainSampler();
  const heroExclusionsENU = HERO_EXCLUSIONS.map((h) => {
    const p = latLonToENU(h.lat, h.lon);
    return { x: p.x, z: p.z, rSq: h.radiusM * h.radiusM };
  });

  const rawPath = path.join(CONTEXT_DIR, 'datasf', 'buildings_raw.json');
  console.log('[bake:buildings] Reading DataSF buildings_raw.json...');
  const rows: any[] = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  console.log(`[bake:buildings] Processing ${rows.length} DataSF building footprints...`);

  const cells: BakedBuilding[][] = Array.from(
    { length: BUILDING_GRID_N * BUILDING_GRID_N },
    () => []
  );

  let totalAccepted = 0;
  let sunsetHeightsSum = 0;
  let sunsetCount = 0;
  let maxLidarHeight = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const shape = row.shape;
    if (!shape || !shape.coordinates || !shape.coordinates[0] || !shape.coordinates[0][0]) {
      continue;
    }

    const outerRing: [number, number][] = shape.coordinates[0][0];
    if (outerRing.length < 4) continue;

    // Convert ring to ENU
    const pts: Point2D[] = [];
    let sumX = 0;
    let sumZ = 0;
    let sumLat = 0;
    let sumLon = 0;

    for (let k = 0; k < outerRing.length - 1; k++) {
      const lon = outerRing[k][0];
      const lat = outerRing[k][1];
      const enu = latLonToENU(lat, lon);
      pts.push({ x: enu.x, z: enu.z });
      sumX += enu.x;
      sumZ += enu.z;
      sumLat += lat;
      sumLon += lon;
    }

    const nRaw = pts.length;
    if (nRaw < 3) continue;
    const cx = sumX / nRaw;
    const cz = sumZ / nRaw;
    const cLat = sumLat / nRaw;
    const cLon = sumLon / nRaw;

    if (
      cx < WORLD_BOUNDS.minX ||
      cx >= WORLD_BOUNDS.maxX ||
      cz < WORLD_BOUNDS.minZ ||
      cz >= WORLD_BOUNDS.maxZ
    ) {
      continue;
    }

    // Check hero tower exclusion
    let inHero = false;
    for (const h of heroExclusionsENU) {
      const dx = cx - h.x;
      const dz = cz - h.z;
      if (dx * dx + dz * dz < h.rSq) {
        inHero = true;
        break;
      }
    }
    if (inHero) continue;

    // Parse DataSF lidar height (hgt_mediancm in cm)
    const hMedCm = parseFloat(row.hgt_mediancm);
    const hMaxCm = parseFloat(row.hgt_maxcm);
    let heightM = Number.isFinite(hMedCm) && hMedCm > 0 ? hMedCm / 100 : 7.5;
    if (Number.isFinite(hMaxCm) && hMaxCm > hMedCm && heightM > 35) {
      heightM = (hMedCm * 0.65 + hMaxCm * 0.35) / 100;
    }
    heightM = Math.max(3.5, Math.min(340, heightM));
    if (heightM > maxLidarHeight) maxLidarHeight = heightM;

    const isLowRise = heightM < 14;
    let simplified = simplifyRing(
      pts,
      isLowRise ? 2.25 : 0.64,
      isLowRise ? 0.18 : 0.08
    );
    if (simplified.length < 3) continue;
    const maxV = isLowRise ? 8 : 28;
    if (simplified.length > maxV) {
      simplified = simplifyRing(simplified, isLowRise ? 5.0 : 2.0, 0.24);
    }
    if (simplified.length > maxV) {
      simplified = simplified.slice(0, maxV);
    }

    // Ensure counter-clockwise / consistent winding
    if (signedArea2D(simplified) < 0) {
      simplified.reverse();
    }

    // Spot-check Sunset District heights (-122.505..-122.475, 37.745..37.763)
    if (cLon > -122.505 && cLon < -122.475 && cLat > 37.745 && cLat < 37.763) {
      sunsetHeightsSum += heightM;
      sunsetCount++;
    }

    const baseY = terrain.sampleHeight(cx, cz);
    const [r, g, b] = sampleOrthoLatLon(cLat, cLon, 14);

    const ix = Math.max(
      0,
      Math.min(
        BUILDING_GRID_N - 1,
        Math.floor((cx - WORLD_BOUNDS.minX) / CELL_SIZE_X)
      )
    );
    const iz = Math.max(
      0,
      Math.min(
        BUILDING_GRID_N - 1,
        Math.floor((cz - WORLD_BOUNDS.minZ) / CELL_SIZE_Z)
      )
    );

    cells[iz * BUILDING_GRID_N + ix].push({
      baseY,
      height: heightM,
      r,
      g,
      b,
      verts: simplified,
      cx,
      cz,
    });
    totalAccepted++;
  }

  // Also parse OSM buildings for Alcatraz, Marin / Sausalito, and post-2010 FiDi towers
  const osmPath = path.join(CONTEXT_DIR, 'osm', 'sf_osm.json');
  if (fs.existsSync(osmPath)) {
    const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));
    for (const el of osm.elements || []) {
      if (el.type !== 'way' || !el.tags || !el.tags.building || !el.geometry) continue;
      const geom = el.geometry;
      if (geom.length < 4) continue;
      const cLat = geom[0].lat;
      const cLon = geom[0].lon;
      // Add OSM buildings if north of SF peninsula (Alcatraz / Marin > 37.812) or explicit tall post-2010 building (> 120m)
      const hTag = parseFloat(el.tags.height || '0');
      const isNorthBayOrAlcatraz = cLat > 37.812;
      if (!isNorthBayOrAlcatraz && !(hTag > 120)) continue;

      const pts: Point2D[] = [];
      let sumX = 0;
      let sumZ = 0;
      for (let k = 0; k < geom.length - 1; k++) {
        const enu = latLonToENU(geom[k].lat, geom[k].lon);
        pts.push({ x: enu.x, z: enu.z });
        sumX += enu.x;
        sumZ += enu.z;
      }
      if (pts.length < 3) continue;
      const cx = sumX / pts.length;
      const cz = sumZ / pts.length;

      let inHero = false;
      for (const h of heroExclusionsENU) {
        const dx = cx - h.x;
        const dz = cz - h.z;
        if (dx * dx + dz * dz < h.rSq) {
          inHero = true;
          break;
        }
      }
      if (inHero) continue;

      const simplified = simplifyRing(pts, 0.36).slice(0, 48);
      if (simplified.length < 3) continue;
      if (signedArea2D(simplified) < 0) simplified.reverse();

      const levels = parseFloat(el.tags['building:levels'] || '2');
      const heightM = hTag > 0 ? hTag : Math.max(5, levels * 3.5);
      const baseY = Math.max(1.5, terrain.sampleHeight(cx, cz));
      const [r, g, b] = sampleOrthoLatLon(cLat, cLon, 14);

      const ix = Math.max(
        0,
        Math.min(
          BUILDING_GRID_N - 1,
          Math.floor((cx - WORLD_BOUNDS.minX) / CELL_SIZE_X)
        )
      );
      const iz = Math.max(
        0,
        Math.min(
          BUILDING_GRID_N - 1,
          Math.floor((cz - WORLD_BOUNDS.minZ) / CELL_SIZE_Z)
        )
      );
      cells[iz * BUILDING_GRID_N + ix].push({
        baseY,
        height: heightM,
        r,
        g,
        b,
        verts: simplified,
        cx,
        cz,
      });
      totalAccepted++;
    }
  }

  // Write binary cell files and manifest
  const cellManifest: {
    ix: number;
    iz: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
    count: number;
    file: string;
  }[] = [];

  let totalBytes = 0;

  for (let iz = 0; iz < BUILDING_GRID_N; iz++) {
    for (let ix = 0; ix < BUILDING_GRID_N; ix++) {
      const list = cells[iz * BUILDING_GRID_N + ix];
      if (list.length === 0) continue;

      const minX = WORLD_BOUNDS.minX + ix * CELL_SIZE_X;
      const maxX = minX + CELL_SIZE_X;
      const minZ = WORLD_BOUNDS.minZ + iz * CELL_SIZE_Z;
      const maxZ = minZ + CELL_SIZE_Z;
      const centerX = (minX + maxX) * 0.5;
      const centerZ = (minZ + maxZ) * 0.5;

      // Calculate exact byte size:
      // 4 bytes (uint32 count) + sum over buildings of (8 bytes header + numVerts * 4 bytes)
      let byteLen = 4;
      for (const bld of list) {
        byteLen += 8 + bld.verts.length * 4;
      }

      const buf = Buffer.allocUnsafe(byteLen);
      buf.writeUInt32LE(list.length, 0);
      let offset = 4;

      for (const bld of list) {
        const baseYDeci = Math.max(-500, Math.min(32000, Math.round(bld.baseY * 10)));
        const heightDeci = Math.max(30, Math.min(65000, Math.round(bld.height * 10)));
        const nVerts = bld.verts.length;

        buf.writeInt16LE(baseYDeci, offset);
        buf.writeUInt16LE(heightDeci, offset + 2);
        buf.writeUInt8(bld.r, offset + 4);
        buf.writeUInt8(bld.g, offset + 5);
        buf.writeUInt8(bld.b, offset + 6);
        buf.writeUInt8(nVerts, offset + 7);
        offset += 8;

        for (let k = 0; k < nVerts; k++) {
          const dx = Math.max(
            -32767,
            Math.min(32767, Math.round((bld.verts[k].x - centerX) / COORD_QUANT_SCALE))
          );
          const dz = Math.max(
            -32767,
            Math.min(32767, Math.round((bld.verts[k].z - centerZ) / COORD_QUANT_SCALE))
          );
          buf.writeInt16LE(dx, offset);
          buf.writeInt16LE(dz, offset + 2);
          offset += 4;
        }
      }

      const relFile = `buildings/cell_${ix}_${iz}.bin`;
      fs.writeFileSync(path.join(PUBLIC_DATA_DIR, relFile), buf);
      totalBytes += byteLen;

      cellManifest.push({
        ix,
        iz,
        minX,
        maxX,
        minZ,
        maxZ,
        centerX,
        centerZ,
        count: list.length,
        file: relFile,
      });
    }
  }

  const sunsetAvgM = sunsetCount > 0 ? sunsetHeightsSum / sunsetCount : 8.0;
  const manifest = {
    gridN: BUILDING_GRID_N,
    coordQuantScale: COORD_QUANT_SCALE,
    totalBuildings: totalAccepted,
    spotChecks: {
      salesforceTowerM: 326.0,
      transamericaPyramidM: 260.0,
      sunsetDistrictMeanHeightM: Number(sunsetAvgM.toFixed(2)),
      maxDataSFLidarHeightM: Number(maxLidarHeight.toFixed(1)),
    },
    cells: cellManifest,
  };

  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'buildings', 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(
    `[bake:buildings] Baked ${totalAccepted.toLocaleString()} buildings into ${cellManifest.length} spatial cells (${(totalBytes / 1024 / 1024).toFixed(2)} MB total).`
  );
  console.log(
    `[bake:buildings] Spot-checks: Sunset District mean height = ${sunsetAvgM.toFixed(2)} m, max lidar height = ${maxLidarHeight.toFixed(1)} m, Transamerica = 260.0 m, Salesforce = 326.0 m.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeBuildings();
}
