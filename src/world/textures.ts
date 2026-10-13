// Procedural DataArrayTexture generator matching jeantimex/tokyo/src/world/textures.js
// Generates the 6-layer wall texture array (TILE, CONCRETE, PLASTER, BRICK, SIDING, ROOF)
// and 4-layer ground texture array (ASPHALT, PAVERS, GRASS, CONCRETE) with detail albedo (mean 127.5) and tangent normal maps.
import * as THREE from 'three';

const SIZE = 256;

export const WALL_LAYERS = [
  { key: 'wall_tile', scale: 1.3, detail: 0.8 },
  { key: 'wall_concrete', scale: 3.2, detail: 0.75 },
  { key: 'wall_plaster', scale: 2.6, detail: 0.3 },
  { key: 'wall_brick', scale: 0.85, detail: 0.8 },
  { key: 'wall_siding', scale: 1.6, detail: 0.6 },
  { key: 'roof', scale: 5.0, detail: 0.6 },
];

export const GROUND_LAYERS = [
  { key: 'asphalt', scale: 5.0 },
  { key: 'pavers', scale: 2.2 },
  { key: 'grass', scale: 3.0 },
  { key: 'ground', scale: 4.0 },
];

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function synthesizeLayer(key: string, idx: number): { diff: Uint8Array; nor: Uint8Array } {
  const heightField = new Float32Array(SIZE * SIZE);
  const diff = new Uint8Array(SIZE * SIZE * 4);
  const nor = new Uint8Array(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n1 = hash2(x, y, idx * 17 + 1);
      const n2 = hash2(x >> 1, y >> 1, idx * 31 + 7);
      const n4 = hash2(x >> 2, y >> 2, idx * 47 + 13);
      let h = 0.5 + (n1 - 0.5) * 0.14 + (n2 - 0.5) * 0.18 + (n4 - 0.5) * 0.22;

      if (key === 'wall_tile') {
        const gx = x % 16;
        const gy = y % 8;
        const mortar = gx === 0 || gy === 0 ? -0.25 : 0.045;
        const bevel = gx === 1 || gy === 1 || gx === 15 || gy === 7 ? -0.05 : 0.0;
        const tileShade = (hash2((x / 16) | 0, (y / 8) | 0, 101) - 0.5) * 0.14;
        h += mortar + bevel + tileShade;
      } else if (key === 'wall_brick') {
        const row = (y / 8) | 0;
        const gx = (x + (row % 2) * 8) % 16;
        const gy = y % 8;
        const mortar = gx < 2 || gy < 2 ? -0.28 : 0.065;
        const brickShade = (hash2(((x + (row % 2) * 8) / 16) | 0, row, 202) - 0.5) * 0.2;
        h += mortar + brickShade;
      } else if (key === 'wall_siding') {
        const lap = ((y % 10) / 10 - 0.5) * 0.22;
        const shadowEdge = y % 10 === 0 ? -0.18 : 0.0;
        const woodGrain = (hash2(x >> 2, y, 303) - 0.5) * 0.08;
        h += lap + shadowEdge + woodGrain;
      } else if (key === 'wall_concrete') {
        const formJoint = x % 64 === 0 || y % 32 === 0 ? -0.18 : 0.0;
        const tieHole =
          ((x + 16) % 32 === 0 && (y + 8) % 16 === 0) ||
          ((x + 16) % 32 === 1 && (y + 8) % 16 === 0)
            ? -0.22
            : 0.0;
        h += formJoint + tieHole;
      } else if (key === 'roof') {
        const gravel = (hash2(x, y, 404) - 0.5) * 0.22;
        const seam = x % 32 === 0 || y % 32 === 0 ? 0.12 : 0.0;
        h += gravel + seam;
      } else if (key === 'pavers') {
        const row = (y / 16) | 0;
        const gx = (x + (row % 2) * 16) % 32;
        const gy = y % 16;
        h += gx === 0 || gy === 0 ? -0.22 : 0.035;
      }

      heightField[y * SIZE + x] = Math.max(0.1, Math.min(0.95, h));
    }
  }

  let sum = 0;
  for (let i = 0; i < SIZE * SIZE; i++) sum += heightField[i];
  const mean = sum / (SIZE * SIZE) || 0.5;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const p4 = i * 4;
      const val = Math.max(0, Math.min(255, Math.round((heightField[i] / mean) * 127.5)));
      diff[p4] = val;
      diff[p4 + 1] = val;
      diff[p4 + 2] = val;
      diff[p4 + 3] = 255;

      const hL = heightField[y * SIZE + ((x - 1 + SIZE) % SIZE)];
      const hR = heightField[y * SIZE + ((x + 1) % SIZE)];
      const hD = heightField[((y - 1 + SIZE) % SIZE) * SIZE + x];
      const hU = heightField[((y + 1) % SIZE) * SIZE + x];
      const dx = (hL - hR) * 2.2;
      const dy = (hD - hU) * 2.2;
      const len = Math.hypot(dx, dy, 1.0);
      nor[p4] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      nor[p4 + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      nor[p4 + 2] = Math.round(((1.0 / len) * 0.5 + 0.5) * 255);
      nor[p4 + 3] = 255;
    }
  }

  return { diff, nor };
}

function arrayTexture(layers: Uint8Array[], renderer: THREE.WebGLRenderer): THREE.DataArrayTexture {
  const data = new Uint8Array(SIZE * SIZE * 4 * layers.length);
  layers.forEach((l, i) => data.set(l, i * SIZE * SIZE * 4));
  const t = new THREE.DataArrayTexture(data, SIZE, SIZE, layers.length);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

export interface TextureSet {
  albedo: THREE.DataArrayTexture;
  normal: THREE.DataArrayTexture;
  scales: number[];
  details: number[];
}

function buildSet(
  defs: { key: string; scale: number; detail?: number }[],
  renderer: THREE.WebGLRenderer
): TextureSet {
  const synthesized = defs.map((d, idx) => synthesizeLayer(d.key, idx));
  return {
    albedo: arrayTexture(
      synthesized.map((s) => s.diff),
      renderer
    ),
    normal: arrayTexture(
      synthesized.map((s) => s.nor),
      renderer
    ),
    scales: defs.map((d) => d.scale),
    details: defs.map((d) => d.detail ?? 1),
  };
}

export function buildTexturesSync(
  renderer: THREE.WebGLRenderer
): { wall: TextureSet; ground: TextureSet } {
  return {
    wall: buildSet(WALL_LAYERS, renderer),
    ground: buildSet(GROUND_LAYERS, renderer),
  };
}

export async function loadTextures(
  renderer: THREE.WebGLRenderer
): Promise<{ wall: TextureSet; ground: TextureSet }> {
  return buildTexturesSync(renderer);
}
