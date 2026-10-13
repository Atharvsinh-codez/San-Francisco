import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as jpeg from 'jpeg-js';
import {
  CONTEXT_DIR,
  PUBLIC_DATA_DIR,
  ensureDirs,
  fetchPublicDomainImagery,
} from './fetch.ts';
import {
  WORLD_BOUNDS,
  enuToLatLon,
  lonToTileX,
  latToTileY,
} from '../src/world/coords.ts';

interface DecodedImageryTile {
  width: number;
  height: number;
  data: Uint8Array;
}

const imageryCache = new Map<string, DecodedImageryTile | null>();

function loadImageryTile(z: number, x: number, y: number): DecodedImageryTile | null {
  const key = `${z}_${x}_${y}`;
  if (imageryCache.has(key)) return imageryCache.get(key)!;
  const p = path.join(CONTEXT_DIR, 'imagery', `usgs_${key}.jpg`);
  if (!fs.existsSync(p)) {
    imageryCache.set(key, null);
    return null;
  }
  try {
    const buf = fs.readFileSync(p);
    const decoded = jpeg.decode(buf, { useTArray: true });
    const tile: DecodedImageryTile = {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
    imageryCache.set(key, tile);
    return tile;
  } catch {
    imageryCache.set(key, null);
    return null;
  }
}

/**
 * Colour-balance raw NAIP/NOAA ortho pixel:
 * - Atmospheric haze removal (subtract blue/cyan scatter floor)
 * - True-colour white balance & contrast curve so it reads like Google Earth
 */
export function colorBalanceOrthoRGB(
  rIn: number,
  gIn: number,
  bIn: number
): [number, number, number] {
  // Normalize 0..1
  let r = rIn / 255;
  let g = gIn / 255;
  let b = bIn / 255;

  // Dehaze: remove coastal marine scatter floor (strongest in blue channel)
  r = Math.max(0, (r - 0.03) / 0.97);
  g = Math.max(0, (g - 0.035) / 0.965);
  b = Math.max(0, (b - 0.055) / 0.945);

  // Subtle warm sunlight white-balance
  r *= 1.06;
  g *= 1.02;
  b *= 0.95;

  // Soft S-curve contrast for crisp rooftops and vegetation
  const sCurve = (v: number) => {
    const x = Math.max(0, Math.min(1, v));
    return x * x * (3 - 2 * x) * 0.35 + x * 0.65;
  };
  r = sCurve(r);
  g = sCurve(g);
  b = sCurve(b);

  // Boost natural foliage & terracotta saturation slightly
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = 1.18;
  r = luma + (r - luma) * sat;
  g = luma + (g - luma) * sat;
  b = luma + (b - luma) * sat;

  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(b * 255))),
  ];
}

export function sampleOrthoLatLon(
  lat: number,
  lon: number,
  z = 14
): [number, number, number] {
  const txFloat = lonToTileX(lon, z);
  const tyFloat = latToTileY(lat, z);
  const tx = Math.floor(txFloat);
  const ty = Math.floor(tyFloat);

  const tile = loadImageryTile(z, tx, ty);
  if (!tile) {
    return [195, 190, 182];
  }

  const px = Math.max(
    0,
    Math.min(tile.width - 1, Math.floor((txFloat - tx) * tile.width))
  );
  const py = Math.max(
    0,
    Math.min(tile.height - 1, Math.floor((tyFloat - ty) * tile.height))
  );
  const idx = (py * tile.width + px) * 4;
  return colorBalanceOrthoRGB(
    tile.data[idx],
    tile.data[idx + 1],
    tile.data[idx + 2]
  );
}

/**
 * Bake 4x4 grid of 512x512 ENU-aligned colour-balanced satellite tiles (total 2048x2048 resolution)
 * plus a single 2048x2048 master atlas (`public/data/imagery/sf_ortho_2048.jpg`) for seamless terrain draping.
 */
export async function bakeImagery(): Promise<void> {
  ensureDirs();
  await fetchPublicDomainImagery();

  const atlasSize = 2048;
  const rgba = new Uint8Array(atlasSize * atlasSize * 4);

  console.log(
    `[bake:imagery] Baking ${atlasSize}x${atlasSize} ENU-aligned colour-balanced satellite ortho atlas...`
  );

  for (let py = 0; py < atlasSize; py++) {
    const wz =
      WORLD_BOUNDS.minZ +
      (py / (atlasSize - 1)) * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ);
    for (let px = 0; px < atlasSize; px++) {
      const wx =
        WORLD_BOUNDS.minX +
        (px / (atlasSize - 1)) * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX);
      const { lat, lon } = enuToLatLon(wx, wz);
      const [r, g, b] = sampleOrthoLatLon(lat, lon, 14);
      const idx = (py * atlasSize + px) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }

  const encoded = jpeg.encode(
    { data: rgba, width: atlasSize, height: atlasSize },
    88
  );
  const outPath = path.join(PUBLIC_DATA_DIR, 'imagery', 'sf_ortho_2048.jpg');
  fs.writeFileSync(outPath, encoded.data);
  console.log(
    `[bake:imagery] Saved sf_ortho_2048.jpg (${(encoded.data.byteLength / 1024).toFixed(1)} KB)`
  );

  // Also bake 4x4 quadtree sub-tiles (512x512 each) for per-cell streaming
  const gridN = 4;
  const tileRes = 512;
  for (let tz = 0; tz < gridN; tz++) {
    for (let tx = 0; tx < gridN; tx++) {
      const subRgba = new Uint8Array(tileRes * tileRes * 4);
      for (let y = 0; y < tileRes; y++) {
        const srcY = tz * tileRes + y;
        for (let x = 0; x < tileRes; x++) {
          const srcX = tx * tileRes + x;
          const srcIdx = (srcY * atlasSize + srcX) * 4;
          const dstIdx = (y * tileRes + x) * 4;
          subRgba[dstIdx] = rgba[srcIdx];
          subRgba[dstIdx + 1] = rgba[srcIdx + 1];
          subRgba[dstIdx + 2] = rgba[srcIdx + 2];
          subRgba[dstIdx + 3] = 255;
        }
      }
      const subJpg = jpeg.encode(
        { data: subRgba, width: tileRes, height: tileRes },
        88
      );
      fs.writeFileSync(
        path.join(PUBLIC_DATA_DIR, 'imagery', `tile_${tx}_${tz}.jpg`),
        subJpg.data
      );
    }
  }
  console.log('[bake:imagery] Saved 16 quadtree imagery tiles.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeImagery();
}
