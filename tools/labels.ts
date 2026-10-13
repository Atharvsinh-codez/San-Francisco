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

export interface NeighborhoodLabel {
  name: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  z: number;
  tier: number;
}

export interface RoadLabelPlacement {
  name: string;
  ref?: string;
  cls: number;
  x: number;
  y: number;
  z: number;
  angle: number;
}

const CANONICAL_NEIGHBORHOODS: { name: string; lat: number; lon: number; tier: number }[] = [
  { name: 'Financial District', lat: 37.7946, lon: -122.3999, tier: 1 },
  { name: 'SoMa', lat: 37.7786, lon: -122.4056, tier: 1 },
  { name: 'Mission District', lat: 37.7599, lon: -122.4148, tier: 1 },
  { name: 'The Castro', lat: 37.7609, lon: -122.435, tier: 1 },
  { name: 'Haight-Ashbury', lat: 37.7692, lon: -122.4481, tier: 1 },
  { name: 'Nob Hill', lat: 37.793, lon: -122.4161, tier: 1 },
  { name: 'Russian Hill', lat: 37.8011, lon: -122.4194, tier: 1 },
  { name: 'North Beach', lat: 37.8061, lon: -122.4103, tier: 1 },
  { name: 'Chinatown', lat: 37.7941, lon: -122.4078, tier: 1 },
  { name: 'The Presidio', lat: 37.7989, lon: -122.4662, tier: 1 },
  { name: 'Sunset District', lat: 37.7535, lon: -122.4945, tier: 1 },
  { name: 'Richmond District', lat: 37.7798, lon: -122.4822, tier: 1 },
  { name: 'Marina District', lat: 37.8037, lon: -122.4368, tier: 1 },
  { name: 'Pacific Heights', lat: 37.7925, lon: -122.4382, tier: 1 },
  { name: 'Civic Center', lat: 37.7793, lon: -122.4193, tier: 1 },
  { name: 'Telegraph Hill', lat: 37.8024, lon: -122.4058, tier: 2 },
  { name: 'Fisherman’s Wharf', lat: 37.808, lon: -122.4177, tier: 1 },
  { name: 'Mission Bay', lat: 37.7706, lon: -122.3928, tier: 2 },
  { name: 'Potrero Hill', lat: 37.7605, lon: -122.4008, tier: 2 },
  { name: 'Dogpatch', lat: 37.758, lon: -122.3885, tier: 2 },
  { name: 'Hayes Valley', lat: 37.7759, lon: -122.4245, tier: 2 },
  { name: 'Noe Valley', lat: 37.7502, lon: -122.4337, tier: 2 },
  { name: 'Bernal Heights', lat: 37.7412, lon: -122.4156, tier: 2 },
  { name: 'Twin Peaks', lat: 37.7544, lon: -122.4477, tier: 1 },
  { name: 'Golden Gate Park', lat: 37.7694, lon: -122.4862, tier: 1 },
  { name: 'Western Addition', lat: 37.7815, lon: -122.4356, tier: 2 },
  { name: 'Alamo Square', lat: 37.7763, lon: -122.4346, tier: 2 },
  { name: 'Rincon Hill', lat: 37.7862, lon: -122.3924, tier: 2 },
  { name: 'Embarcadero', lat: 37.7995, lon: -122.3975, tier: 2 },
  { name: 'Treasure Island', lat: 37.8235, lon: -122.3706, tier: 1 },
  { name: 'Yerba Buena Island', lat: 37.8105, lon: -122.3655, tier: 2 },
  { name: 'Alcatraz Island', lat: 37.8267, lon: -122.423, tier: 1 },
  { name: 'Marin Headlands', lat: 37.8325, lon: -122.495, tier: 1 },
  { name: 'Sausalito', lat: 37.8591, lon: -122.4853, tier: 1 },
];

export async function bakeLabels(): Promise<void> {
  ensureDirs();
  await fetchOSMData();

  const terrain = new BakedTerrainSampler();
  const osmPath = path.join(CONTEXT_DIR, 'osm', 'sf_osm.json');
  const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));

  const seenNeighborhoods = new Set<string>();
  const neighborhoods: NeighborhoodLabel[] = [];

  for (const n of CANONICAL_NEIGHBORHOODS) {
    seenNeighborhoods.add(n.name.toLowerCase());
    const enu = latLonToENU(n.lat, n.lon);
    const y = Math.max(2, terrain.sampleHeight(enu.x, enu.z)) + 18;
    neighborhoods.push({
      name: n.name,
      lat: n.lat,
      lon: n.lon,
      x: round1(enu.x),
      y: round1(y),
      z: round1(enu.z),
      tier: n.tier,
    });
  }

  for (const el of osm.elements || []) {
    if (el.type === 'node' && el.tags?.place && el.tags?.name) {
      const key = String(el.tags.name).trim().toLowerCase();
      if (seenNeighborhoods.has(key)) continue;
      seenNeighborhoods.add(key);
      const enu = latLonToENU(el.lat, el.lon);
      if (
        enu.x < WORLD_BOUNDS.minX ||
        enu.x > WORLD_BOUNDS.maxX ||
        enu.z < WORLD_BOUNDS.minZ ||
        enu.z > WORLD_BOUNDS.maxZ
      ) {
        continue;
      }
      const y = Math.max(2, terrain.sampleHeight(enu.x, enu.z)) + 14;
      neighborhoods.push({
        name: el.tags.name,
        lat: el.lat,
        lon: el.lon,
        x: round1(enu.x),
        y: round1(y),
        z: round1(enu.z),
        tier: el.tags.place === 'suburb' ? 2 : 3,
      });
    }
  }

  const roadLabels: RoadLabelPlacement[] = [];
  const roadLastPos = new Map<string, { x: number; z: number }[]>();

  for (const el of osm.elements || []) {
    if (el.type !== 'way' || !el.tags?.highway || !el.geometry || el.geometry.length < 2) {
      continue;
    }
    const hw = el.tags.highway;
    const name: string | undefined = el.tags.name;
    const ref: string | undefined = el.tags.ref;
    if (!name && !ref) continue;

    let cls = -1;
    if (hw === 'motorway' || hw === 'trunk') cls = 0;
    else if (hw === 'primary' || hw === 'secondary') cls = 1;
    else if (hw === 'tertiary') cls = 2;
    else if (hw === 'residential') cls = 3;
    else continue;

    const midIdx = Math.floor(el.geometry.length / 2);
    const pA = latLonToENU(
      el.geometry[Math.max(0, midIdx - 1)].lat,
      el.geometry[Math.max(0, midIdx - 1)].lon
    );
    const pB = latLonToENU(
      el.geometry[Math.min(el.geometry.length - 1, midIdx + 1)].lat,
      el.geometry[Math.min(el.geometry.length - 1, midIdx + 1)].lon
    );
    const pMid = latLonToENU(el.geometry[midIdx].lat, el.geometry[midIdx].lon);

    if (
      pMid.x < WORLD_BOUNDS.minX ||
      pMid.x > WORLD_BOUNDS.maxX ||
      pMid.z < WORLD_BOUNDS.minZ ||
      pMid.z > WORLD_BOUNDS.maxZ
    ) {
      continue;
    }

    const segLen = Math.hypot(pB.x - pA.x, pB.z - pA.z);
    if (segLen < 35) continue;

    const labelKey = (name || ref || '').toLowerCase();
    const minSpacing = cls === 0 ? 900 : cls === 1 ? 650 : cls === 2 ? 550 : 480;
    const existing = roadLastPos.get(labelKey) || [];
    let tooClose = false;
    for (const pos of existing) {
      if (Math.hypot(pMid.x - pos.x, pMid.z - pos.z) < minSpacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    existing.push({ x: pMid.x, z: pMid.z });
    roadLastPos.set(labelKey, existing);

    let angle = Math.atan2(pB.z - pA.z, pB.x - pA.x);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;

    const gY = Math.max(0.5, terrain.sampleHeight(pMid.x, pMid.z));
    roadLabels.push({
      name: name || ref!,
      ref,
      cls,
      x: round1(pMid.x),
      y: round1(gY + 1.5),
      z: round1(pMid.z),
      angle: Math.round(angle * 100) / 100,
    });
  }

  const outPath = path.join(PUBLIC_DATA_DIR, 'labels.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      neighborhoods,
      roadLabels: roadLabels.slice(0, 1200),
    })
  );
  console.log(
    `[bake:labels] Baked ${neighborhoods.length} neighborhood labels and ${Math.min(1200, roadLabels.length)} road ribbon labels.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeLabels();
}
