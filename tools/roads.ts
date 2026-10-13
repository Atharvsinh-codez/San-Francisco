import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTEXT_DIR,
  PUBLIC_DATA_DIR,
  ensureDirs,
  fetchOSMData,
} from './fetch.ts';
import { BakedTerrainSampler } from './terrain.ts';
import { WORLD_BOUNDS, latLonToENU, round1 } from '../src/world/coords.ts';

/**
 * Road classes for Apple Maps Mode B & Satellite Mode A street lighting:
 * 0 = Freeway (motorway, trunk -> #F6C84B with #D4A12A casing, width 16m)
 * 1 = Major Arterial (primary, secondary -> #FFFFFF with #D9D5CE casing, width 12m)
 * 2 = Collector / Tertiary (tertiary -> #FFFFFF with #D9D5CE casing, width 9.5m)
 * 3 = Residential / Local (residential, pedestrian, service -> #F7F5F1 with #DFDBD4 casing, width 7m)
 * 4 = Footpath / Trail / Steps (footway, path -> dashed #B9B4AB, width 2.2m)
 * 5 = Bikeway / Cycle lane (cycleway -> #68B684 / Apple green-tinted path, width 2.5m)
 * 6 = Railway / Tram (rail, light_rail, tram -> #8E8A84 hatched, width 3.2m)
 * 7 = Cable Car Line (Powell-Hyde, Powell-Mason, California -> #B85D3B historic bronze/steel slot rail, width 4.0m)
 * 8 = BART / Muni Metro Transit Line (Mode B transit overlay)
 */
export interface BakedRoadWay {
  cls: number;
  width: number;
  layer: number;
  bridge: boolean;
  name?: string;
  ref?: string;
  // Flat array [x0, y0, z0, x1, y1, z1, ...] in ENU meters (0.1m precision)
  pts: number[];
}

export async function bakeRoads(): Promise<void> {
  ensureDirs();
  await fetchOSMData();

  const terrain = new BakedTerrainSampler();
  const osmPath = path.join(CONTEXT_DIR, 'osm', 'sf_osm.json');
  console.log('[bake:roads] Reading cached OSM data...');
  const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));

  const ways: BakedRoadWay[] = [];
  const cableCarLines: { name: string; pts: number[] }[] = [];
  const streetLamps: number[] = []; // [x, y, z, ...]

  const maxStepMeters = 20; // Subdivide every 20m so roads hug SF hills with zero hill clipping

  for (const el of osm.elements || []) {
    if (el.type !== 'way' || !el.tags || !el.geometry || el.geometry.length < 2) {
      continue;
    }
    const tags = el.tags;
    const hw = tags.highway;
    const rw = tags.railway;
    if (!hw && !rw) continue;

    const isTunnel =
      tags.tunnel === 'yes' ||
      tags.tunnel === 'building_passage' ||
      parseInt(tags.layer || '0', 10) < 0;

    // Skip underground highway tunnels so they don't draw on top of hills (e.g. Broadway Tunnel, Presidio Parkway tunnels)
    if (hw && isTunnel) continue;

    // Skip Golden Gate Bridge & Bay Bridge highway decks here if they are part of the hero suspension spans
    // (Wait: we actually want approach roads up to the bridge anchorages, and the hero bridges cover the water span!)
    const isBridge = tags.bridge === 'yes' || tags.bridge === 'viaduct';
    const layer = Math.max(0, parseInt(tags.layer || '0', 10));

    let cls = -1;
    let width = 7;

    if (rw) {
      if (
        rw === 'cable_car' ||
        (tags.name && /cable car|powell-hyde|powell-mason|california street/i.test(tags.name))
      ) {
        cls = 7;
        width = 4.2;
      } else if (rw === 'subway' || (isTunnel && (rw === 'light_rail' || rw === 'rail'))) {
        cls = 8; // BART / Muni Metro underground transit line (Mode B)
        width = 3.5;
      } else if (!isTunnel && (rw === 'rail' || rw === 'light_rail' || rw === 'tram')) {
        cls = 6;
        width = 3.2;
      } else {
        continue;
      }
    } else if (hw) {
      if (hw === 'motorway' || hw === 'motorway_link' || hw === 'trunk' || hw === 'trunk_link') {
        cls = 0;
        width = hw.endsWith('_link') ? 9.5 : 16.0;
      } else if (hw === 'primary' || hw === 'primary_link' || hw === 'secondary' || hw === 'secondary_link') {
        cls = 1;
        width = hw.startsWith('primary') ? 13.0 : 11.0;
      } else if (hw === 'tertiary' || hw === 'tertiary_link') {
        cls = 2;
        width = 9.5;
      } else if (hw === 'residential' || hw === 'pedestrian' || hw === 'living_street') {
        cls = 3;
        width = 7.2;
      } else if (hw === 'service') {
        // Keep only named or longer service roads to avoid tiny backyard driveway clutter
        if (el.geometry.length < 4 && !tags.name) continue;
        cls = 3;
        width = 5.0;
      } else if (hw === 'cycleway') {
        cls = 5;
        width = 2.6;
      } else if (hw === 'footway' || hw === 'path') {
        // Keep park trails & longer paths
        if (el.geometry.length < 4 && !tags.name) continue;
        cls = 4;
        width = 2.2;
      } else {
        continue;
      }
    }

    if (cls < 0) continue;

    // Convert geometry to ENU and subdivide segments <= 20m to drape smoothly over hills
    const rawPts: { x: number; z: number }[] = [];
    for (const pt of el.geometry) {
      const enu = latLonToENU(pt.lat, pt.lon);
      rawPts.push({ x: enu.x, z: enu.z });
    }

    // Filter out ways outside WORLD_BOUNDS
    if (
      rawPts[0].x < WORLD_BOUNDS.minX ||
      rawPts[0].x > WORLD_BOUNDS.maxX ||
      rawPts[0].z < WORLD_BOUNDS.minZ ||
      rawPts[0].z > WORLD_BOUNDS.maxZ
    ) {
      continue;
    }

    // Skip over-water bridge spans on Golden Gate & Bay Bridge (handled by Hero Landmarks with real 70m deck clearance)
    const midPt = rawPts[Math.floor(rawPts.length / 2)];
    const midGround = terrain.sampleHeight(midPt.x, midPt.z);
    if (isBridge && midGround < -1.0 && (cls === 0 || cls === 1)) {
      continue;
    }

    const drapedPts: number[] = [];
    const heightOffset =
      cls === 0
        ? 0.55
        : cls === 1
          ? 0.45
          : cls === 7
            ? 0.58
            : cls === 6
              ? 0.52
              : cls === 2
                ? 0.38
                : 0.32;

    const bridgeLift = isBridge ? Math.max(1, layer) * 5.5 : 0;

    let distAccum = 0;

    for (let i = 0; i < rawPts.length - 1; i++) {
      const p0 = rawPts[i];
      const p1 = rawPts[i + 1];
      const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      if (segLen < 0.2) continue;

      const steps = Math.max(1, Math.ceil(segLen / maxStepMeters));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = p0.x + (p1.x - p0.x) * t;
        const z = p0.z + (p1.z - p0.z) * t;
        const gY = Math.max(0.5, terrain.sampleHeight(x, z));
        const y = gY + heightOffset + bridgeLift;
        drapedPts.push(round1(x), round1(y), round1(z));

        // Sample street lamps every ~75m on freeways, arterials, and collectors
        if ((cls === 0 || cls === 1 || cls === 2) && streetLamps.length < 18000) {
          distAccum += segLen / steps;
          if (distAccum >= 75) {
            distAccum = 0;
            streetLamps.push(round1(x), round1(gY), round1(z));
          }
        }
      }
    }

    // Push final point
    const pLast = rawPts[rawPts.length - 1];
    const gLast = Math.max(0.5, terrain.sampleHeight(pLast.x, pLast.z));
    drapedPts.push(
      round1(pLast.x),
      round1(gLast + heightOffset + bridgeLift),
      round1(pLast.z)
    );

    if (drapedPts.length < 6) continue;

    ways.push({
      cls,
      width,
      layer,
      bridge: isBridge,
      name: tags.name,
      ref: tags.ref,
      pts: drapedPts,
    });

    if (cls === 7) {
      cableCarLines.push({
        name: tags.name || 'SF Cable Car',
        pts: drapedPts,
      });
    }
  }

  // Ensure the 3 famous SF Cable Car routes (Powell-Hyde, Powell-Mason, California St)
  // have continuous animation paths for the moving cable cars!
  const canonicalCableRoutes = buildCanonicalCableCarRoutes(terrain);

  const outData = {
    count: ways.length,
    ways,
    cableCarRoutes: canonicalCableRoutes,
    streetLamps,
  };

  const outPath = path.join(PUBLIC_DATA_DIR, 'roads', 'roads.json');
  fs.writeFileSync(outPath, JSON.stringify(outData));
  console.log(
    `[bake:roads] Baked ${ways.length.toLocaleString()} road/rail/path ways + ${streetLamps.length / 3} street lamps (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB).`
  );
}

function buildCanonicalCableCarRoutes(terrain: BakedTerrainSampler) {
  const routesRaw = [
    {
      name: 'Powell-Hyde Cable Car',
      waypoints: [
        [37.7845, -122.4079], // Powell & Market turntable
        [37.7879, -122.4075], // Union Square
        [37.7919, -122.4083], // Nob Hill (California & Powell)
        [37.7955, -122.4091], // Jackson & Powell
        [37.7962, -122.4182], // Jackson & Hyde
        [37.8018, -122.4196], // Lombard & Hyde (top of crooked street)
        [37.8065, -122.4206], // Aquatic Park / Ghirardelli turntable
      ],
    },
    {
      name: 'Powell-Mason Cable Car',
      waypoints: [
        [37.7845, -122.4079], // Powell & Market
        [37.7919, -122.4083], // Powell & California
        [37.7972, -122.4106], // Mason & Washington
        [37.8008, -122.4119], // North Beach / Columbus
        [37.8054, -122.4149], // Taylor & Bay turntable
      ],
    },
    {
      name: 'California Street Cable Car',
      waypoints: [
        [37.7933, -122.3962], // California & Market (Embarcadero)
        [37.7927, -122.4018], // Financial District
        [37.7919, -122.4083], // Nob Hill crest (Grace Cathedral / Fairmont)
        [37.7907, -122.4161], // Polk Gulch
        [37.7897, -122.4232], // California & Van Ness
      ],
    },
  ];

  return routesRaw.map((r) => {
    const pts: number[] = [];
    for (let i = 0; i < r.waypoints.length - 1; i++) {
      const p0 = latLonToENU(r.waypoints[i][0], r.waypoints[i][1]);
      const p1 = latLonToENU(r.waypoints[i + 1][0], r.waypoints[i + 1][1]);
      const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const steps = Math.max(4, Math.ceil(dist / 15));
      for (let s = 0; s <= steps; s++) {
        if (i > 0 && s === 0) continue;
        const t = s / steps;
        const x = p0.x + (p1.x - p0.x) * t;
        const z = p0.z + (p1.z - p0.z) * t;
        const y = Math.max(1, terrain.sampleHeight(x, z)) + 0.6;
        pts.push(round1(x), round1(y), round1(z));
      }
    }
    return { name: r.name, pts };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeRoads();
}
