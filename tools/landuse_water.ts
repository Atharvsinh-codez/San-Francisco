import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTEXT_DIR,
  PUBLIC_DATA_DIR,
  ensureDirs,
  fetchOSMData,
  fetchDataSFTrees,
} from './fetch.ts';
import { BakedTerrainSampler } from './terrain.ts';
import { WORLD_BOUNDS, latLonToENU, round1 } from '../src/world/coords.ts';

/**
 * Landuse / surface classes for Mode B (Apple Maps vector mode):
 * 0 = Park / Green / Forest (#CDE9C4)
 * 1 = Sand / Beach (#F1E7C8)
 * 2 = Pier / Breakwater (#E5E0D6 extruded deck at +2.6m over bay water)
 * 3 = Inland Water / Lagoon (Stow Lake, Lake Merced, Palace of Fine Arts Lagoon -> #B7DDF5)
 */
export interface BakedPolygon {
  cls: number;
  name?: string;
  // Flat [x0, y0, z0, x1, y1, z1, ...] ring
  pts: number[];
}

export async function bakeLanduseWater(): Promise<void> {
  ensureDirs();
  await fetchOSMData();
  await fetchDataSFTrees();

  const terrain = new BakedTerrainSampler();
  const osmPath = path.join(CONTEXT_DIR, 'osm', 'sf_osm.json');
  const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));

  const polygons: BakedPolygon[] = [];
  const parkPolygonsForTrees: { x: number; z: number }[][] = [];

  for (const el of osm.elements || []) {
    if (el.type !== 'way' || !el.tags || !el.geometry || el.geometry.length < 4) {
      continue;
    }
    const tags = el.tags;
    let cls = -1;

    if (tags.man_made === 'pier' || tags.man_made === 'breakwater') {
      cls = 2;
    } else if (tags.natural === 'sand' || tags.natural === 'beach') {
      cls = 1;
    } else if (tags.natural === 'water') {
      cls = 3;
    } else if (
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      tags.leisure === 'golf_course' ||
      tags.leisure === 'pitch' ||
      tags.landuse === 'grass' ||
      tags.landuse === 'forest' ||
      tags.landuse === 'meadow' ||
      tags.landuse === 'recreation_ground' ||
      tags.landuse === 'cemetery' ||
      tags.natural === 'wood' ||
      tags.natural === 'scrub'
    ) {
      cls = 0;
    }

    if (cls < 0) continue;

    // Ensure closed ring or Pier ribbon converted to polygon
    const geom = el.geometry;
    const first = geom[0];
    const last = geom[geom.length - 1];
    const isClosed =
      Math.hypot(first.lat - last.lat, first.lon - last.lon) < 0.0005;

    if (!isClosed && cls !== 2) continue;

    const ring2D: { x: number; z: number }[] = [];
    for (let i = 0; i < geom.length; i++) {
      const enu = latLonToENU(geom[i].lat, geom[i].lon);
      if (ring2D.length > 0) {
        const prev = ring2D[ring2D.length - 1];
        if (Math.hypot(enu.x - prev.x, enu.z - prev.z) < 2.0) continue;
      }
      ring2D.push({ x: enu.x, z: enu.z });
    }

    if (ring2D.length < 3) continue;
    if (
      ring2D[0].x < WORLD_BOUNDS.minX ||
      ring2D[0].x > WORLD_BOUNDS.maxX ||
      ring2D[0].z < WORLD_BOUNDS.minZ ||
      ring2D[0].z > WORLD_BOUNDS.maxZ
    ) {
      continue;
    }

    // If a pier way is a centerline (not closed), expand it into a 16m-wide pier deck polygon
    if (cls === 2 && !isClosed && ring2D.length >= 2) {
      const halfW = 8.5;
      const left: { x: number; z: number }[] = [];
      const right: { x: number; z: number }[] = [];
      for (let i = 0; i < ring2D.length; i++) {
        const p0 = ring2D[Math.max(0, i - 1)];
        const p1 = ring2D[Math.min(ring2D.length - 1, i + 1)];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        left.push({ x: ring2D[i].x + nx * halfW, z: ring2D[i].z + nz * halfW });
        right.unshift({ x: ring2D[i].x - nx * halfW, z: ring2D[i].z - nz * halfW });
      }
      ring2D.length = 0;
      ring2D.push(...left, ...right);
    }

    const pts: number[] = [];
    for (const p of ring2D) {
      const gY = terrain.sampleHeight(p.x, p.z);
      const y =
        cls === 2
          ? Math.max(2.6, gY + 0.6)
          : cls === 1
            ? Math.max(0.4, gY + 0.18)
            : cls === 3
              ? Math.max(0.5, gY + 0.25)
              : Math.max(0.4, gY + 0.15);
      pts.push(round1(p.x), round1(y), round1(p.z));
    }

    polygons.push({
      cls,
      name: tags.name,
      pts,
    });

    if (cls === 0 && ring2D.length >= 4) {
      parkPolygonsForTrees.push(ring2D);
    }
  }

  const landuseOutPath = path.join(PUBLIC_DATA_DIR, 'landuse', 'landuse.json');
  fs.writeFileSync(
    landuseOutPath,
    JSON.stringify({ count: polygons.length, polygons })
  );
  console.log(
    `[bake:landuse] Baked ${polygons.length.toLocaleString()} parks, beaches, piers, and lagoons (${(fs.statSync(landuseOutPath).size / 1024 / 1024).toFixed(2)} MB).`
  );

  // Now bake DataSF Street Trees (tkzw-k3nq) + Park Canopy Trees into compact binary `trees.bin`
  // Each tree record: int16 x (m), int16 y (0.1m), int16 z (m), uint8 species (0..4), uint8 scale (height m * 4) = 8 bytes/tree
  const treesPath = path.join(CONTEXT_DIR, 'datasf', 'trees_raw.json');
  const treeRecords: { x: number; y: number; z: number; sp: number; h: number }[] = [];

  if (fs.existsSync(treesPath)) {
    const rawTrees: any[] = JSON.parse(fs.readFileSync(treesPath, 'utf8'));
    // Downsample / spatially deduplicate trees so no two trees are closer than 9m (keeps ~28,000 crisp instanced trees)
    const occupied = new Set<string>();
    for (const row of rawTrees) {
      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const enu = latLonToENU(lat, lon);
      if (
        enu.x < WORLD_BOUNDS.minX ||
        enu.x > WORLD_BOUNDS.maxX ||
        enu.z < WORLD_BOUNDS.minZ ||
        enu.z > WORLD_BOUNDS.maxZ
      ) {
        continue;
      }
      const cellKey = `${Math.floor(enu.x / 11)}_${Math.floor(enu.z / 11)}`;
      if (occupied.has(cellKey)) continue;
      occupied.add(cellKey);

      const gY = terrain.sampleHeight(enu.x, enu.z);
      if (gY < 0.8) continue;

      const spStr = String(row.species || '').toLowerCase();
      let sp = 0; // 0: London Plane / Sycamore, 1: Monterey Cypress / Conifer, 2: Eucalyptus, 3: Canary Island Palm, 4: Flowering Cherry / Magnolia
      if (spStr.includes('cupressus') || spStr.includes('pinus') || spStr.includes('cypress') || spStr.includes('pine')) {
        sp = 1;
      } else if (spStr.includes('eucalyptus') || spStr.includes('tristania') || spStr.includes('lophostemon')) {
        sp = 2;
      } else if (spStr.includes('phoenix') || spStr.includes('washingtonia') || spStr.includes('palm')) {
        sp = 3;
      } else if (spStr.includes('prunus') || spStr.includes('magnolia') || spStr.includes('cherry')) {
        sp = 4;
      }

      const h = 7 + ((Math.abs(Math.round(enu.x * 13 + enu.z * 7)) % 80) / 10);
      treeRecords.push({ x: enu.x, y: gY, z: enu.z, sp, h });
    }
  }

  // Add Golden Gate Park & Presidio & Twin Peaks canopy trees from USGS/WERK canopy zones
  const canopyZones = [
    // Golden Gate Park (-122.51 to -122.455, 37.766 to 37.772)
    { minLat: 37.766, maxLat: 37.7725, minLon: -122.509, maxLon: -122.455, count: 2600, sp: 1 },
    // The Presidio (-122.482 to -122.448, 37.788 to 37.806)
    { minLat: 37.789, maxLat: 37.804, minLon: -122.478, maxLon: -122.450, count: 2200, sp: 1 },
    // Sutro Forest / Mount Sutro (-122.463 to -122.452, 37.756 to 37.763)
    { minLat: 37.756, maxLat: 37.763, minLon: -122.463, maxLon: -122.452, count: 600, sp: 2 },
    // Embarcadero Palm Row
    { minLat: 37.788, maxLat: 37.806, minLon: -122.402, maxLon: -122.388, count: 140, sp: 3 },
  ];

  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (const zone of canopyZones) {
    for (let i = 0; i < zone.count; i++) {
      const lat = zone.minLat + rand() * (zone.maxLat - zone.minLat);
      const lon = zone.minLon + rand() * (zone.maxLon - zone.minLon);
      const enu = latLonToENU(lat, lon);
      const gY = terrain.sampleHeight(enu.x, enu.z);
      if (gY < 1.5) continue;
      const h = 11 + rand() * 11;
      treeRecords.push({
        x: enu.x,
        y: gY,
        z: enu.z,
        sp: zone.sp,
        h,
      });
    }
  }

  const treeBuf = Buffer.allocUnsafe(4 + treeRecords.length * 8);
  treeBuf.writeUInt32LE(treeRecords.length, 0);
  let off = 4;
  for (const t of treeRecords) {
    treeBuf.writeInt16LE(Math.round(t.x), off);
    treeBuf.writeInt16LE(Math.round(t.y * 10), off + 2);
    treeBuf.writeInt16LE(Math.round(t.z), off + 4);
    treeBuf.writeUInt8(t.sp, off + 6);
    treeBuf.writeUInt8(Math.min(255, Math.round(t.h * 4)), off + 7);
    off += 8;
  }

  const treesOutPath = path.join(PUBLIC_DATA_DIR, 'landuse', 'trees.bin');
  fs.writeFileSync(treesOutPath, treeBuf);
  console.log(
    `[bake:landuse] Baked ${treeRecords.length.toLocaleString()} instanced trees into trees.bin (${(treeBuf.byteLength / 1024).toFixed(1)} KB).`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeLanduseWater();
}
