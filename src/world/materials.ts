// Materials ported directly from jeantimex/tokyo/src/world/materials.js
// Buildings and ground are MeshStandardMaterials patched with procedural detail via onBeforeCompile,
// keeping Three.js lighting, shadows, fog, environment reflections, planar water mirror, and volumetric cloud reflections.
import * as THREE from 'three';
import { WORLD_BOUNDS } from './coords';
import type { TextureSet } from './textures';

export const shared = {
  uNight: { value: 0 },
  uDark: { value: 0 },
  uTime: { value: 0 },
  uOrtho: { value: null as THREE.Texture | null },
  uOrthoRect: {
    value: new THREE.Vector4(
      WORLD_BOUNDS.minX,
      WORLD_BOUNDS.minZ,
      WORLD_BOUNDS.width,
      WORLD_BOUNDS.height
    ),
  },
  uOrthoOn: { value: 0 },
  uWindowLife: { value: new THREE.Vector2(0.5, 0) },
  uCityGlass: { value: 1.0 },
  uRoomLight: { value: 1.75 },
  uSoft: { value: 1 },
  uTreeGlow: { value: new THREE.Color(0, 0, 0) },
  uSeason: { value: 0 },
  uContact: { value: 0 },
  uContactMap: { value: null as THREE.Texture | null },
  uContactRect: { value: new THREE.Vector4(0, 0, 1, 0) },
  uGlass: { value: 2 },
  uNightBlue: { value: 0.55 },
  uLampOn: { value: 0 },
  uLampMap: { value: null as THREE.Texture | null },
  uLampRect: { value: new THREE.Vector4(0, 0, 1, 0) },
  uMirror: { value: null as THREE.Texture | null },
  uMirrorMatrix: { value: new THREE.Matrix4() },
  uMirrorOn: { value: 0 },
  uCloudMap: { value: null as THREE.Texture | null },
  uCloudOffset: { value: new THREE.Vector2() },
  uCloudCover: { value: 0.35 },
  uCloudBase: { value: 450 },
  uCloudsOn: { value: 1 },
  uWorldToECEF: { value: new THREE.Matrix4() },
  uCloudRect: {
    value: new THREE.Vector4(
      WORLD_BOUNDS.minX,
      WORLD_BOUNDS.minZ,
      WORLD_BOUNDS.maxX,
      WORLD_BOUNDS.maxZ
    ),
  },
  uCloudFade: { value: 1500 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
  uSunGlint: { value: new THREE.Color(1, 0.96, 0.9) },
  uGlintOn: { value: 2.0 },
  uPhotoRange: { value: new THREE.Vector2(140, 420) },
  uPhotoMix: { value: 1 },
};

export const variant = {
  abstract: false,
  landmarks: true,
  windows: true,
  contact: false,
  relief: true,
};

const varying = new Set<THREE.Material>();
export const variantKey = () =>
  (variant.abstract ? 'a' : '') +
  (variant.abstract && variant.landmarks ? 'l' : '') +
  (variant.windows ? '' : 'w') +
  (variant.relief ? 'r' : '');

export function varies<T extends THREE.Material>(material: T): T {
  varying.add(material);
  material.addEventListener('dispose', () => varying.delete(material));
  return material;
}

export function setVariant(changes: Partial<typeof variant>): void {
  Object.assign(variant, changes);
  for (const m of varying) m.needsUpdate = true;
}

export const ABSTRACT = {
  shop: [0.47, 0.42, 0.33],
  home: [0.4, 0.405, 0.47],
  land: [0.36, 0.36, 0.38],
  paving: [0.4, 0.4, 0.43],
  water: [0.2, 0.36, 0.6],
  night: {
    shop: [0.06, 0.05, 0.045],
    home: [0.034, 0.052, 0.08],
    land: [0.012, 0.022, 0.031],
    tree: [0.006, 0.06, 0.058],
  },
};
const v3 = (c: number[]) => `vec3(${c.join(', ')})`;

const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float box(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x);
}
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
`;

const WORLD_VARYINGS_VERT = 'varying vec3 vWPos;\nvarying vec3 vWNrm;';
const WORLD_VARYINGS_SET =
  'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * normal);';
const APPLY_NORMAL = /* glsl */ `
normal = normalize((viewMatrix * vec4(normalize(gT * gNm.x + gB * gNm.y + gN * gNm.z), 0.0)).xyz);
`;

const FACADE_PARS = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform vec2 uWindowLife;
uniform float uCityGlass;
uniform float uRoomLight;
uniform float uSoft;
uniform float uGlass;
uniform float uNightBlue;
uniform vec3 uSunDir;
uniform vec3 uSunGlint;
uniform float uGlintOn;
uniform sampler2DArray uWallAlb;
uniform sampler2DArray uWallNor;
uniform float uWallScale[6];
uniform float uWallDetail[6];
varying vec4 vFacade;
varying vec4 vBldg;
varying vec3 vWPos;
varying vec3 vWNrm;
float gRough, gMetal;
vec3 gGlint = vec3(0.0);
float gPane = 0.0;
vec3 gEmissive, gT, gB, gN, gNm;
${NOISE}
`;

const FACADE_MAIN = /* glsl */ `
{
  gN = normalize(vWNrm);
  gT = abs(gN.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), gN));
  gB = cross(gN, gT);
  float seed = vFacade.w, height = vBldg.x, kind = vBldg.z, cellW = vBldg.w;
  float layer = clamp(floor(vBldg.y / 8.0 + 0.01), 0.0, 5.0), cat = vBldg.y - layer * 8.0;
  float u = vFacade.x, v = vFacade.y, floorH = vFacade.z;

  vec2 st = vec2(dot(vWPos, gT), dot(vWPos, gB));
  vec3 tuv = vec3(st / uWallScale[int(layer)], layer);
  vec3 wall = diffuseColor.rgb * mix(vec3(1.0), texture(uWallAlb, tuv).rgb * 2.0, uWallDetail[int(layer)]);
  wall *= 0.9 + 0.2 * vnoise(st * 0.11 + seed * 50.0);
  gNm = texture(uWallNor, tuv).xyz * 2.0 - 1.0;
  gNm = normalize(vec3(gNm.xy * 0.7, gNm.z));
  gRough = 0.82; gMetal = 0.0; gEmissive = vec3(0.0);
  if (layer > 3.5 && layer < 4.5) { gRough = 0.5; gMetal = 0.35; }

  if (kind < 0.5 || (kind > 1.5 && kind < 2.5)) {
    float streak = vnoise(vec2(st.x * 2.2, st.y * 0.13 + seed * 40.0));
    float grime = smoothstep(0.55, 0.95, streak) * 0.11
      + (1.0 - smoothstep(0.0, 2.2, v)) * 0.16
      + smoothstep(height - 2.2, height, v) * streak * 0.15;
    wall *= 1.0 - grime;
    // Subtle architectural floor slab spandrel band & cornice trim
    if (kind < 0.5 && floorH > 2.2) {
      float fyBand = fract(v / floorH);
      float spandrel = smoothstep(0.92, 0.96, fyBand) + (1.0 - smoothstep(0.0, 0.04, fyBand));
      float cornice = smoothstep(height - 0.75, height - 0.15, v);
      wall = mix(wall, wall * (cat > 4.5 ? 0.72 : 0.86), clamp(spandrel * 0.55, 0.0, 1.0));
      wall = mix(wall, wall * 1.14, cornice * (cat < 4.5 ? 0.65 : 0.15));
      gRough = clamp(gRough + (vnoise(st * 0.45 + seed * 19.0) - 0.5) * 0.14, 0.35, 0.95);
    }
  }
  diffuseColor.rgb = wall;

  if (kind > 3.5) {
    float lampOn = step(1.5, max(vColor.r, max(vColor.g, vColor.b)));
    diffuseColor.rgb = mix(vColor.rgb * (0.94 + 0.12 * vnoise(st * 0.7)), vec3(0.12), lampOn);
    gRough = 0.5; gMetal = 0.25; gNm = vec3(0.0, 0.0, 1.0);
    float beat = fract(uTime / 1.6), flash = mix(1.0, 0.08 + 0.92 * smoothstep(0.0, 0.07, beat) * (1.0 - smoothstep(0.45, 0.58, beat)), lampOn * step(vColor.g, 0.037 * vColor.r));
    vec3 steel = vColor.r > 2.0 * vColor.g ? vec3(0.5, 0.03, 0.012) : vColor.rgb * vec3(0.62, 0.46, 0.22);
    gEmissive = mix(steel, vColor.rgb * 1.6 * flash, lampOn) * uNight;
  }

  if (kind < 0.5 && cellW > 0.5) {
    float fyAll = v / floorH, row = floor(fyAll), col = floor(u);
    float sid = floor(seed * 4096.0 + 0.5);
    vec2 room = vec2(col + mod(sid, 61.0) * 17.0, row + mod(sid, 53.0) * 13.0);
    float fx = fract(u), fy = fract(fyAll);
    float wx = max(fwidth(u), 1e-4), wy = max(fwidth(fyAll), 1e-4);
    float far = smoothstep(0.2, 0.6, max(wx, wy));

    vec4 r = vec4(0.14, 0.86, 0.3, 0.82);
    if (cat < 0.5) r = vec4(0.26, 0.74, 0.36, 0.78);
    else if (cat > 3.5 && cat < 4.5) r = vec4(0.16, 0.84, 0.3, 0.8);
    else if (cat > 4.5) r = vec4(0.0, 1.0, 0.26, 1.0);
    bool shop = row < 0.5 && cat > 1.5 && cat < 3.5;
    if (shop) r = vec4(0.05, 0.95, 0.03, 0.8);
    float valid = step(0.0, v) * step(v, height - 0.9);
    if (cat < 2.5 && !shop) valid *= step(0.2, hash12(room + 41.0));
    float inWin = box(fx, r.x, r.y, wx) * box(fy, r.z, r.w, wy) * valid;

    vec2 wmin = vec2(r.x * cellW, r.z * floorH), wmax = vec2(r.y * cellW, r.w * floorH);
    vec2 pm = vec2(fx * cellW, fy * floorH);
    float edge = min(min(pm.x - wmin.x, wmax.x - pm.x), min(pm.y - wmin.y, wmax.y - pm.y));
    float fw = cat > 4.5 ? 0.048 : 0.072, ew = max(fwidth(edge), 1e-4);
    float frame = 1.0 - smoothstep(fw - ew, fw + ew, edge);
    float panes = max(1.0, floor((wmax.x - wmin.x) / (cat < 1.5 ? 0.95 : 1.25) + 0.5));
    float mx = fract((pm.x - wmin.x) / (wmax.x - wmin.x) * panes);
    float mw = 0.032 * panes / (wmax.x - wmin.x);
    frame = max(frame, panes > 1.5 ? 1.0 - box(mx, mw, 1.0 - mw, max(fwidth(mx), 1e-4)) : 0.0);
    // Horizontal double-hung sash bar on San Francisco Victorian/Edwardian homes & apartments
    float wyNorm = (pm.y - wmin.y) / max(wmax.y - wmin.y, 0.1);
    float sash = (cat < 2.5 && !shop) ? 1.0 - box(wyNorm, 0.48, 0.53, max(fwidth(wyNorm), 1e-4)) : 0.0;
    float transomBar = (shop || (cat > 2.5 && cat < 4.5)) ? 1.0 - box(wyNorm, 0.74, 0.78, max(fwidth(wyNorm), 1e-4)) : 0.0;
    frame = max(frame, max(sash, transomBar) * 0.88);
    frame *= 1.0 - far;
    float pane = inWin * (1.0 - frame);

    vec3 V = normalize(vWPos - cameraPosition);
    vec3 rd = vec3(dot(V, gT) / cellW, dot(V, gB) / floorH, dot(V, gN) / 4.2) + vec3(1e-5, 1e-5, 0.0);
    vec3 ro = vec3(fx, fy, 0.0);
    vec2 tA = (step(0.0, rd.xy) - ro.xy) / rd.xy;
    float tz = -1.0 / min(rd.z, -1e-4);
    float tHit = min(min(tA.x, tA.y), tz);
    vec3 hp = ro + rd * tHit;
    float rh = hash12(room);
    vec3 interior = mix(vec3(0.76, 0.70, 0.61), vec3(0.60, 0.64, 0.70), rh);
    float shade = 0.64;
    if (tHit == tz) {
      // Back wall of 3D room: warm wall + bookshelf/artwork/desk silhouette
      float shelf = step(0.2, hp.x) * step(hp.x, 0.8) * step(0.18, hp.y) * step(hp.y, 0.78);
      float bars = step(0.45, fract(hp.y * 5.0)) * shelf;
      float monitorGlow = step(2.5, cat) * step(0.38, hp.x) * step(hp.x, 0.64) * step(0.32, hp.y) * step(hp.y, 0.54) * step(0.45, hash12(room + 19.0));
      shade = 0.52 + 0.26 * step(0.42, hp.y) - 0.16 * bars + 0.35 * monitorGlow;
    } else if (tHit == tA.y) {
      // Ceiling (rd.y > 0) with recessed linear office troffers or warm pendant light
      float ceilingGrid = step(0.65, fract(hp.x * 3.0)) * step(0.55, fract(-hp.z * 2.5));
      shade = rd.y > 0.0 ? (0.92 + 0.45 * ceilingGrid) : 0.36;
    } else {
      // Side partition wall with framed picture / doorway contrast
      float art = step(0.3, hp.y) * step(hp.y, 0.72) * step(0.25, -hp.z) * step(-hp.z, 0.75);
      shade = 0.56 - 0.14 * art;
    }
    interior *= shade * mix(1.0, 0.48, clamp(-hp.z, 0.0, 1.0));
    float blind = step(0.48, hash12(room + 7.7)) * hash12(room + 3.1);
    float wyLocal = (fy - r.z) / (r.w - r.z);
    if (!shop && wyLocal > 1.0 - blind * 0.85) {
      float slats = 0.9 + 0.1 * sin(wyLocal * 42.0);
      interior = mix(vec3(0.82, 0.79, 0.73), vec3(0.68, 0.71, 0.75), rh) * 0.78 * slats;
    }
    interior = mix(interior, vec3(0.42, 0.42, 0.4), far);

    float onRate = shop ? 0.75 : cat > 2.5 ? 0.32 : 0.22;
    float b1 = fract(seed * 11.7), b2 = fract(seed * 17.3), b3 = fract(seed * 23.9);
    onRate *= mix(0.35, 1.9, b1);
    if (!shop && cat > 2.5 && b2 > 0.4) onRate = mix(0.05, 0.9, step(0.5, hash12(vec2(row * 3.0 + mod(sid, 37.0), mod(sid, 53.0)))));
    float tall = smoothstep(70.0, 110.0, height);
    if (!shop) onRate = mix(onRate, 0.02 + 0.8 * step(0.9, hash12(vec2(row * 5.0 + mod(sid, 41.0), mod(sid, 59.0)))), tall);
    onRate = clamp(onRate, 0.0, 0.95);

    float fickle = step(1.0 - uWindowLife.x, hash12(room + 31.0));
    float period = 90.0 + 240.0 * hash12(room + 37.0);
    float clock = uWindowLife.y / period + hash12(room + 41.0) * 64.0, slot = floor(clock);
    vec2 was = vec2(mod(slot - 1.0, 61.0) * 7.13, mod(slot - 1.0, 47.0) * 3.71), now = vec2(mod(slot, 61.0) * 7.13, mod(slot, 47.0) * 3.71);
    float lit = mix(step(1.0 - onRate, hash12(room + 43.0 + was)), step(1.0 - onRate, hash12(room + 43.0 + now)), smoothstep(0.0, 4.0 / period, fract(clock)));
    float on = mix(step(1.0 - onRate, hash12(room + 23.0)), lit, fickle);

    float tint = hash12(room + 61.0), office = step(2.5, cat);
    vec3 warm = mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.82, 0.6), hash12(room + 67.0));
    vec3 cool = mix(vec3(1.0, 0.95, 0.86), mix(vec3(0.78, 0.9, 1.0), vec3(0.42, 0.66, 1.0), uNightBlue), hash12(room + 71.0));
    float coolShare = mix(0.25, mix(0.12, 0.95, step(0.35, b2)), office) + 0.45 * uNightBlue;
    vec3 lamp = mix(warm, cool, step(1.0 - coolShare, mix(tint, 0.5 * b3 + 0.5 * tint, office)));
    lamp = mix(lamp, vec3(0.3, 0.55, 1.0), step(0.93 - 0.22 * uNightBlue, tint) * mix(1.0 - office, 1.0, uNightBlue));
    float glow = mix(0.3, 1.35, hash12(room + 1.3)) * mix(0.65, 1.25, b3);

    vec3 glassTint = cat > 4.5
      ? mix(vec3(0.14, 0.24, 0.34), vec3(0.22, 0.29, 0.33), fract(seed * 5.7))
      : mix(vec3(0.08, 0.11, 0.14), vec3(0.12, 0.15, 0.18), fract(seed * 9.1));
    vec3 frameCol = cat < 1.5
      ? (fract(seed * 3.3) < 0.68 ? vec3(0.88, 0.86, 0.81) : vec3(0.24, 0.22, 0.20))
      : (fract(seed * 3.3) < 0.5 ? vec3(0.16, 0.17, 0.19) : vec3(0.64, 0.65, 0.66));
    diffuseColor.rgb = mix(diffuseColor.rgb, frameCol, inWin * frame);
    diffuseColor.rgb = mix(diffuseColor.rgb, glassTint, pane);
    gRough = mix(gRough, 0.42, inWin * frame);
    gRough = mix(gRough, 0.035, pane);
    gMetal = mix(gMetal, 0.94, pane);
    float tilt = 0.011;
    gNm = mix(gNm, normalize(vec3((hash12(room + 5.1) - 0.5) * tilt, (hash12(room + 9.4) - 0.5) * tilt, 1.0)), inWin);
    float daylight = (1.0 - uNight) * (shop ? 0.36 : cat > 4.5 ? 0.10 : 0.18);
    {
      vec2 inPane = vec2((fx - r.x) / (r.y - r.x), (fy - r.z) / (r.w - r.z));
      vec2 lampAt = vec2(0.25 + 0.5 * hash12(room + 12.1), 0.55 + 0.35 * hash12(room + 14.9));
      float fall = mix(1.0, 0.32 + 0.95 * exp(-3.2 * dot(inPane - lampAt, inPane - lampAt)), uSoft);
      float curtain = step(0.52, hash12(room + 16.3)) * uSoft * (shop ? 0.0 : 1.0);
      vec3 cloth = mix(vec3(0.95, 0.82, 0.62), vec3(0.85, 0.86, 0.84), hash12(room + 18.7)) * 0.42;
      vec3 soft = mix(lamp, mix(vec3(1.0, 0.8, 0.58), lamp, 0.45), uSoft);
      vec3 room3 = mix(interior * fall, cloth * (0.75 + 0.35 * fall), curtain);
      float power = uNight * on * glow * mix(1.25, 0.78, uSoft) * uRoomLight;
      gEmissive = pane * (interior * daylight + room3 * soft * power);
      float spill = uSoft * (1.0 - far) * valid * power * 0.16;
      gEmissive += soft * spill * (inWin * frame * 0.6 + (1.0 - inWin) * exp(min(edge, 0.0) * 4.5) * step(-0.9, edge));
    }
    {
      vec3 wobble = vec3(vnoise(st * 0.8 + seed * 9.0) - 0.5, vnoise(st * 0.8 + 31.0 + seed * 9.0) - 0.5, 0.0) * 0.035;
      vec3 paneN = normalize(gT * (gNm.x + wobble.x) + gB * (gNm.y + wobble.y) + gN * gNm.z);
      float s = max(dot(reflect(normalize(vWPos - cameraPosition), paneN), uSunDir), 0.0);
      gGlint = pane * uGlintOn * uSunGlint * (pow(s, 1400.0) * 14.0 + pow(s, 90.0) * 0.35 + pow(s, 7.0) * 0.1) * step(0.0, dot(gN, uSunDir));
      vec3 toEye = normalize(cameraPosition - vWPos);
      float graze = pow(1.0 - max(dot(toEye, gN), 0.0), 3.0);
      gGlint += pane * uGlass * uSunGlint * 0.035 * max(dot(paneN, uSunDir), 0.0) * (0.6 + 0.8 * hash12(room + 15.7));
      gEmissive += pane * uGlass * (1.0 - uNight) * vec3(0.45, 0.6, 0.82) * (0.015 + 0.22 * graze) * (0.7 + 0.6 * hash12(room + 19.3));
    }
    {
      float pickA = fract(seed * 31.7), hueA = fract(seed * 47.3);
      float accent = tall * step(0.7 - 0.45 * uNightBlue, pickA) * uNight;
      vec3 accentCol = hueA < 0.42 ? vec3(0.12, 0.38, 1.0) : hueA < 0.76 ? vec3(1.0, 0.72, 0.16) : hueA < 0.89 ? vec3(0.1, 0.85, 1.0) : vec3(0.75, 0.3, 1.0);
      gEmissive = mix(gEmissive, accentCol * dot(gEmissive, vec3(0.9)), accent * 0.8);
    }
    if (tall > 0.0 && uNight > 0.01 && uCityGlass > 0.0) {
      vec3 paneN = normalize(gT * gNm.x + gB * gNm.y + gN * gNm.z), R = reflect(V, paneN);
      float fresnel = 0.1 + 0.9 * pow(1.0 - max(dot(-V, paneN), 0.0), 4.0);
      vec3 city = vec3(0.0);
      if (R.y < -0.015) {
        float reach = (vWPos.y - 12.0) / -R.y;
        vec2 g = (vWPos.xz + R.xz * reach) / 26.0, cell = floor(g);
        vec2 at = vec2(hash12(cell + 3.1), hash12(cell + 7.7));
        float d = length(fract(g) - at) * 26.0, kindC = hash12(cell + 13.0);
        float spot = exp(-d * d / (3.0 + reach * 0.03)) * step(0.3, kindC);
        vec3 tintC = kindC > 0.8 - 0.3 * uNightBlue ? mix(vec3(0.8, 0.9, 1.0), vec3(0.4, 0.65, 1.0), uNightBlue) : kindC > 0.42 && kindC < 0.5 ? vec3(1.0, 0.25, 0.2) : vec3(1.0, 0.72, 0.42);
        city = tintC * spot * 5.0 / (1.0 + reach * reach / 4.0e5);
        city += vec3(1.0, 0.75, 0.5) * 0.035 * smoothstep(0.0, 900.0, reach);
      }
      gEmissive += city * fresnel * pane * tall * uNight * uCityGlass * (1.0 - on * 0.9);
    }
    gPane = pane * (1.0 - 0.7 * far) * (1.0 - 0.85 * uNight * on);
    diffuseColor.rgb *= 1.0 - 0.35 * inWin * (1.0 - smoothstep(0.0, 0.18, wmax.y - pm.y)) * (1.0 - far);

    if (shop) {
      float sign = box(fy, 0.84, 0.985, wy) * box(fx, 0.03, 0.97, wx) * valid * step(0.25, hash12(room + 57.0));
      vec3 sc = mix(hue(hash12(room + 71.0)), vec3(0.95), 0.35 * step(0.6, hash12(room + 83.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, sc * 0.75, sign);
      gEmissive += sign * sc * uNight * 1.6;
      gRough = mix(gRough, 0.4, sign);
    }
  }
}
`;

const ABSTRACT_PARS = /* glsl */ `
uniform float uDark;
float gPlain = 1.0;
`;

export const neutralShade = (amount: string) => `#include <lights_fragment_end>
{
  float shadeLum = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
  reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, shadeLum * vec3(1.0, 0.985, 0.96), ${amount});
}`;

const abstractMain = () => /* glsl */ `
{
  float lattice = step(3.5, vBldg.z);
  float plain = 1.0 - lattice;
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float sort = mod(vBldg.y, 8.0), shop = step(1.5, sort) * (1.0 - step(3.5, sort) * step(sort, 4.5));
  float roof = step(0.5, abs(gN.y));
  vec3 pale = mix(${v3(ABSTRACT.home)}, ${v3(ABSTRACT.shop)}, shop) * mix(1.0, 1.14, roof) * mix(0.93, 1.0, smoothstep(0.03, 0.22, lum));
  pale *= mix(1.0, 0.22, uDark);
  gPlain = plain;
  diffuseColor.rgb = mix(diffuseColor.rgb, pale, plain);
  gRough = mix(gRough, 0.92, plain);
  gMetal *= 1.0 - plain;
  gNm = normalize(mix(gNm, vec3(0.0, 0.0, 1.0), plain));
  gPane *= 1.0 - plain;
  gGlint *= 1.0 - plain;
  vec3 dusk = mix(${v3(ABSTRACT.night.home)}, ${v3(ABSTRACT.night.shop)}, shop) * mix(0.6 + 0.34 * dot(gN, normalize(vec3(0.5, 0.0, 0.85))), 1.45, roof);
  gEmissive = mix(gEmissive, gEmissive * 0.55 * (1.0 - lattice) + dusk * uDark, plain);
}
`;

const RELIEF_PARS = /* glsl */ `
float gJamb = 0.0, gJambShade = 1.0, gReveal = 0.0;
`;
const RELIEF_PM = /* glsl */ `
    {
      float deep = (shop ? 0.1 : cat > 4.5 ? 0.0 : 0.24) * (1.0 - far);
      vec3 toWall = normalize(vWPos - cameraPosition);
      vec2 slide = vec2(dot(toWall, gT), dot(toWall, gB)) / max(-dot(toWall, gN), 0.12) * deep;
      vec2 pg = pm + slide;
      vec2 below = wmin - pg, above = pg - wmax;
      float out2 = max(max(below.x, above.x), max(below.y, above.y));
      gJamb = inWin * step(0.0, out2) * step(1e-4, deep);
      vec3 side = above.x > max(below.x, max(below.y, above.y)) ? -gT : below.x > max(below.y, above.y) ? gT : below.y > above.y ? gB : -gB;
      gJambShade = 0.5 + 0.75 * max(dot(side, uSunDir), 0.0) + 0.2 * side.y;
      float sunN = dot(uSunDir, gN);
      vec2 through = pg + vec2(dot(uSunDir, gT), dot(uSunDir, gB)) / max(sunN, 0.08) * deep;
      vec2 edge2 = min(through - wmin, wmax - through);
      gReveal = step(0.0, sunN) * (1.0 - smoothstep(-0.02, 0.03, min(edge2.x, edge2.y))) * inWin * step(1e-4, deep);
      pm = pg;
    }
`;

export function facadeMaterial(tex: { wall: TextureSet; ground: TextureSet }): THREE.MeshStandardMaterial {
  const m = varies(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
    })
  );
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uNight: shared.uNight,
      uTime: shared.uTime,
      uWindowLife: shared.uWindowLife,
      uCityGlass: shared.uCityGlass,
      uRoomLight: shared.uRoomLight,
      uSoft: shared.uSoft,
      uGlass: shared.uGlass,
      uNightBlue: shared.uNightBlue,
      uSunDir: shared.uSunDir,
      uSunGlint: shared.uSunGlint,
      uGlintOn: shared.uGlintOn,
      uWallAlb: { value: tex.wall.albedo },
      uWallNor: { value: tex.wall.normal },
      uWallScale: { value: tex.wall.scales },
      uWallDetail: { value: tex.wall.details },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec4 aFacade;\nattribute vec4 aBldg;\nvarying vec4 vFacade;\nvarying vec4 vBldg;\n${WORLD_VARYINGS_VERT}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvFacade = aFacade;\nvBldg = aBldg;\n${WORLD_VARYINGS_SET}`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FACADE_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FACADE_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + APPLY_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmissive;')
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.directSpecular += gGlint * smoothstep(0.0, 0.002, dot(reflectedLight.directDiffuse, vec3(0.333)));'
      )
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = 1.0 - 0.95 * gPane;');

    const part = (text: string, a: string, b: string) => text.replace(a, b);
    if (variant.abstract) {
      shader.uniforms.uDark = shared.uDark;
      shader.fragmentShader = part(
        part(
          part(shader.fragmentShader, FACADE_PARS, FACADE_PARS + ABSTRACT_PARS),
          FACADE_MAIN,
          FACADE_MAIN + abstractMain()
        ),
        '#include <lights_fragment_end>',
        neutralShade('0.92 * gPlain')
      );
    }
    if (!variant.windows) {
      shader.fragmentShader = part(shader.fragmentShader, 'cellW = vBldg.w;', 'cellW = 0.0;');
    }
    if (variant.relief) {
      let f = shader.fragmentShader;
      f = part(f, 'float gPane = 0.0;', 'float gPane = 0.0;' + RELIEF_PARS);
      f = part(f, '    vec2 pm = vec2(fx * cellW, fy * floorH);\n', '    vec2 pm = vec2(fx * cellW, fy * floorH);\n' + RELIEF_PM);
      f = part(f, '    float pane = inWin * (1.0 - frame);', '    float pane = inWin * (1.0 - frame) * (1.0 - gJamb);');
      f = part(
        f,
        '    gRough = mix(gRough, 0.035, pane);',
        `    gRough = mix(gRough, 0.035, pane);
    diffuseColor.rgb = mix(diffuseColor.rgb, wall * gJambShade, gJamb);
    diffuseColor.rgb *= 1.0 - 0.45 * gReveal * pane;
    gRough = mix(gRough, 0.85, gJamb);`
      );
      f = part(
        f,
        'float daylight = (1.0 - uNight) * (shop ? 0.36 : cat > 4.5 ? 0.10 : 0.18);',
        'float daylight = (1.0 - uNight) * (shop ? 0.36 : cat > 4.5 ? 0.10 : 0.18) * (1.0 - 0.6 * gReveal);'
      );
      f = part(f, '* step(0.0, dot(gN, uSunDir));', '* step(0.0, dot(gN, uSunDir)) * (1.0 - gReveal);');
      shader.fragmentShader = f;
    }
  };
  m.customProgramCacheKey = () => 'facade-v40' + variantKey();
  return m;
}

// ---------------------------------------------------------------- ground & water
const GROUND_PARS = /* glsl */ `
uniform sampler2DArray uGroundAlb;
uniform sampler2DArray uGroundNor;
uniform float uGroundScale[4];
uniform float uFixedLayer;
uniform sampler2D uOrtho;
uniform vec4 uOrthoRect;
uniform float uOrthoOn;
uniform float uTime;
uniform vec3 uSunDir;
uniform sampler2D uMirror;
uniform mat4 uMirrorMatrix;
uniform float uMirrorOn;
uniform float uDark;
uniform sampler2D uCloudMap;
uniform vec2 uCloudOffset;
uniform float uCloudCover, uCloudBase, uCloudsOn, uCloudFade;
uniform mat4 uWorldToECEF;
uniform vec4 uCloudRect;
varying float vLayer;
varying vec3 vWPos;
varying vec3 vWNrm;
vec3 gT, gB, gN, gNm;
float gRough;
float gMetal = 0.0;
float gWater = 0.0;
vec3 gWaveN = vec3(0.0, 1.0, 0.0);
${NOISE}
vec2 cloudMapUv(vec3 position) {
  vec3 n = normalize(position), f = abs(n), c = n / max(f.x, max(f.y, f.z));
  vec2 m;
  if (all(greaterThan(f.yy, f.xz))) m = c.y > 0.0 ? vec2(-n.x, n.z) : n.xz;
  else if (all(greaterThan(f.xx, f.yz))) m = c.x > 0.0 ? n.yz : vec2(-n.y, n.z);
  else m = c.z > 0.0 ? n.xy : vec2(n.x, -n.y);
  vec2 m2 = m * m;
  float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;
  vec2 uv;
  uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q * q)) * (m.x > 0.0 ? 1.0 : -1.0);
  uv.y = sqrt(6.0 / (3.0 - uv.x * uv.x)) * m.y;
  return uv * 0.5 + 0.5;
}
float cloudAbove(vec3 p, vec3 dir) {
  if (uCloudsOn < 0.5 || dir.y < 0.03) return 0.0;
  vec3 at = p + dir * ((uCloudBase + 320.0 - p.y) / dir.y);
  vec2 weather = texture2D(uCloudMap, cloudMapUv((uWorldToECEF * vec4(at, 1.0)).xyz) * 100.0 + uCloudOffset).rg;
  vec2 beyond = max(uCloudRect.xy - at.xz, at.xz - uCloudRect.zw);
  weather *= 1.0 - smoothstep(0.0, uCloudFade, max(beyond.x, beyond.y));
  float edge = 1.0 - 1.25 * uCloudCover;
  return smoothstep(edge, edge + 0.22, max(weather.r, weather.g)) * smoothstep(0.03, 0.14, dir.y);
}
float ripple(vec2 p, float t) {
  p += 3.2 * vec2(vnoise(p * 0.11 + t * 0.03), vnoise(p * 0.11 + 9.0 - t * 0.03)) + 0.9 * vec2(vnoise(p * 0.45 - t * 0.05), vnoise(p * 0.45 + 23.0 + t * 0.05));
  float h = 0.3 * sin(dot(p, vec2(0.92, 0.39)) * 1.1 + t * 1.1);
  h += 0.28 * sin(dot(p, vec2(-0.45, 0.89)) * 1.6 - t * 1.4 + 1.3);
  h += 0.22 * sin(dot(p, vec2(0.2, -0.98)) * 2.7 + t * 1.9 + 4.0);
  h += 0.14 * sin(dot(p, vec2(-0.8, -0.6)) * 4.3 - t * 2.6);
  h += 0.9 * (vnoise(p * 0.8 + vec2(t * 0.25, -t * 0.18)) - 0.5) + 0.45 * (vnoise(p * 1.9 - vec2(t * 0.4, t * 0.3)) - 0.5);
  return h;
}
`;

const GROUND_MAIN = /* glsl */ `
{
  gN = normalize(vWNrm);
  gT = normalize(cross(gN, vec3(0.0, 0.0, 1.0)) + vec3(1e-4, 0.0, 0.0));
  gB = cross(gT, gN);
  vec3 tint = diffuseColor.rgb;
  float layer = uFixedLayer >= 0.0 ? uFixedLayer : floor(vLayer + 0.5);
  bool water = layer > 3.5;
  layer = min(layer, 3.0);
  float sc = uGroundScale[int(layer)];
  vec2 st = abs(gN.y) > 0.5 ? vWPos.xz : vec2(vWPos.x + vWPos.z, vWPos.y);
  vec3 a = texture(uGroundAlb, vec3(st / sc, layer)).rgb * 2.0;
  vec3 b = texture(uGroundAlb, vec3(st / (sc * 3.7) + 0.37, layer)).rgb * 2.0;
  float blotch = vnoise(st * 0.045);
  diffuseColor.rgb *= mix(a, b, 0.4) * (0.86 + 0.28 * blotch);

  if (layer > 1.5 && layer < 2.5 && !water) {
    float turf = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float meadow = vnoise(st * 0.011 + 3.7);
    diffuseColor.rgb = mix(vec3(turf), diffuseColor.rgb, 0.62) * mix(vec3(0.92, 1.02, 0.78), vec3(1.16, 0.98, 0.76), meadow);
  }
  if (layer > 2.5 && !water) {
    float strata = 0.88 + 0.24 * vnoise(vec2(st.x * 0.035, vWPos.y * 0.18));
    diffuseColor.rgb *= strata;
  }
  gNm = texture(uGroundNor, vec3(st / sc, layer)).xyz * 2.0 - 1.0;
  gNm = normalize(vec3(gNm.xy * (layer > 2.5 ? 1.15 : 0.82), gNm.z));
  gRough = layer < 0.5 ? 0.84 - 0.14 * blotch : (layer > 2.5 ? 0.88 : 0.93);

  if (!water && uFixedLayer >= 0.0 && uOrthoOn > 0.5) {
    vec2 ouv = (vWPos.xz - uOrthoRect.xy) / uOrthoRect.zw;
    if (ouv.x > 0.0 && ouv.x < 1.0 && ouv.y > 0.0 && ouv.y < 1.0) {
      vec3 photo = texture2D(uOrtho, vec2(ouv.x, 1.0 - ouv.y)).rgb;
      diffuseColor.rgb = photo * (0.9 + 0.2 * (mix(a, b, 0.4).g - 0.5));
      gNm = vec3(0.0, 0.0, 1.0);
    }
  }
  if (water) {
    diffuseColor.rgb = tint * 0.5;
    float t = uTime, e = 0.12, amp = 0.045 * clamp(280.0 / distance(cameraPosition, vWPos) - 0.08, 0.0, 1.0);
    vec2 slope = vec2(ripple(vWPos.xz + vec2(e, 0.0), t) - ripple(vWPos.xz - vec2(e, 0.0), t), ripple(vWPos.xz + vec2(0.0, e), t) - ripple(vWPos.xz - vec2(0.0, e), t)) * (amp / (2.0 * e));
    gWaveN = normalize(vec3(-slope.x, 1.0, -slope.y));
    gNm = vec3(gWaveN.x, gWaveN.z, gWaveN.y);
    gRough = 0.08;
    gMetal = 0.0;
    gWater = 1.0;
  }
}
`;

const ABSTRACT_GROUND = /* glsl */ `
  if (!water && (uFixedLayer >= 0.0 || layer > 0.5)) {
    float top = max(tint.r, max(tint.g, tint.b)), low = min(tint.r, min(tint.g, tint.b));
    float lum = dot(tint, vec3(0.3, 0.59, 0.11)), sat = (top - low) / max(top, 1e-3);
    vec3 flatC = mix(${v3(ABSTRACT.paving)} * mix(1.0, 0.85, smoothstep(0.15, 0.5, lum)), mix(vec3(1.0), tint / max(top, 1e-3), 0.62) * 0.42, smoothstep(0.12, 0.4, sat));
    if (uFixedLayer >= 0.0) flatC = ${v3(ABSTRACT.land)};
    diffuseColor.rgb = flatC;
    gNm = vec3(0.0, 0.0, 1.0);
    gRough = 0.95;
    flatC *= mix(1.0, 0.3, uDark);
    diffuseColor.rgb = flatC;
    gGlow = ${v3(ABSTRACT.night.land)} * (flatC / 0.36) * uDark;
  }
`;
const ABSTRACT_WATER = /* glsl */ `
    diffuseColor.rgb = ${v3(ABSTRACT.water)};
    gWaveN = vec3(0.0, 1.0, 0.0);
    gNm = vec3(0.0, 0.0, 1.0);
    gRough = 0.95;
    gWater = 0.0;
`;

export function groundMaterial(
  tex: { wall: TextureSet; ground: TextureSet },
  { fixedLayer = -1, ...params }: { fixedLayer?: number } & THREE.MeshStandardMaterialParameters = {}
): THREE.MeshStandardMaterial {
  const m = varies(new THREE.MeshStandardMaterial({ roughness: 0.92, ...params }));
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uGroundAlb: { value: tex.ground.albedo },
      uGroundNor: { value: tex.ground.normal },
      uGroundScale: { value: tex.ground.scales },
      uFixedLayer: { value: fixedLayer },
      uOrtho: shared.uOrtho,
      uOrthoRect: shared.uOrthoRect,
      uOrthoOn: shared.uOrthoOn,
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uMirror: shared.uMirror,
      uMirrorMatrix: shared.uMirrorMatrix,
      uMirrorOn: shared.uMirrorOn,
      uDark: shared.uDark,
      uCloudMap: shared.uCloudMap,
      uCloudOffset: shared.uCloudOffset,
      uCloudCover: shared.uCloudCover,
      uCloudBase: shared.uCloudBase,
      uCloudsOn: shared.uCloudsOn,
      uWorldToECEF: shared.uWorldToECEF,
      uCloudRect: shared.uCloudRect,
      uCloudFade: shared.uCloudFade,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aLayer;\nvarying float vLayer;\n${WORLD_VARYINGS_VERT}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLayer = aLayer;\n${WORLD_VARYINGS_SET}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nif (aLayer > 3.5) gl_Position.z -= 0.0008;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GROUND_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + APPLY_NORMAL)
      .replace(
        '#include <opaque_fragment>',
        `
        if (gWater > 0.5) {
          vec3 wv = normalize(vWPos - cameraPosition), wr = reflect(wv, gWaveN);
          float viewCos = max(dot(-wv, gWaveN), 0.0);
          float fresnel = 0.06 + 0.94 * pow(1.0 - viewCos, 3.4);
          float dayLight = 0.05 + 0.95 * (1.0 - uDark);
          vec3 deepWater = mix(vec3(0.012, 0.058, 0.105), vec3(0.028, 0.115, 0.195), pow(1.0 - viewCos, 1.6)) * dayLight;
          vec3 skyRefl = mix(vec3(0.15, 0.35, 0.56), vec3(0.035, 0.135, 0.28), pow(clamp(abs(wr.y), 0.0, 1.0), 0.55)) * dayLight;
          vec3 seen = skyRefl;
          float thing = 0.0;
          if (uMirrorOn > 0.5) {
            vec4 mc = uMirrorMatrix * vec4(vWPos, 1.0);
            float near = clamp(70.0 / distance(cameraPosition, vWPos), 0.12, 1.6);
            vec2 muv = mc.xy / mc.w * 0.5 + 0.5 + gWaveN.xz * vec2(0.45, 0.8) * near;
            vec4 mirrored = vec4(0.0);
            for (int i = -1; i <= 1; i++) mirrored += texture2D(uMirror, clamp(muv + vec2(0.0, float(i) * 0.0035 * near), 0.001, 0.999));
            mirrored /= 3.0;
            thing = smoothstep(0.0, 0.3, mirrored.a + dot(mirrored.rgb, vec3(1.0)));
            seen = mix(seen, mirrored.rgb * vec3(0.84, 0.91, 0.96), thing * 0.78);
          }
          vec3 sunH = normalize(uSunDir - wv);
          float sunSpec = pow(max(dot(gWaveN, sunH), 0.0), 180.0) * smoothstep(0.02, 0.18, uSunDir.y) * (1.0 - uDark);
          outgoingLight = mix(deepWater, seen, clamp(max(fresnel, 0.42 * thing), 0.0, 1.0)) + vec3(0.95, 0.92, 0.82) * sunSpec * 0.65;
        }
        #include <opaque_fragment>
        gl_FragColor.a = 1.0 - gWater * (1.0 - uMirrorOn);`
      );

    if (variant.abstract) {
      const part = (text: string, a: string, b: string) => text.replace(a, b);
      shader.fragmentShader = part(
        part(
          part(
            part(
              shader.fragmentShader,
              'float gWater = 0.0;',
              'float gWater = 0.0;\nvec3 gGlow = vec3(0.0);'
            ),
            '  if (water) {',
            ABSTRACT_GROUND + '  if (water) {'
          ),
          '    gWater = 1.0;\n',
          '    gWater = 1.0;\n' + ABSTRACT_WATER
        ),
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gGlow;'
      );
      shader.fragmentShader = part(shader.fragmentShader, '#include <lights_fragment_end>', neutralShade('0.92'));
    }
  };
  m.customProgramCacheKey = () => 'ground-v22' + (variant.abstract ? 'a' : '');
  return m;
}

export function createMaterials(tex: { wall: TextureSet; ground: TextureSet }) {
  return {
    facade: facadeMaterial(tex),
    terrain: groundMaterial(tex, { vertexColors: true }),
    water: groundMaterial(tex, { fixedLayer: 4, color: new THREE.Color().setRGB(0.09, 0.24, 0.34) }),
    road: groundMaterial(tex, {
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    }),
    models: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  };
}
