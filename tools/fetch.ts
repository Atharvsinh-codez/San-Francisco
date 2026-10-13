import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  latToTileY,
  lonToTileX,
  WORLD_BOUNDS,
  FAR_BOUNDS,
  enuToLatLon,
} from '../src/world/coords.ts';

export const CONTEXT_DIR = path.resolve(process.cwd(), '.context');
export const PUBLIC_DATA_DIR = path.resolve(process.cwd(), 'public', 'data');

export function ensureDirs() {
  fs.mkdirSync(CONTEXT_DIR, { recursive: true });
  fs.mkdirSync(path.join(CONTEXT_DIR, 'terrarium'), { recursive: true });
  fs.mkdirSync(path.join(CONTEXT_DIR, 'datasf'), { recursive: true });
  fs.mkdirSync(path.join(CONTEXT_DIR, 'osm'), { recursive: true });
  fs.mkdirSync(path.join(CONTEXT_DIR, 'imagery'), { recursive: true });
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DATA_DIR, 'terrain'), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DATA_DIR, 'buildings'), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DATA_DIR, 'roads'), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DATA_DIR, 'landuse'), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DATA_DIR, 'imagery'), { recursive: true });
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<Buffer> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'SF-3D-Offline-Bake/1.0 (Open-Data-Research)',
          ...(options.headers || {}),
        },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

/**
 * 1. Fetch AWS Terrain Tiles (Terrarium PNGs) at z=14 for core SF + Marin + Alcatraz + Treasure Island
 * and z=11 for 80km x 80km Bay Area far-field.
 * Source: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png (Public Domain / USGS 3DEP derived)
 */
export async function fetchTerrariumTiles(): Promise<void> {
  ensureDirs();
  const tasks: { z: number; x: number; y: number }[] = [];

  // Core z=14 tiles
  const zCore = 14;
  const xMin14 = Math.floor(lonToTileX(WORLD_BOUNDS.minLon - 0.02, zCore));
  const xMax14 = Math.floor(lonToTileX(WORLD_BOUNDS.maxLon + 0.02, zCore));
  const yMin14 = Math.floor(latToTileY(WORLD_BOUNDS.maxLat + 0.02, zCore));
  const yMax14 = Math.floor(latToTileY(WORLD_BOUNDS.minLat - 0.02, zCore));

  for (let x = xMin14; x <= xMax14; x++) {
    for (let y = yMin14; y <= yMax14; y++) {
      tasks.push({ z: zCore, x, y });
    }
  }

  // Far-field z=11 tiles
  const zFar = 11;
  const swFar = enuToLatLon(FAR_BOUNDS.minX, FAR_BOUNDS.maxZ);
  const neFar = enuToLatLon(FAR_BOUNDS.maxX, FAR_BOUNDS.minZ);
  const xMin11 = Math.floor(lonToTileX(swFar.lon, zFar));
  const xMax11 = Math.floor(lonToTileX(neFar.lon, zFar));
  const yMin11 = Math.floor(latToTileY(neFar.lat, zFar));
  const yMax11 = Math.floor(latToTileY(swFar.lat, zFar));

  for (let x = xMin11; x <= xMax11; x++) {
    for (let y = yMin11; y <= yMax11; y++) {
      tasks.push({ z: zFar, x, y });
    }
  }

  console.log(`[fetch:terrarium] Ensuring ${tasks.length} Terrarium elevation tiles...`);
  let downloaded = 0;
  const concurrency = 12;

  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ z, x, y }) => {
        const outPath = path.join(CONTEXT_DIR, 'terrarium', `${z}_${x}_${y}.png`);
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) return;
        const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
        const buf = await fetchWithRetry(url);
        fs.writeFileSync(outPath, buf);
        downloaded++;
      })
    );
  }
  console.log(`[fetch:terrarium] Done (${downloaded} new tiles downloaded).`);
}

/**
 * 2. Fetch DataSF Building Footprints (Socrata id `ynuv-fyni`)
 * Contains real building footprints with 2010 lidar stats: hgt_mediancm, gnd_mediancm, p2010_zmaxn88ft.
 * We fetch paged JSON with geometry + height attributes across San Francisco.
 */
export async function fetchDataSFBuildings(): Promise<void> {
  ensureDirs();
  const cachePath = path.join(CONTEXT_DIR, 'datasf', 'buildings_raw.json');
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1_000_000) {
    console.log('[fetch:datasf] Using cached DataSF buildings_raw.json');
    return;
  }

  console.log('[fetch:datasf] Fetching DataSF Building Footprints (ynuv-fyni)...');
  const pageSize = 45000;
  const allRows: any[] = [];

  for (let offset = 0; offset < 200000; offset += pageSize) {
    const selectCols = encodeURIComponent(
      'shape,hgt_mediancm,gnd_mediancm,hgt_maxcm,p2010_zmaxn88ft'
    );
    const url = `https://data.sfgov.org/resource/ynuv-fyni.json?$select=${selectCols}&$limit=${pageSize}&$offset=${offset}&$order=:id`;
    console.log(`  Fetching page offset=${offset}...`);
    try {
      const buf = await fetchWithRetry(url);
      const rows = JSON.parse(buf.toString('utf8'));
      if (!Array.isArray(rows) || rows.length === 0) break;
      allRows.push(...rows);
      console.log(`  Got ${rows.length} footprints (total: ${allRows.length})`);
      if (rows.length < pageSize) break;
    } catch (err) {
      console.warn(`  Warning on DataSF offset ${offset}:`, err);
      break;
    }
  }

  if (allRows.length > 0) {
    fs.writeFileSync(cachePath, JSON.stringify(allRows));
    console.log(`[fetch:datasf] Saved ${allRows.length} DataSF building footprints.`);
  }
}

/**
 * 3. Fetch DataSF Street Trees (Socrata id `tkzw-k3nq`)
 */
export async function fetchDataSFTrees(): Promise<void> {
  ensureDirs();
  const cachePath = path.join(CONTEXT_DIR, 'datasf', 'trees_raw.json');
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 100_000) {
    console.log('[fetch:datasf] Using cached DataSF trees_raw.json');
    return;
  }

  console.log('[fetch:datasf] Fetching DataSF Street Tree Inventory (tkzw-k3nq)...');
  const selectCols = encodeURIComponent('latitude,longitude,species');
  const url = `https://data.sfgov.org/resource/tkzw-k3nq.json?$select=${selectCols}&$where=latitude%20IS%20NOT%20NULL&$limit=50000`;
  try {
    const buf = await fetchWithRetry(url);
    fs.writeFileSync(cachePath, buf);
    const parsed = JSON.parse(buf.toString('utf8'));
    console.log(`[fetch:datasf] Saved ${parsed.length} DataSF street trees.`);
  } catch (err) {
    console.warn('[fetch:datasf] Warning fetching DataSF trees:', err);
  }
}

/**
 * 4. Fetch OpenStreetMap Roads, Water, Parks, Piers, Bridges, Rail, Transit, Neighborhoods, and Tall Buildings via Overpass API
 */
export async function fetchOSMData(): Promise<void> {
  ensureDirs();
  const cachePath = path.join(CONTEXT_DIR, 'osm', 'sf_osm.json');
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 500_000) {
    console.log('[fetch:osm] Using cached OSM data sf_osm.json');
    return;
  }

  console.log('[fetch:osm] Querying OpenStreetMap Overpass API for SF roads, parks, piers, rail, neighborhoods, and buildings...');
  // Bbox covering SF + Golden Gate + Marin Headlands + Alcatraz + Treasure Island
  const bbox = '37.705,-122.525,37.865,-122.345';
  const query = `
[out:json][timeout:90];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|tertiary|residential|pedestrian|footway|path|cycleway|service)$"](${bbox});
  way["railway"~"^(rail|light_rail|subway|tram|cable_car)$"](${bbox});
  way["leisure"~"^(park|pitch|garden|golf_course|stadium)$"](${bbox});
  way["landuse"~"^(grass|forest|recreation_ground|meadow|cemetery|commercial|Residential)$"](${bbox});
  way["natural"~"^(water|sand|beach|wood|scrub)$"](${bbox});
  way["man_made"~"^(pier|breakwater)$"](${bbox});
  node["place"~"^(neighbourhood|suburb|quarter|island|square)$"](${bbox});
  way["building"]["height"](37.76,-122.45,37.81,-122.38);
  way["building:part"](37.77,-122.42,37.805,-122.385);
  way["building"](37.820,-122.485,37.835,-122.415);
);
out body geom;
`.trim();

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      const buf = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
        2
      );
      const text = buf.toString('utf8');
      if (text.trim().startsWith('{')) {
        fs.writeFileSync(cachePath, buf);
        const parsed = JSON.parse(text);
        console.log(`[fetch:osm] Saved ${parsed.elements?.length ?? 0} OSM elements with geometry.`);
        return;
      }
    } catch (err) {
      console.warn(`[fetch:osm] Endpoint ${endpoint} failed, trying next...`);
    }
  }
}

/**
 * 5. Fetch Public-Domain USDA NAIP / USGS National Map Orthoimagery tiles for SF
 * Uses the USGS The National Map public-domain cached imagery tile service (USGSImageryOnly, 0 API keys, 100% public domain NAIP/USGS High Resolution Orthoimagery)
 */
export async function fetchPublicDomainImagery(): Promise<void> {
  ensureDirs();
  const z = 14; // High-res ortho coverage over the entire 20km x 20km SF + Marin + Alcatraz area
  const xMin = Math.floor(lonToTileX(WORLD_BOUNDS.minLon, z));
  const xMax = Math.floor(lonToTileX(WORLD_BOUNDS.maxLon, z));
  const yMin = Math.floor(latToTileY(WORLD_BOUNDS.maxLat, z));
  const yMax = Math.floor(latToTileY(WORLD_BOUNDS.minLat, z));

  const tasks: { z: number; x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tasks.push({ z, x, y });
    }
  }

  console.log(`[fetch:imagery] Fetching ${tasks.length} USGS/NAIP public-domain orthoimagery tiles...`);
  let downloaded = 0;
  const concurrency = 10;

  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ z, x, y }) => {
        const outPath = path.join(CONTEXT_DIR, 'imagery', `usgs_${z}_${x}_${y}.jpg`);
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 500) return;
        // USGS National Map public domain imagery tile server (NAIP + HRO)
        const url = `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`;
        try {
          const buf = await fetchWithRetry(url, {}, 2);
          fs.writeFileSync(outPath, buf);
          downloaded++;
        } catch (err) {
          console.warn(`  Warning fetching ortho tile ${z}/${x}/${y}:`, err);
        }
      })
    );
  }
  console.log(`[fetch:imagery] Done (${downloaded} new ortho tiles downloaded).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    await fetchTerrariumTiles();
    await fetchOSMData();
    await fetchDataSFBuildings();
    await fetchDataSFTrees();
    await fetchPublicDomainImagery();
  })();
}
