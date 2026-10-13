// TerrainAndWater.ts — Real USGS 3DEP / NOAA DEM Terrain + jeantimex/tokyo Physical Water
// Uses groundMaterial from src/world/materials.ts:
// - Core & Far DEM terrain with 4-layer DataArrayTexture normal/albedo detail (100% procedural 3D Three.js terrain, zero blurry satellite photo)
// - Engineered bridge corridor grading for the Golden Gate Bridge & Bay Bridge so Marin Headlands cliffs never overlap the bridge
// - Bay & Pacific Ocean water with multi-wave ripple() normal map, planar WaterMirror reflection,
//   screen-space WindowReflections, and 3D volumetric cloud reflections (cloudAbove).

import * as THREE from 'three';
import { WORLD_BOUNDS, FAR_BOUNDS, VisualMode, latLonToENU } from './coords';
import { shared, setVariant } from './materials';

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export interface TerrainMeta {
  core: { gridSize: number; minElev: number; maxElev: number };
  far: { gridSize: number };
}

export class TerrainAndWater {
  public readonly group = new THREE.Group();
  public coreMesh!: THREE.Mesh;
  public farMesh!: THREE.Mesh;
  public waterMesh!: THREE.Mesh;

  private coreMat: THREE.MeshStandardMaterial;
  private farMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshStandardMaterial;

  private orthoTexture: THREE.Texture | null = null;
  private coreHeights: Float32Array | null = null;
  private coreGridSize = 513;
  private mode: VisualMode = 'satellite';

  constructor(
    private scene: THREE.Scene,
    materials: { terrain: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial }
  ) {
    this.coreMat = materials.terrain;
    this.waterMat = materials.water;
    this.farMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
    });
    this.scene.add(this.group);
  }

  public getOrthoTexture(): THREE.Texture | null {
    return this.orthoTexture;
  }

  public async load(_renderer?: THREE.WebGLRenderer): Promise<void> {
    const [metaRes, coreBuf, farBuf] = await Promise.all([
      fetch('./data/terrain/manifest.json').then((r) => r.json() as Promise<TerrainMeta>),
      fetch('./data/terrain/core_dem.bin').then((r) => r.arrayBuffer()),
      fetch('./data/terrain/far_dem.bin').then((r) => r.arrayBuffer()),
    ]);

    this.coreGridSize = metaRes.core.gridSize || 513;
    this.coreHeights = new Float32Array(coreBuf);
    const farHeights = new Float32Array(farBuf);

    // Grade the Golden Gate Bridge & Bay Bridge corridors in the DEM so the Marin Headlands / Lime Point
    // mountain never clips or overlaps the Golden Gate Bridge towers, side spans, cables, or roadway deck.
    this.gradeBridgeCorridors(
      this.coreHeights,
      this.coreGridSize,
      WORLD_BOUNDS.minX,
      WORLD_BOUNDS.maxX,
      WORLD_BOUNDS.minZ,
      WORLD_BOUNDS.maxZ
    );
    this.gradeBridgeCorridors(
      farHeights,
      metaRes.far.gridSize || 257,
      FAR_BOUNDS.minX,
      FAR_BOUNDS.maxX,
      FAR_BOUNDS.minZ,
      FAR_BOUNDS.maxZ
    );

    shared.uOrthoOn.value = 0.0;

    this.buildCoreTerrain();
    this.buildFarTerrain(farHeights, metaRes.far.gridSize || 257);
    this.buildWater();
    this.applyMode(this.mode);
  }

  /**
   * Carves and grades the Golden Gate Strait channel and Marin / Presidio bridge approaches
   * so that the 39m-grid DEM cliff at Lime Point never overlaps the Golden Gate Bridge.
   */
  private gradeBridgeCorridors(
    heights: Float32Array,
    N: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): void {
    const southAnch = latLonToENU(37.8108, -122.4774);
    const northAnch = latLonToENU(37.8286, -122.4793);
    const cx = (southAnch.x + northAnch.x) * 0.5;
    const cz = (southAnch.z + northAnch.z) * 0.5;
    const angle = Math.atan2(northAnch.x - southAnch.x, northAnch.z - southAnch.z);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Bay Bridge West Span Yerba Buena Island landing
    const sfAnch = latLonToENU(37.7862, -122.3905);
    const ybiWest = latLonToENU(37.8085, -122.3665);
    const bayCx = (sfAnch.x + ybiWest.x) * 0.5;
    const bayCz = (sfAnch.z + ybiWest.z) * 0.5;
    const bayAngle = Math.atan2(ybiWest.x - sfAnch.x, ybiWest.z - sfAnch.z);
    const bayCos = Math.cos(bayAngle);
    const baySin = Math.sin(bayAngle);
    const bayHalfLen = Math.hypot(ybiWest.x - sfAnch.x, ybiWest.z - sfAnch.z) * 0.5;

    const smooth01 = (t: number) => {
      const c = Math.max(0, Math.min(1, t));
      return c * c * (3 - 2 * c);
    };

    for (let iz = 0; iz < N; iz++) {
      const wz = minZ + (iz / (N - 1)) * (maxZ - minZ);
      for (let ix = 0; ix < N; ix++) {
        const wx = minX + (ix / (N - 1)) * (maxX - minX);
        const idx = iz * N + ix;
        let h = heights[idx];

        // 1. Golden Gate Bridge local coordinates (lx across bridge, lz South->North along bridge)
        const dx = wx - cx;
        const dz = wz - cz;
        const lx = dx * cosA - dz * sinA;
        const lz = dx * sinA + dz * cosA;
        const absLx = Math.abs(lx);

        if (lz >= -1420 && lz <= 1520 && absLx <= 380) {
          let maxAllowedH = h;
          let innerW = 120;
          let outerW = 300;

          if (lz >= -700 && lz <= 700) {
            // Main span + South & North Tower piers (Fort Point to Lime Point):
            // Keep the Golden Gate water channel clear beneath the entire suspension span & tower fenders
            maxAllowedH = -12.0;
            innerW = 175;
            outerW = 360;
          } else if (lz > 700 && lz <= 983) {
            // North Side Span (Lime Point cove to North Anchorage):
            // Keep terrain well below the 67.1m deck & 59.5m stiffening truss
            const u = (lz - 700) / (983 - 700);
            maxAllowedH = -8.0 + smooth01(u) * 26.0; // rises from -8m to +18m at North Anchorage
            innerW = 150;
            outerW = 330;
          } else if (lz > 983 && lz <= 1220) {
            // North Marin Approach Viaduct (North Anchorage to Marin touchdown):
            const u = (lz - 983) / (1220 - 983);
            maxAllowedH = 18.0 + smooth01(u) * 22.0; // rises from +18m to +40m beneath the viaduct
            innerW = 135;
            outerW = 300;
          } else if (lz > 1220 && lz <= 1520) {
            // Marin Headlands US-101 highway cut north of bridge touchdown (roadway at 54m)
            const u = (lz - 1220) / (1520 - 1220);
            maxAllowedH = 40.0 + smooth01(u) * 13.0; // graded highway corridor at 40..53m
            innerW = 110;
            outerW = 260;
          } else if (lz < -700 && lz >= -983) {
            // South Side Span (Fort Point seawall to South Anchorage):
            const u = (-700 - lz) / (983 - 700);
            maxAllowedH = -4.0 + smooth01(u) * 26.0; // rises from -4m at Fort Point to +22m at South Anchorage
            innerW = 125;
            outerW = 270;
          } else if (lz < -983 && lz >= -1260) {
            // South Presidio Approach Viaduct:
            const u = (-983 - lz) / (1260 - 983);
            maxAllowedH = 22.0 + smooth01(u) * 16.0; // rises from +22m to +38m beneath viaduct
            innerW = 110;
            outerW = 240;
          } else if (lz < -1260 && lz >= -1420) {
            // South Toll Plaza bluff transition (roadway at 44m)
            const u = (-1260 - lz) / (1420 - 1260);
            maxAllowedH = 38.0 + smooth01(u) * 5.5;
            innerW = 105;
            outerW = 230;
          }

          if (h > maxAllowedH && absLx < outerW) {
            const blend = absLx <= innerW ? 0.0 : smooth01((absLx - innerW) / (outerW - innerW));
            h = maxAllowedH * (1 - blend) + h * blend;
          }
        }

        // 2. Bay Bridge West Span channel & Yerba Buena Island West Portal clearance
        const bdx = wx - bayCx;
        const bdz = wz - bayCz;
        const blx = bdx * bayCos - bdz * baySin;
        const blz = bdx * baySin + bdz * bayCos;
        if (Math.abs(blx) < 160 && blz > -bayHalfLen + 180 && blz < bayHalfLen - 40) {
          const maxBayH = blz > bayHalfLen - 260 ? 34.0 : -8.0;
          if (h > maxBayH) {
            const blend = Math.abs(blx) <= 70 ? 0.0 : smooth01((Math.abs(blx) - 70) / 90);
            h = maxBayH * (1 - blend) + h * blend;
          }
        }

        heights[idx] = h;
      }
    }
  }

  private buildCoreTerrain(): void {
    const N = this.coreGridSize;
    const geo = new THREE.PlaneGeometry(WORLD_BOUNDS.width, WORLD_BOUNDS.height, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    // PlaneGeometry is centered on the origin but WORLD_BOUNDS is not; without this shift the
    // visible terrain sits 500 m east / 1 km south of the DEM that roads, buildings and bridges sample.
    geo.translate(
      (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) * 0.5,
      0,
      (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) * 0.5
    );

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const layers = new Float32Array(pos.count);
    const cellW = WORLD_BOUNDS.width / (N - 1);
    const cellH = WORLD_BOUNDS.height / (N - 1);

    if (this.coreHeights) {
      for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
          const idx = iz * N + ix;
          const wx = pos.getX(idx);
          const wz = pos.getZ(idx);
          const h = this.coreHeights[idx];
          // Drop underwater vertices below y=0 so the water plane at y=0 never z-fights with seabed
          const y = h < 0.25 ? Math.max(-14.0, Math.min(-2.6, h - 2.4)) : h;
          pos.setY(idx, y);

          // Compute local terrain slope from central differences
          const hL = this.coreHeights[iz * N + Math.max(0, ix - 1)];
          const hR = this.coreHeights[iz * N + Math.min(N - 1, ix + 1)];
          const hD = this.coreHeights[Math.max(0, iz - 1) * N + ix];
          const hU = this.coreHeights[Math.min(N - 1, iz + 1) * N + ix];
          const slope = Math.hypot((hR - hL) / (2 * cellW), (hU - hD) / (2 * cellH));

          // Classify SF terrain biome for procedural 3D Three.js ground layers:
          // Layer 1 = urban block stone/pavers, Layer 2 = lush grass/hillside turf, Layer 3 = coastal rock/sand/earth
          const isMarinOrIsland =
            wz < -3750 || // Marin Headlands & Angel Island
            (wx > 2800 && wz < -1600) || // Yerba Buena & Treasure Island
            (wx > -1800 && wx < -500 && wz < -3400); // Alcatraz
          const isPresidioOrGGP =
            (wx < -2200 && wz < -1800 && wz > -3750) || // Presidio & Lands End
            (wx < -1200 && wz > 200 && wz < 1650) || // Golden Gate Park
            (wx < -1400 && wz > 2600) || // Lake Merced / Stern Grove / Mt. Davidson / Twin Peaks
            h > 62; // High SF hill peaks (Twin Peaks, Mt Sutro, Corona Heights, Bernal Heights, Telegraph Hill)

          let r = 0.56;
          let g = 0.57;
          let b = 0.58;
          let layer = 1.0;

          if (h < 2.2 && slope < 0.16) {
            // Coastal beach sand & waterfront promenade
            r = 0.78;
            g = 0.72;
            b = 0.58;
            layer = 3.0;
          } else if (slope > 0.28) {
            // Steep coastal bluffs & Franciscan chert rock cliffs (Marin Headlands, Lands End, Twin Peaks)
            const rockTone = Math.min(1, (slope - 0.28) * 2.2);
            r = 0.50 - rockTone * 0.08;
            g = 0.45 - rockTone * 0.08;
            b = 0.38 - rockTone * 0.07;
            layer = 3.0;
          } else if (isMarinOrIsland || isPresidioOrGGP) {
            // California coastal hills: green chaparral low, golden dry grass on upper slopes
            const elevT = Math.max(0, Math.min(1, h / 240));
            r = 0.36 + elevT * 0.22;
            g = 0.46 + elevT * 0.08;
            b = 0.26 + elevT * 0.02;
            layer = 2.0;
          } else {
            // Urban city block ground beneath buildings & road network (warm concrete)
            const elevT = Math.max(0, Math.min(1, h / 120));
            r = 0.58 + elevT * 0.04;
            g = 0.56 + elevT * 0.04;
            b = 0.52 + elevT * 0.04;
            layer = 1.0;
          }

          // Palette above is authored in sRGB; vertex colors are interpreted as linear.
          colors[idx * 3 + 0] = srgbToLinear(r);
          colors[idx * 3 + 1] = srgbToLinear(g);
          colors[idx * 3 + 2] = srgbToLinear(b);
          layers[idx] = layer;
        }
      }
      for (let i = 0; i < pos.count; i++) {
        this.coreHeights[i] = pos.getY(i);
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    this.coreMesh = new THREE.Mesh(geo, this.coreMat);
    this.coreMesh.receiveShadow = true;
    this.group.add(this.coreMesh);
  }

  private buildFarTerrain(farHeights: Float32Array, N: number): void {
    const width = FAR_BOUNDS.maxX - FAR_BOUNDS.minX;
    const height = FAR_BOUNDS.maxZ - FAR_BOUNDS.minZ;
    const geo = new THREE.PlaneGeometry(width, height, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(
      (FAR_BOUNDS.minX + FAR_BOUNDS.maxX) * 0.5,
      0,
      (FAR_BOUNDS.minZ + FAR_BOUNDS.maxZ) * 0.5
    );

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = iz * N + ix;
        const wx = pos.getX(idx);
        const wz = pos.getZ(idx);
        const h = farHeights[idx] || 0;

        const inCore =
          wx > WORLD_BOUNDS.minX + 180 &&
          wx < WORLD_BOUNDS.maxX - 180 &&
          wz > WORLD_BOUNDS.minZ + 180 &&
          wz < WORLD_BOUNDS.maxZ - 180;

        const y = inCore ? -38 : h < 0.4 ? -18.0 : h;
        pos.setY(idx, y);

        const t = Math.max(0, Math.min(1, h / 350));
        colors[idx * 3 + 0] = srgbToLinear(0.40 + t * 0.18);
        colors[idx * 3 + 1] = srgbToLinear(0.46 + t * 0.08);
        colors[idx * 3 + 2] = srgbToLinear(0.30 + t * 0.04);
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    this.farMesh = new THREE.Mesh(geo, this.farMat);
    this.farMesh.receiveShadow = true;
    this.group.add(this.farMesh);
  }

  private buildWater(): void {
    const waterGeo = new THREE.PlaneGeometry(90000, 90000, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    const count = waterGeo.attributes.position.count;
    const layers = new Float32Array(count).fill(4.0);
    waterGeo.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));

    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.position.y = 0.0;
    this.waterMesh.receiveShadow = true;
    this.group.add(this.waterMesh);
  }

  public setMode(mode: VisualMode): void {
    this.applyMode(mode);
  }

  public sampleGroundHeight(x: number, z: number): number {
    return this.sampleHeight(x, z);
  }

  public applyMode(mode: VisualMode): void {
    this.mode = mode;
    const isAbstract = mode === 'vector';
    // Always use 100% procedural 3D Three.js terrain (never drape flat satellite photo on terrain)
    shared.uOrthoOn.value = 0.0;
    setVariant({ abstract: isAbstract });

    if (this.farMat) {
      this.farMat.color.setHex(isAbstract ? 0x8a8a86 : 0xffffff);
    }
  }

  public update(
    dt: number,
    _sunDir: THREE.Vector3,
    _sunColor: THREE.Color,
    _skyHorizon: THREE.Color,
    _skyZenith: THREE.Color,
    nightFactor: number
  ): void {
    shared.uTime.value += dt;
    shared.uDark.value = nightFactor;
  }

  public sampleHeight(x: number, z: number): number {
    if (!this.coreHeights) return 0;
    const u = (x - WORLD_BOUNDS.minX) / WORLD_BOUNDS.width;
    const v = (z - WORLD_BOUNDS.minZ) / WORLD_BOUNDS.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const N = this.coreGridSize;
    const fx = u * (N - 1);
    const fz = v * (N - 1);
    const ix = Math.min(N - 2, Math.max(0, Math.floor(fx)));
    const iz = Math.min(N - 2, Math.max(0, Math.floor(fz)));
    const tx = fx - ix;
    const tz = fz - iz;

    const h00 = this.coreHeights[iz * N + ix];
    const h10 = this.coreHeights[iz * N + (ix + 1)];
    const h01 = this.coreHeights[(iz + 1) * N + ix];
    const h11 = this.coreHeights[(iz + 1) * N + (ix + 1)];

    // Match THREE.PlaneGeometry's exact two-triangle split: (a,b,d) for tx+tz<=1 and (b,c,d) for tx+tz>1
    if (tx + tz <= 1.0) {
      return h00 + tx * (h10 - h00) + tz * (h01 - h00);
    } else {
      return h11 + (1.0 - tx) * (h01 - h11) + (1.0 - tz) * (h10 - h11);
    }
  }
}
