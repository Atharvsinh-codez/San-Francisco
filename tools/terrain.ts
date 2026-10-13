import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import {
  CONTEXT_DIR,
  PUBLIC_DATA_DIR,
  ensureDirs,
  fetchTerrariumTiles,
} from './fetch.ts';
import {
  WORLD_BOUNDS,
  FAR_BOUNDS,
  enuToLatLon,
  lonToTileX,
  latToTileY,
} from '../src/world/coords.ts';

interface DecodedTile {
  width: number;
  height: number;
  data: Buffer;
}

const tileCache = new Map<string, DecodedTile | null>();

function loadTerrariumTile(z: number, x: number, y: number): DecodedTile | null {
  const key = `${z}_${x}_${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;
  const p = path.join(CONTEXT_DIR, 'terrarium', `${key}.png`);
  if (!fs.existsSync(p)) {
    tileCache.set(key, null);
    return null;
  }
  try {
    const buf = fs.readFileSync(p);
    const png = PNG.sync.read(buf);
    const decoded = { width: png.width, height: png.height, data: png.data };
    tileCache.set(key, decoded);
    return decoded;
  } catch {
    tileCache.set(key, null);
    return null;
  }
}

/**
 * Sample elevation (meters NAVD88) from cached Terrarium PNG tiles at given (lat, lon)
 * Terrarium encoding: height_m = (R * 256 + G + B / 256) - 32768
 */
export function sampleTerrariumLatLon(lat: number, lon: number, z = 14): number {
  const txFloat = lonToTileX(lon, z);
  const tyFloat = latToTileY(lat, z);
  const tx = Math.floor(txFloat);
  const ty = Math.floor(tyFloat);

  const tile = loadTerrariumTile(z, tx, ty);
  if (!tile) {
    if (z === 14) return sampleTerrariumLatLon(lat, lon, 11);
    return 0;
  }

  // Bilinear interpolation within the 256x256 tile
  const u = (txFloat - tx) * (tile.width - 1);
  const v = (tyFloat - ty) * (tile.height - 1);
  const x0 = Math.max(0, Math.min(tile.width - 1, Math.floor(u)));
  const y0 = Math.max(0, Math.min(tile.height - 1, Math.floor(v)));
  const x1 = Math.min(tile.width - 1, x0 + 1);
  const y1 = Math.min(tile.height - 1, y0 + 1);
  const fx = u - x0;
  const fy = v - y0;

  const readH = (px: number, py: number) => {
    const idx = (py * tile.width + px) * 4;
    const r = tile.data[idx];
    const g = tile.data[idx + 1];
    const b = tile.data[idx + 2];
    return r * 256 + g + b / 256 - 32768;
  };

  const h00 = readH(x0, y0);
  const h10 = readH(x1, y0);
  const h01 = readH(x0, y1);
  const h11 = readH(x1, y1);

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fy) + h1 * fy;
}

/**
 * Bake Core DEM (513x513 float32 over 20km x 20km core SF) + Far DEM (257x257 float32 over 80km x 80km)
 * + Quadtree LOD tiles for runtime streaming.
 */
export async function bakeTerrain(): Promise<void> {
  ensureDirs();
  await fetchTerrariumTiles();

  const coreGridSize = 513; // ~39m spacing across 20km x 20km, bilinearly interpolated
  const coreData = new Float32Array(coreGridSize * coreGridSize);

  console.log(`[bake:terrain] Baking Core DEM (${coreGridSize}x${coreGridSize}) from z14 Terrarium / USGS 3DEP...`);
  let maxElev = -Infinity;
  let minElev = Infinity;

  for (let iz = 0; iz < coreGridSize; iz++) {
    const wz =
      WORLD_BOUNDS.minZ +
      (iz / (coreGridSize - 1)) * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ);
    for (let ix = 0; ix < coreGridSize; ix++) {
      const wx =
        WORLD_BOUNDS.minX +
        (ix / (coreGridSize - 1)) * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX);
      const { lat, lon } = enuToLatLon(wx, wz);
      let h = sampleTerrariumLatLon(lat, lon, 14);

      // Clean bathymetry / coastline noise: Terrarium has slight compression noise near 0m (-1.5m to +0.8m on open water)
      // Preserve true underwater depth (Golden Gate strait reaches -100m, Bay channel -15m to -35m)
      if (h < 0.65 && h > -1.5) {
        h = -2.5;
      }
      if (h > maxElev) maxElev = h;
      if (h < minElev) minElev = h;
      coreData[iz * coreGridSize + ix] = h;
    }
  }

  const corePath = path.join(PUBLIC_DATA_DIR, 'terrain', 'core_dem.bin');
  fs.writeFileSync(corePath, Buffer.from(coreData.buffer));
  console.log(
    `[bake:terrain] Saved core_dem.bin (${(coreData.byteLength / 1024).toFixed(1)} KB, min=${minElev.toFixed(1)}m, max=${maxElev.toFixed(1)}m)`
  );

  // Bake Far-field DEM (257x257 over 80km x 80km)
  const farGridSize = 257;
  const farData = new Float32Array(farGridSize * farGridSize);
  console.log(`[bake:terrain] Baking Far-Field DEM (${farGridSize}x${farGridSize}) from z11 Terrarium...`);

  for (let iz = 0; iz < farGridSize; iz++) {
    const wz =
      FAR_BOUNDS.minZ +
      (iz / (farGridSize - 1)) * (FAR_BOUNDS.maxZ - FAR_BOUNDS.minZ);
    for (let ix = 0; ix < farGridSize; ix++) {
      const wx =
        FAR_BOUNDS.minX +
        (ix / (farGridSize - 1)) * (FAR_BOUNDS.maxX - FAR_BOUNDS.minX);
      const { lat, lon } = enuToLatLon(wx, wz);
      let h = sampleTerrariumLatLon(lat, lon, 11);
      if (h < 0.8 && h > -2.0) h = -3.0;
      farData[iz * farGridSize + ix] = h;
    }
  }

  const farPath = path.join(PUBLIC_DATA_DIR, 'terrain', 'far_dem.bin');
  fs.writeFileSync(farPath, Buffer.from(farData.buffer));

  // Write terrain metadata manifest
  const manifest = {
    core: {
      gridSize: coreGridSize,
      minX: WORLD_BOUNDS.minX,
      maxX: WORLD_BOUNDS.maxX,
      minZ: WORLD_BOUNDS.minZ,
      maxZ: WORLD_BOUNDS.maxZ,
      minElev,
      maxElev,
      file: 'terrain/core_dem.bin',
    },
    far: {
      gridSize: farGridSize,
      minX: FAR_BOUNDS.minX,
      maxX: FAR_BOUNDS.maxX,
      minZ: FAR_BOUNDS.minZ,
      maxZ: FAR_BOUNDS.maxZ,
      file: 'terrain/far_dem.bin',
    },
  };
  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'terrain', 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('[bake:terrain] Terrain bake complete.');
}

/**
 * Helper class to load baked `core_dem.bin` in Node tools so buildings, roads, trees, and landmarks
 * are placed on the EXACT same heightfield mesh that the browser renders.
 */
export class BakedTerrainSampler {
  private coreData: Float32Array;
  private gridSize = 513;

  constructor() {
    const corePath = path.join(PUBLIC_DATA_DIR, 'terrain', 'core_dem.bin');
    const buf = fs.readFileSync(corePath);
    this.coreData = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength / 4
    );
  }

  public sampleHeight(x: number, z: number): number {
    const u =
      ((x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)) *
      (this.gridSize - 1);
    const v =
      ((z - WORLD_BOUNDS.minZ) / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ)) *
      (this.gridSize - 1);

    const x0 = Math.max(0, Math.min(this.gridSize - 1, Math.floor(u)));
    const z0 = Math.max(0, Math.min(this.gridSize - 1, Math.floor(v)));
    const x1 = Math.min(this.gridSize - 1, x0 + 1);
    const z1 = Math.min(this.gridSize - 1, z0 + 1);
    const fx = Math.max(0, Math.min(1, u - x0));
    const fz = Math.max(0, Math.min(1, v - z0));

    const h00 = this.coreData[z0 * this.gridSize + x0];
    const h10 = this.coreData[z0 * this.gridSize + x1];
    const h01 = this.coreData[z1 * this.gridSize + x0];
    const h11 = this.coreData[z1 * this.gridSize + x1];

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeTerrain();
}
