// Roads, Landuse (Parks, Beaches, Piers, Lagoons), Moving Cable Cars,
// 3D Street Light Poles & Luminaires, City-Wide Moving 3D Cars/Traffic,
// and 47,896 Instanced DataSF Trees for SF 3D.
// Supports fast progressive startup (essential arterials/freeways/piers first,
// secondary neighborhood details streamed across idle animation frames) and distance LOD.

import * as THREE from 'three';
import earcut from 'earcut';
import type { RenderMode } from '../camera/CameraSystem';

interface BakedRoadWay {
  cls: number;
  width: number;
  layer: number;
  bridge: boolean;
  name?: string;
  ref?: string;
  pts: number[];
}

interface CableCarRoute {
  name: string;
  pts: number[];
}

interface BakedPolygon {
  cls: number;
  name?: string;
  pts: number[];
}

interface TrafficRoute {
  pts: Float32Array; // [x0, y0, z0, x1, y1, z1, ...]
  cumLen: Float32Array;
  totalLen: number;
  laneOffset: number;
  speedBase: number;
  midX: number;
  midZ: number;
}

interface TrafficAgent {
  routeIdx: number;
  dist: number;
  speed: number;
  dir: 1 | -1;
  laneShift: number;
  scaleL: number;
  scaleW: number;
  scaleH: number;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    requestAnimationFrame(done);
    setTimeout(done, 24);
  });

export class RoadsAndLanduseLayer {
  public group = new THREE.Group();
  public vectorOnlyGroup = new THREE.Group();
  public sharedGroup = new THREE.Group();
  public detailGroup = new THREE.Group(); // Street lamps, trees, traffic & markings (excluded from water mirror pass)
  public nightLightsGroup = new THREE.Group();

  private streetLampDayGroup = new THREE.Group();
  private laneMarkingsMesh: THREE.Mesh | null = null;

  private cableCarMeshes: {
    mesh: THREE.Group;
    routePts: THREE.Vector3[];
    totalLen: number;
    segLens: number[];
    progress: number;
    speed: number;
    dir: number;
  }[] = [];

  private treeInstancedMeshes: {
    mesh: THREE.InstancedMesh;
    satColor: THREE.Color;
    vecColor: THREE.Color;
  }[] = [];

  private modeMaterials: {
    mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    satColor: THREE.Color;
    vecColor: THREE.Color;
  }[] = [];

  // City-wide animated 3D cars / traffic (4 InstancedMeshes = 4 draw calls for 760 vehicles)
  private trafficRoutes: TrafficRoute[] = [];
  private trafficAgents: TrafficAgent[] = [];
  private carBodyInst: THREE.InstancedMesh | null = null;
  private carCabinInst: THREE.InstancedMesh | null = null;
  private carHeadlightInst: THREE.InstancedMesh | null = null;
  private carTaillightInst: THREE.InstancedMesh | null = null;
  private carHeadlightMat!: THREE.MeshBasicMaterial;
  private carTaillightMat!: THREE.MeshBasicMaterial;
  private trafficDummy = new THREE.Object3D();
  private trafficTick = 0;

  private lampBulbMat!: THREE.MeshBasicMaterial;
  private lampGlowMat!: THREE.MeshBasicMaterial;
  private mode: RenderMode = 'satellite';

  constructor(private sampleGround?: (x: number, z: number) => number) {
    this.group.add(this.vectorOnlyGroup);
    this.group.add(this.sharedGroup);
    this.group.add(this.detailGroup);
    this.group.add(this.nightLightsGroup);
    this.detailGroup.add(this.streetLampDayGroup);
  }

  /**
   * Loads essential road spine (Freeways, Arterials, Collectors, Cable Cars, Piers)
   * during the startup screen so the user enters a lag-free scene fast, then streams
   * residential streets, parks, crosswalks, traffic, street lamps, and 47,896 trees
   * progressively across subsequent frames.
   */
  public async load(
    onProgress?: (stageLabel: string, fraction: number) => void
  ): Promise<void> {
    onProgress?.('Loading San Francisco road & waterfront network…', 0.15);

    const treesPromise = fetch('./data/landuse/trees.bin').then((r) => r.arrayBuffer());
    const [landuseRes, roadsRes] = await Promise.all([
      fetch('./data/landuse/landuse.json'),
      fetch('./data/roads/roads.json'),
    ]);

    const landuseData = await landuseRes.json();
    const roadsData = await roadsRes.json();
    const polygons: BakedPolygon[] = landuseData.polygons || [];
    const ways: BakedRoadWay[] = roadsData.ways || [];

    const classBuckets = new Map<number, BakedRoadWay[]>();
    for (let c = 0; c <= 8; c++) classBuckets.set(c, []);
    for (const w of ways) {
      classBuckets.get(w.cls)?.push(w);
    }

    onProgress?.('Building Embarcadero piers & primary highways…', 0.55);
    await nextFrame();

    // 1. Essential waterfront piers (Class 2)
    this.buildPiersOnly(polygons);

    // 2. Essential primary road spine (Freeways 0, Major Arterials 1, Collectors 2, Cable Cars 7)
    this.buildRoadClassSubset(classBuckets, [0, 1, 2, 7]);
    this.buildMovingCableCars(roadsData.cableCarRoutes || []);
    this.setMode(this.mode);

    onProgress?.('Primary road network ready', 1.0);

    // 3. Stream remaining neighborhood streets, parks, crosswalks, traffic, lamps & trees
    //    across background animation frames with zero frame hitches!
    void this.streamSecondaryDetails(
      polygons,
      ways,
      classBuckets,
      roadsData.streetLamps || [],
      treesPromise
    );
  }

  private async streamSecondaryDetails(
    polygons: BakedPolygon[],
    ways: BakedRoadWay[],
    classBuckets: Map<number, BakedRoadWay[]>,
    streetLamps: number[],
    treesPromise: Promise<ArrayBuffer>
  ): Promise<void> {
    await nextFrame();
    // Step 1: Residential neighborhood streets (Class 3)
    this.buildRoadClassSubset(classBuckets, [3]);
    this.setMode(this.mode);

    await nextFrame();
    // Step 2: Plazas, bikeways, light rail & transit corridors (Classes 4, 5, 6, 8)
    this.buildRoadClassSubset(classBuckets, [4, 5, 6, 8]);
    this.setMode(this.mode);

    await nextFrame();
    // Step 3: Parks, beaches & inland lagoons
    this.buildParksBeachesLagoons(polygons);
    this.setMode(this.mode);

    await nextFrame();
    // Step 4: White dashed lane markings & zebra crosswalks
    this.buildLaneMarkingsAndCrosswalks(
      classBuckets.get(1) || [],
      classBuckets.get(0) || [],
      classBuckets.get(2) || []
    );
    this.setMode(this.mode);

    await nextFrame();
    // Step 5: 760 animated 3D city traffic vehicles
    this.buildMovingCityTraffic(ways);

    await nextFrame();
    // Step 6: 3D street light poles, mast arms, luminaire bulbs & night halos
    this.buildStreetLamps(streetLamps, ways);

    try {
      const treesAb = await treesPromise;
      await nextFrame();
      // Step 7: 47,896 instanced street trees
      this.buildInstancedTrees(treesAb);
      this.setMode(this.mode);
    } catch (err) {
      console.warn('Failed to stream trees.bin:', err);
    }
  }

  private registerModeMaterial(
    mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
    satHex: string,
    vecHex: string
  ) {
    this.modeMaterials.push({
      mat,
      satColor: new THREE.Color(satHex),
      vecColor: new THREE.Color(vecHex),
    });
  }

  /**
   * Returns true if a world-space point (x, z) is inside the Golden Gate Bridge or Bay Bridge
   * over-water suspension corridors where dedicated 3D bridge models exist.
   */
  private isInsideMajorBridgeCorridor(x: number, z: number, isBridgeWay = false): boolean {
    const inGGBSpan = x > -5460 && x < -4980 && z > -5690 && z < -3320;
    const inGGBBridgeWay = isBridgeWay && x > -5550 && x < -4850 && z > -5880 && z < -3220;
    const inBaySpan = x > 2480 && z < -680 && z > -4880;
    const inBayBridgeWay = isBridgeWay && x > 1850 && z < -350 && z > -4950;
    return inGGBSpan || inGGBBridgeWay || inBaySpan || inBayBridgeWay;
  }

  /**
   * Samples terrain height and clamps road/park vertices so they sit cleanly atop the 3D terrain mesh.
   */
  private getClampedGroundY(x: number, z: number, fallbackY: number): number {
    if (!this.sampleGround) return fallbackY;
    const g = this.sampleGround(x, z);
    return g > -2.0 ? g : fallbackY;
  }

  private buildPiersOnly(polygons: BakedPolygon[]) {
    const piers = polygons.filter((p) => p.cls === 2);
    if (piers.length === 0) return;

    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    let vCursor = 0;

    for (const pier of piers) {
      const pts = pier.pts;
      const n = Math.floor(pts.length / 3);
      if (n < 3) continue;

      const flat2D: number[] = [];
      const topStart = vCursor;
      const topY = 3.2;
      const botY = -1.5;

      for (let i = 0; i < n; i++) {
        const x = pts[i * 3];
        const z = pts[i * 3 + 2];
        flat2D.push(x, z);
        positions.push(x, topY, z);
        normals.push(0, 1, 0);
        vCursor++;
      }

      const tris = earcut(flat2D);
      for (let t = 0; t < tris.length; t += 3) {
        indices.push(topStart + tris[t], topStart + tris[t + 2], topStart + tris[t + 1]);
      }

      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = flat2D[i * 2];
        const z0 = flat2D[i * 2 + 1];
        const x1 = flat2D[j * 2];
        const z1 = flat2D[j * 2 + 1];
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;

        const wBase = vCursor;
        positions.push(
          x0, botY, z0,
          x1, botY, z1,
          x1, topY, z1,
          x0, topY, z0
        );
        for (let k = 0; k < 4; k++) normals.push(nx, 0, nz);
        vCursor += 4;

        indices.push(wBase, wBase + 2, wBase + 1, wBase, wBase + 3, wBase + 2);
      }
    }

    const pierGeo = new THREE.BufferGeometry();
    pierGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pierGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    pierGeo.setIndex(indices);
    pierGeo.computeBoundingSphere();

    const pierMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#CEC8BC'),
      roughness: 0.82,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.registerModeMaterial(pierMat, '#CEC8BC', '#DED9CE');
    const pierMesh = new THREE.Mesh(pierGeo, pierMat);
    pierMesh.castShadow = true;
    pierMesh.receiveShadow = true;
    this.sharedGroup.add(pierMesh);
  }

  private buildParksBeachesLagoons(polygons: BakedPolygon[]) {
    const byClass: Map<number, BakedPolygon[]> = new Map([
      [0, []],
      [1, []],
      [3, []],
    ]);

    for (const poly of polygons) {
      byClass.get(poly.cls)?.push(poly);
    }

    const buildFlatClassMesh = (
      list: BakedPolygon[],
      satHex: string,
      vecHex: string,
      yLift: number,
      roughness = 0.88
    ): THREE.Mesh | null => {
      if (list.length === 0) return null;
      const positions: number[] = [];
      const indices: number[] = [];
      let vOffset = 0;

      for (const poly of list) {
        const pts = poly.pts;
        const n = Math.floor(pts.length / 3);
        if (n < 3) continue;

        const flat2D: number[] = [];
        for (let i = 0; i < n; i++) {
          const x = pts[i * 3];
          const z = pts[i * 3 + 2];
          const baseH = this.getClampedGroundY(x, z, pts[i * 3 + 1]);
          const y = Math.max(0.25, baseH) + yLift;
          positions.push(x, y, z);
          flat2D.push(x, z);
        }

        const tris = earcut(flat2D);
        for (let t = 0; t < tris.length; t += 3) {
          indices.push(vOffset + tris[t], vOffset + tris[t + 2], vOffset + tris[t + 1]);
        }
        vOffset += n;
      }

      if (indices.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(satHex),
        roughness,
        metalness: 0.0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.registerModeMaterial(mat, satHex, vecHex);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      return mesh;
    };

    const parkMesh = buildFlatClassMesh(byClass.get(0)!, '#4A7040', '#CDE9C4', 0.14, 0.90);
    if (parkMesh) this.sharedGroup.add(parkMesh);

    const sandMesh = buildFlatClassMesh(byClass.get(1)!, '#D8C7A0', '#F1E7C8', 0.18, 0.86);
    if (sandMesh) this.sharedGroup.add(sandMesh);

    const lagoonMesh = buildFlatClassMesh(byClass.get(3)!, '#356888', '#B7DDF5', 0.22, 0.25);
    if (lagoonMesh) this.sharedGroup.add(lagoonMesh);
  }

  private buildRibbonGeo(
    list: BakedRoadWay[],
    widthOffset: number,
    yOffset: number,
    fixedWidth?: number
  ): THREE.BufferGeometry | null {
    if (list.length === 0) return null;
    const maxSubdivLen = 16.0;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vCur = 0;

    for (const w of list) {
      const pts = w.pts;
      const n = Math.floor(pts.length / 3);
      if (n < 2) continue;

      const halfW =
        fixedWidth !== undefined
          ? fixedWidth * 0.5
          : Math.max(0.45, (w.width + widthOffset) * 0.5);
      let distAlong = 0;

      for (let i = 0; i < n - 1; i++) {
        const ax = pts[i * 3];
        const ay = pts[i * 3 + 1];
        const az = pts[i * 3 + 2];

        const bx = pts[(i + 1) * 3];
        const by = pts[(i + 1) * 3 + 1];
        const bz = pts[(i + 1) * 3 + 2];

        const mx = (ax + bx) * 0.5;
        const mz = (az + bz) * 0.5;
        if (this.isInsideMajorBridgeCorridor(mx, mz, w.bridge)) continue;

        if (this.sampleGround) {
          const g0 = this.sampleGround(ax, az);
          const g1 = this.sampleGround(bx, bz);
          if (g0 < 0.45 || g1 < 0.45) continue;
        }

        const totalDx = bx - ax;
        const totalDz = bz - az;
        const totalLen = Math.hypot(totalDx, totalDz);
        if (totalLen < 0.05) continue;

        const nx = (-totalDz / totalLen) * halfW;
        const nz = (totalDx / totalLen) * halfW;

        const steps = Math.max(1, Math.ceil(totalLen / maxSubdivLen));
        const stepLen = totalLen / steps;

        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;

          const x0 = ax + totalDx * t0;
          const z0 = az + totalDz * t0;
          const x1 = ax + totalDx * t1;
          const z1 = az + totalDz * t1;

          const rawY0 = ay + (by - ay) * t0;
          const rawY1 = ay + (by - ay) * t1;

          let g0 = this.getClampedGroundY(x0, z0, rawY0);
          let g1 = this.getClampedGroundY(x1, z1, rawY1);
          if (this.sampleGround && halfW > 2.5) {
            const g0L = this.sampleGround(x0 + nx, z0 + nz);
            const g0R = this.sampleGround(x0 - nx, z0 - nz);
            const g1L = this.sampleGround(x1 + nx, z1 + nz);
            const g1R = this.sampleGround(x1 - nx, z1 - nz);
            g0 = Math.max(g0, g0L, g0R);
            g1 = Math.max(g1, g1L, g1R);
          }

          const bridgeLift = w.layer > 0 ? w.layer * 5.2 : 0;
          const y0 = Math.max(g0, rawY0 * 0.15 + g0 * 0.85) + bridgeLift + yOffset;
          const y1 = Math.max(g1, rawY1 * 0.15 + g1 * 0.85) + bridgeLift + yOffset;

          const d0 = distAlong;
          const d1 = distAlong + stepLen;
          distAlong = d1;

          const base = vCur;
          positions.push(
            x0 + nx, y0, z0 + nz,
            x0 - nx, y0, z0 - nz,
            x1 - nx, y1, z1 - nz,
            x1 + nx, y1, z1 + nz
          );
          uvs.push(0, d0, 1, d0, 1, d1, 0, d1);
          vCur += 4;

          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }

    if (vCur === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  private buildRoadClassSubset(
    classBuckets: Map<number, BakedRoadWay[]>,
    classes: number[]
  ) {
    const addRoadLayer = (
      cls: number,
      satFillHex: string,
      satCasingHex: string | null,
      vecFillHex: string,
      vecCasingHex: string | null,
      yBase: number,
      casingWidthOffset = 2.4,
      addYellowCenterLine = false
    ) => {
      if (!classes.includes(cls)) return;
      const list = classBuckets.get(cls) || [];
      if (list.length === 0) return;

      if (satCasingHex && vecCasingHex) {
        const casingGeo = this.buildRibbonGeo(list, casingWidthOffset, yBase);
        if (casingGeo) {
          const casingMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(satCasingHex),
            roughness: 0.86,
            metalness: 0.02,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          });
          this.registerModeMaterial(casingMat, satCasingHex, vecCasingHex);
          const casingMesh = new THREE.Mesh(casingGeo, casingMat);
          casingMesh.receiveShadow = true;
          this.sharedGroup.add(casingMesh);
        }
      }

      const fillGeo = this.buildRibbonGeo(list, 0.0, yBase + 0.06);
      if (fillGeo) {
        const fillMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(satFillHex),
          roughness: 0.78,
          metalness: 0.06,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        });
        this.registerModeMaterial(fillMat, satFillHex, vecFillHex);
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.receiveShadow = true;
        this.sharedGroup.add(fillMesh);
      }

      if (addYellowCenterLine) {
        const centerGeo = this.buildRibbonGeo(list, 0.0, yBase + 0.11, 0.34);
        if (centerGeo) {
          const centerMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#F2B830'),
            roughness: 0.5,
            metalness: 0.08,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -5,
            polygonOffsetUnits: -5,
          });
          this.registerModeMaterial(centerMat, '#F2B830', '#E5A922');
          const centerMesh = new THREE.Mesh(centerGeo, centerMat);
          centerMesh.receiveShadow = true;
          this.sharedGroup.add(centerMesh);
        }
      }
    };

    addRoadLayer(3, '#363A43', '#C2BEB5', '#F7F5F1', '#DEDAD2', 0.14, 2.2, false);
    addRoadLayer(2, '#30343D', '#C8C4BB', '#FFFFFF', '#D9D5CE', 0.24, 2.6, true);
    addRoadLayer(1, '#2B2F37', '#CECAC0', '#FFFFFF', '#D1CCC3', 0.34, 3.0, true);
    addRoadLayer(0, '#242830', '#B6B2A9', '#F6C84B', '#D8A62E', 0.46, 2.6, true);
    addRoadLayer(4, '#C8C1B4', null, '#B9B4AB', null, 0.18, 0.0, false);
    addRoadLayer(5, '#2E6E4E', null, '#8EC99D', null, 0.20, 0.0, false);
    addRoadLayer(6, '#6E7278', null, '#8E8A84', null, 0.41, 0.0, false);
    addRoadLayer(8, '#4A789C', null, '#5AA9E6', null, 0.43, 0.0, false);
    addRoadLayer(7, '#A85434', '#5A4D46', '#B85D3B', '#6E5A4F', 0.48, 1.4, false);
  }

  private buildLaneMarkingsAndCrosswalks(
    arterials: BakedRoadWay[],
    freeways: BakedRoadWay[],
    collectors: BakedRoadWay[]
  ) {
    const whitePos: number[] = [];
    const whiteIdx: number[] = [];
    let wCur = 0;

    const pushQuad = (
      x0L: number, y0: number, z0L: number,
      x0R: number, z0R: number,
      x1R: number, y1: number, z1R: number,
      x1L: number, z1L: number
    ) => {
      const base = wCur;
      whitePos.push(
        x0L, y0, z0L,
        x0R, y0, z0R,
        x1R, y1, z1R,
        x1L, y1, z1L
      );
      wCur += 4;
      whiteIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    const multiLaneWays = [...freeways, ...arterials];
    const dashLen = 4.2;
    const gapLen = 5.8;
    const cycle = dashLen + gapLen;

    for (const w of multiLaneWays) {
      const pts = w.pts;
      const n = Math.floor(pts.length / 3);
      if (n < 2 || w.width < 10) continue;

      const yOff = w.cls === 0 ? 0.58 : 0.46;
      const bridgeLift = w.layer > 0 ? w.layer * 5.2 : 0;
      const laneOffsets =
        w.cls === 0
          ? [-w.width * 0.32, -w.width * 0.16, w.width * 0.16, w.width * 0.32]
          : [-w.width * 0.24, w.width * 0.24];

      let dist = 0;
      for (let i = 0; i < n - 1; i++) {
        const ax = pts[i * 3];
        const ay = pts[i * 3 + 1];
        const az = pts[i * 3 + 2];
        const bx = pts[(i + 1) * 3];
        const by = pts[(i + 1) * 3 + 1];
        const bz = pts[(i + 1) * 3 + 2];

        const mx = (ax + bx) * 0.5;
        const mz = (az + bz) * 0.5;
        if (this.isInsideMajorBridgeCorridor(mx, mz, w.bridge)) continue;
        if (this.sampleGround) {
          if (this.sampleGround(ax, az) < 0.45 || this.sampleGround(bx, bz) < 0.45) continue;
        }

        const dx = bx - ax;
        const dz = bz - az;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 1.5) continue;

        const ux = dx / segLen;
        const uz = dz / segLen;
        const rx = -uz;
        const rz = ux;

        let localD = 0;
        while (localD < segLen) {
          const inCycle = (dist + localD) % cycle;
          if (inCycle < dashLen) {
            const dStart = localD;
            const dEnd = Math.min(segLen, localD + (dashLen - inCycle));
            if (dEnd - dStart > 0.6) {
              const t0 = dStart / segLen;
              const t1 = dEnd / segLen;
              const cx0 = ax + dx * t0;
              const cz0 = az + dz * t0;
              const cx1 = ax + dx * t1;
              const cz1 = az + dz * t1;

              const g0 = this.getClampedGroundY(cx0, cz0, ay);
              const g1 = this.getClampedGroundY(cx1, cz1, by);
              const y0 = g0 + bridgeLift + yOff;
              const y1 = g1 + bridgeLift + yOff;

              const stripeHalfW = 0.11;
              for (const lOff of laneOffsets) {
                const oxL = rx * (lOff - stripeHalfW);
                const ozL = rz * (lOff - stripeHalfW);
                const oxR = rx * (lOff + stripeHalfW);
                const ozR = rz * (lOff + stripeHalfW);
                pushQuad(
                  cx0 + oxL, y0, cz0 + ozL,
                  cx0 + oxR, cz0 + ozR,
                  cx1 + oxR, y1, cz1 + ozR,
                  cx1 + oxL, cz1 + ozL
                );
              }
            }
            localD = dEnd + gapLen;
          } else {
            localD += cycle - inCycle;
          }
        }
        dist += segLen;
      }
    }

    const urbanWays = [...arterials, ...collectors];
    for (let wIdx = 0; wIdx < urbanWays.length; wIdx++) {
      const w = urbanWays[wIdx];
      if (w.bridge || w.layer > 0) continue;
      const pts = w.pts;
      const n = Math.floor(pts.length / 3);
      if (n < 2) continue;

      let accum = 0;
      for (let i = 0; i < n - 1; i++) {
        const ax = pts[i * 3];
        const ay = pts[i * 3 + 1];
        const az = pts[i * 3 + 2];
        const bx = pts[(i + 1) * 3];
        const bz = pts[(i + 1) * 3 + 2];

        const dx = bx - ax;
        const dz = bz - az;
        const segLen = Math.hypot(dx, dz);
        accum += segLen;

        if (segLen >= 22 && accum >= 85) {
          accum = 0;
          if (this.isInsideMajorBridgeCorridor(ax, az, false)) continue;
          const g = this.getClampedGroundY(ax, az, ay);
          if (g < 0.6) continue;

          const ux = dx / segLen;
          const uz = dz / segLen;
          const rx = -uz;
          const rz = ux;

          const cwDist = 4.0;
          const cwLen = 2.6;
          const cx0 = ax + ux * cwDist;
          const cz0 = az + uz * cwDist;
          const cx1 = ax + ux * (cwDist + cwLen);
          const cz1 = az + uz * (cwDist + cwLen);

          const y0 = this.getClampedGroundY(cx0, cz0, g) + 0.45;
          const y1 = this.getClampedGroundY(cx1, cz1, g) + 0.45;

          const halfRoad = Math.max(3.0, w.width * 0.44);
          const barW = 0.42;
          const barStep = 1.05;
          for (let bOff = -halfRoad + 0.6; bOff <= halfRoad - 0.6; bOff += barStep) {
            const oxL = rx * (bOff - barW * 0.5);
            const ozL = rz * (bOff - barW * 0.5);
            const oxR = rx * (bOff + barW * 0.5);
            const ozR = rz * (bOff + barW * 0.5);
            pushQuad(
              cx0 + oxL, y0, cz0 + ozL,
              cx0 + oxR, cz0 + ozR,
              cx1 + oxR, y1, cz1 + ozR,
              cx1 + oxL, cz1 + ozL
            );
          }
        }
      }
    }

    if (wCur > 0) {
      const whiteGeo = new THREE.BufferGeometry();
      whiteGeo.setAttribute('position', new THREE.Float32BufferAttribute(whitePos, 3));
      whiteGeo.setIndex(whiteIdx);
      whiteGeo.computeVertexNormals();
      whiteGeo.computeBoundingSphere();

      const whiteMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#EAEFF5'),
        roughness: 0.55,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
      });
      this.registerModeMaterial(whiteMat, '#EAEFF5', '#FFFFFF');
      this.laneMarkingsMesh = new THREE.Mesh(whiteGeo, whiteMat);
      this.laneMarkingsMesh.receiveShadow = true;
      this.detailGroup.add(this.laneMarkingsMesh);
    }
  }

  private buildMovingCableCars(routes: CableCarRoute[]) {
    const carMatBody = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#9E241A'),
      roughness: 0.4,
      metalness: 0.2,
    });
    const carMatRoof = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#F2E6CE'),
      roughness: 0.6,
    });

    for (const route of routes) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < route.pts.length; i += 3) {
        const x = route.pts[i];
        const z = route.pts[i + 2];
        const y = this.getClampedGroundY(x, z, route.pts[i + 1]) + 0.52;
        pts.push(new THREE.Vector3(x, y, z));
      }
      if (pts.length < 2) continue;

      const segLens: number[] = [];
      let totalLen = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pts[i].distanceTo(pts[i + 1]);
        segLens.push(d);
        totalLen += d;
      }
      if (totalLen < 50) continue;

      for (let carIdx = 0; carIdx < 3; carIdx++) {
        const carGroup = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.6, 8.6), carMatBody);
        body.position.y = 1.6;
        body.castShadow = true;
        carGroup.add(body);

        const clerestory = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 7.2), carMatRoof);
        clerestory.position.y = 3.1;
        carGroup.add(clerestory);

        const headlight = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffe899 })
        );
        headlight.position.set(0, 1.5, 4.4);
        carGroup.add(headlight);

        this.sharedGroup.add(carGroup);
        this.cableCarMeshes.push({
          mesh: carGroup,
          routePts: pts,
          totalLen,
          segLens,
          progress: ((carIdx * 0.33) % 1.0) * totalLen,
          speed: 8.5,
          dir: carIdx % 2 === 0 ? 1 : -1,
        });
      }
    }
  }

  private buildMovingCityTraffic(ways: BakedRoadWay[]) {
    const candidateRoutes: TrafficRoute[] = [];

    for (const w of ways) {
      if (w.cls > 3) continue;
      const n = Math.floor(w.pts.length / 3);
      if (n < 2) continue;

      const cleanCoords: number[] = [];
      const bridgeLift = w.layer > 0 ? w.layer * 5.2 : 0;
      const roadSurfOffset = w.cls === 0 ? 0.56 : w.cls === 1 ? 0.44 : 0.34;

      for (let i = 0; i < n; i++) {
        const x = w.pts[i * 3];
        const rawY = w.pts[i * 3 + 1];
        const z = w.pts[i * 3 + 2];
        if (this.isInsideMajorBridgeCorridor(x, z, w.bridge)) break;
        if (this.sampleGround && this.sampleGround(x, z) < 0.5) break;

        const y = this.getClampedGroundY(x, z, rawY) + bridgeLift + roadSurfOffset;
        cleanCoords.push(x, y, z);
      }

      const cn = Math.floor(cleanCoords.length / 3);
      if (cn < 2) continue;

      const cumLen = new Float32Array(cn);
      let totalLen = 0;
      for (let i = 1; i < cn; i++) {
        const dx = cleanCoords[i * 3] - cleanCoords[(i - 1) * 3];
        const dy = cleanCoords[i * 3 + 1] - cleanCoords[(i - 1) * 3 + 1];
        const dz = cleanCoords[i * 3 + 2] - cleanCoords[(i - 1) * 3 + 2];
        totalLen += Math.hypot(dx, dy, dz);
        cumLen[i] = totalLen;
      }

      const minLen = w.cls <= 1 ? 75 : w.cls === 2 ? 110 : 160;
      if (totalLen < minLen) continue;

      const midIdx = Math.floor(cn * 0.5) * 3;
      const midX = cleanCoords[midIdx];
      const midZ = cleanCoords[midIdx + 2];

      const laneOffset = Math.max(1.5, Math.min(4.8, w.width * 0.23));
      const speedBase =
        w.cls === 0 ? 24.0 : w.cls === 1 ? 15.5 : w.cls === 2 ? 12.5 : 10.0;

      candidateRoutes.push({
        pts: new Float32Array(cleanCoords),
        cumLen,
        totalLen,
        laneOffset,
        speedBase,
        midX,
        midZ,
      });
    }

    if (candidateRoutes.length === 0) return;

    candidateRoutes.sort((a, b) => b.totalLen - a.totalLen);
    this.trafficRoutes = candidateRoutes.slice(0, 320);

    const maxVehicles = 540;
    const automotivePalette = [
      new THREE.Color('#F4F6F8'),
      new THREE.Color('#D8DEE6'),
      new THREE.Color('#282D34'),
      new THREE.Color('#C82822'),
      new THREE.Color('#1E4888'),
      new THREE.Color('#F5B82E'),
      new THREE.Color('#4A525D'),
      new THREE.Color('#2B6E48'),
      new THREE.Color('#E26826'),
      new THREE.Color('#EAE2D2'),
    ];

    const bodyColors: THREE.Color[] = [];

    for (let rIdx = 0; rIdx < this.trafficRoutes.length; rIdx++) {
      if (this.trafficAgents.length >= maxVehicles) break;
      const route = this.trafficRoutes[rIdx];
      const countOnRoute = Math.min(
        4,
        Math.max(1, Math.floor(route.totalLen / 140))
      );

      for (let c = 0; c < countOnRoute; c++) {
        if (this.trafficAgents.length >= maxVehicles) break;
        const idx = this.trafficAgents.length;
        const dir: 1 | -1 = (idx + c) % 2 === 0 ? 1 : -1;
        const isBusOrTruck = idx % 14 === 0;
        const scaleL = isBusOrTruck ? 2.15 : 0.92 + (idx % 5) * 0.06;
        const scaleW = isBusOrTruck ? 1.22 : 0.95 + (idx % 3) * 0.05;
        const scaleH = isBusOrTruck ? 1.85 : 0.95 + (idx % 4) * 0.07;

        this.trafficAgents.push({
          routeIdx: rIdx,
          dist: ((c + 0.17 * (rIdx % 5)) / countOnRoute) * route.totalLen,
          speed: route.speedBase * (0.82 + ((idx * 13) % 19) * 0.02),
          dir,
          laneShift: route.laneOffset * dir,
          scaleL,
          scaleW,
          scaleH,
        });

        bodyColors.push(automotivePalette[idx % automotivePalette.length]);
      }
    }

    const totalCars = this.trafficAgents.length;
    if (totalCars === 0) return;

    const bodyGeo = new THREE.BoxGeometry(2.05, 0.82, 4.5);
    bodyGeo.translate(0, 0.52, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0.45,
    });
    this.carBodyInst = new THREE.InstancedMesh(bodyGeo, bodyMat, totalCars);
    this.carBodyInst.frustumCulled = false;
    this.carBodyInst.castShadow = false;
    this.carBodyInst.receiveShadow = true;
    for (let i = 0; i < totalCars; i++) {
      this.carBodyInst.setColorAt(i, bodyColors[i]);
    }
    if (this.carBodyInst.instanceColor) {
      this.carBodyInst.instanceColor.needsUpdate = true;
    }

    const cabinGeo = new THREE.BoxGeometry(1.74, 0.64, 2.35);
    cabinGeo.translate(0, 1.18, -0.15);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1E2630'),
      roughness: 0.18,
      metalness: 0.75,
    });
    this.carCabinInst = new THREE.InstancedMesh(cabinGeo, cabinMat, totalCars);
    this.carCabinInst.frustumCulled = false;

    const headlightGeo = new THREE.BoxGeometry(1.68, 0.26, 0.22);
    headlightGeo.translate(0, 0.56, 2.26);
    this.carHeadlightMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFF6D6'),
    });
    this.carHeadlightInst = new THREE.InstancedMesh(
      headlightGeo,
      this.carHeadlightMat,
      totalCars
    );
    this.carHeadlightInst.frustumCulled = false;

    const taillightGeo = new THREE.BoxGeometry(1.68, 0.26, 0.22);
    taillightGeo.translate(0, 0.58, -2.26);
    this.carTaillightMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FF281B'),
    });
    this.carTaillightInst = new THREE.InstancedMesh(
      taillightGeo,
      this.carTaillightMat,
      totalCars
    );
    this.carTaillightInst.frustumCulled = false;

    this.detailGroup.add(this.carBodyInst);
    this.detailGroup.add(this.carCabinInst);
    this.detailGroup.add(this.carHeadlightInst);
    this.detailGroup.add(this.carTaillightInst);

    this.updateTrafficInstances(0.016, 0.0, undefined, true);
  }

  private updateTrafficInstances(
    dt: number,
    nightFactor: number,
    cameraPos?: THREE.Vector3,
    forceAll = false
  ) {
    if (
      !this.carBodyInst ||
      !this.carCabinInst ||
      !this.carHeadlightInst ||
      !this.carTaillightInst
    ) {
      return;
    }

    this.trafficTick = (this.trafficTick + 1) & 3;
    const dummy = this.trafficDummy;
    const totalCars = this.trafficAgents.length;
    const lightScale = 1.0 + nightFactor * 0.45;
    const camX = cameraPos ? cameraPos.x : 0;
    const camZ = cameraPos ? cameraPos.z : 0;
    const nearDistSq = 2400 * 2400;
    const maxCarVisDistSq = 5500 * 5500;

    if (cameraPos && cameraPos.y > 2200) {
      this.carBodyInst.visible = false;
      this.carCabinInst.visible = false;
      this.carHeadlightInst.visible = false;
      this.carTaillightInst.visible = false;
      return;
    }
    this.carBodyInst.visible = true;
    this.carCabinInst.visible = true;
    this.carHeadlightInst.visible = true;
    this.carTaillightInst.visible = true;

    for (let i = 0; i < totalCars; i++) {
      const ag = this.trafficAgents[i];
      const route = this.trafficRoutes[ag.routeIdx];

      // Distance-based LOD update throttling: close vehicles update at full 60Hz,
      // distant vehicles (> 2.4 km) update every 4th frame with 4x dt step.
      let stepDt = dt;
      if (!forceAll && cameraPos) {
        const dxR = route.midX - camX;
        const dzR = route.midZ - camZ;
        const dSqR = dxR * dxR + dzR * dzR;
        if (dSqR > maxCarVisDistSq) continue;
        if (dSqR > nearDistSq) {
          if (((i + this.trafficTick) & 3) !== 0) continue;
          stepDt = dt * 4.0;
        }
      }

      const pts = route.pts;
      const cum = route.cumLen;
      const nSegs = cum.length - 1;

      ag.dist += ag.speed * stepDt * ag.dir;
      if (ag.dist >= route.totalLen) {
        ag.dist -= route.totalLen;
      } else if (ag.dist < 0) {
        ag.dist += route.totalLen;
      }

      let lo = 0;
      let hi = nSegs - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (cum[mid] <= ag.dist) lo = mid;
        else hi = mid - 1;
      }
      const segIdx = lo;
      const segStart = cum[segIdx];
      const segEnd = cum[segIdx + 1];
      const segLen = Math.max(0.01, segEnd - segStart);
      const t = (ag.dist - segStart) / segLen;

      const i0 = segIdx * 3;
      const i1 = (segIdx + 1) * 3;
      const x0 = pts[i0];
      const y0 = pts[i0 + 1];
      const z0 = pts[i0 + 2];
      const x1 = pts[i1];
      const y1 = pts[i1 + 1];
      const z1 = pts[i1 + 2];

      const dx = (x1 - x0) * ag.dir;
      const dy = (y1 - y0) * ag.dir;
      const dz = (z1 - z0) * ag.dir;
      const horizLen = Math.hypot(dx, dz) || 1;

      const rx = -dz / horizLen;
      const rz = dx / horizLen;
      const laneOff = route.laneOffset;

      const wx = x0 + (x1 - x0) * t + rx * laneOff;
      const wz = z0 + (z1 - z0) * t + rz * laneOff;
      const wy = y0 + (y1 - y0) * t;

      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, horizLen);

      dummy.position.set(wx, wy, wz);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(pitch, yaw, 0);
      dummy.scale.set(ag.scaleW, ag.scaleH, ag.scaleL);
      dummy.updateMatrix();

      this.carBodyInst.setMatrixAt(i, dummy.matrix);
      this.carCabinInst.setMatrixAt(i, dummy.matrix);

      if (nightFactor > 0.05) {
        dummy.scale.set(ag.scaleW * lightScale, ag.scaleH * lightScale, ag.scaleL);
        dummy.updateMatrix();
      }
      this.carHeadlightInst.setMatrixAt(i, dummy.matrix);
      this.carTaillightInst.setMatrixAt(i, dummy.matrix);
    }

    this.carBodyInst.instanceMatrix.needsUpdate = true;
    this.carCabinInst.instanceMatrix.needsUpdate = true;
    this.carHeadlightInst.instanceMatrix.needsUpdate = true;
    this.carTaillightInst.instanceMatrix.needsUpdate = true;
  }

  private buildStreetLamps(streetLamps: number[], ways: BakedRoadWay[]) {
    const lampEntries: { x: number; y: number; z: number; yaw: number }[] = [];

    for (const w of ways) {
      if (w.cls !== 1 && w.cls !== 2) continue;
      if (w.bridge) continue;
      const pts = w.pts;
      const n = Math.floor(pts.length / 3);
      if (n < 2) continue;

      const spacing = w.cls === 1 ? 52 : 76;
      const curbOffset = w.width * 0.5 + 0.85;
      let accum = 18;
      let sideToggle = 1;

      for (let i = 0; i < n - 1; i++) {
        const ax = pts[i * 3];
        const ay = pts[i * 3 + 1];
        const az = pts[i * 3 + 2];
        const bx = pts[(i + 1) * 3];
        const by = pts[(i + 1) * 3 + 1];
        const bz = pts[(i + 1) * 3 + 2];

        const dx = bx - ax;
        const dz = bz - az;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 8) continue;

        const ux = dx / segLen;
        const uz = dz / segLen;
        const rx = -uz;
        const rz = ux;

        while (accum < segLen) {
          if (lampEntries.length >= 3000) break;
          const t = accum / segLen;
          const cx = ax + dx * t;
          const cz = az + dz * t;
          if (!this.isInsideMajorBridgeCorridor(cx, cz, false)) {
            const g = this.getClampedGroundY(cx, cz, ay + (by - ay) * t);
            if (g >= 0.65) {
              const lx = cx + rx * curbOffset * sideToggle;
              const lz = cz + rz * curbOffset * sideToggle;
              const ly = this.getClampedGroundY(lx, lz, g);
              const armDirX = -rx * sideToggle;
              const armDirZ = -rz * sideToggle;
              const yaw = Math.atan2(armDirX, armDirZ);
              lampEntries.push({ x: lx, y: ly, z: lz, yaw });
              sideToggle = -sideToggle;
            }
          }
          accum += spacing;
        }
        if (lampEntries.length >= 3000) break;
        accum -= segLen;
      }
      if (lampEntries.length >= 3000) break;
    }

    const rawCount = Math.floor(streetLamps.length / 3);
    for (let i = 0; i < rawCount; i += 2) {
      if (lampEntries.length >= 3200) break;
      const x = streetLamps[i * 3];
      const rawY = streetLamps[i * 3 + 1];
      const z = streetLamps[i * 3 + 2];
      if (this.isInsideMajorBridgeCorridor(x, z, false)) continue;
      const y = this.getClampedGroundY(x, z, rawY);
      if (y < 0.65) continue;
      lampEntries.push({ x, y, z, yaw: (i * 1.57) % (Math.PI * 2) });
    }

    const count = lampEntries.length;
    if (count === 0) return;

    const poleHeight = 7.2;
    const armLen = 1.85;

    const poleGeo = new THREE.CylinderGeometry(0.09, 0.16, poleHeight, 5);
    poleGeo.translate(0, poleHeight * 0.5, 0);
    const poleMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2B3036'),
      roughness: 0.45,
      metalness: 0.65,
    });
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, count);
    poleInst.frustumCulled = false;
    poleInst.castShadow = false;
    poleInst.receiveShadow = true;

    const armGeo = new THREE.BoxGeometry(0.14, 0.14, armLen);
    armGeo.translate(0, poleHeight - 0.12, armLen * 0.48);
    const armInst = new THREE.InstancedMesh(armGeo, poleMat, count);
    armInst.frustumCulled = false;

    const bulbGeo = new THREE.OctahedronGeometry(0.28, 0);
    bulbGeo.translate(0, poleHeight - 0.26, armLen * 0.92);
    this.lampBulbMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFF2CC'),
    });
    const bulbInst = new THREE.InstancedMesh(bulbGeo, this.lampBulbMat, count);
    bulbInst.frustumCulled = false;

    const haloGeo = new THREE.OctahedronGeometry(2.2, 0);
    haloGeo.translate(0, poleHeight - 0.26, armLen * 0.92);
    this.lampGlowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffb866),
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const haloInst = new THREE.InstancedMesh(haloGeo, this.lampGlowMat, count);
    haloInst.frustumCulled = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const item = lampEntries[i];
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);
      armInst.setMatrixAt(i, dummy.matrix);
      bulbInst.setMatrixAt(i, dummy.matrix);
      haloInst.setMatrixAt(i, dummy.matrix);
    }

    poleInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    haloInst.instanceMatrix.needsUpdate = true;

    this.streetLampDayGroup.add(poleInst);
    this.streetLampDayGroup.add(armInst);
    this.streetLampDayGroup.add(bulbInst);
    this.nightLightsGroup.add(haloInst);
  }

  private buildInstancedTrees(buffer: ArrayBuffer) {
    const dv = new DataView(buffer);
    const count = dv.getUint32(0, true);
    if (count === 0) return;

    const speciesPalette = [
      { sat: '#486E3A', vec: '#A9D69E', geo: new THREE.DodecahedronGeometry(1.0, 0) },
      { sat: '#2E5332', vec: '#96C98B', geo: new THREE.ConeGeometry(0.95, 2.2, 6) },
      { sat: '#527348', vec: '#B2DCAA', geo: new THREE.IcosahedronGeometry(1.02, 0) },
      { sat: '#5B803D', vec: '#BBE2B1', geo: new THREE.OctahedronGeometry(0.95, 1) },
      { sat: '#6A8352', vec: '#C2E6B8', geo: new THREE.IcosahedronGeometry(0.95, 0) },
    ];

    const buckets: { x: number; y: number; z: number; h: number }[][] = [
      [],
      [],
      [],
      [],
      [],
    ];

    const occupiedCells = new Set<number>();
    let off = 4;
    for (let i = 0; i < count; i++) {
      const x = dv.getInt16(off, true);
      const rawY = dv.getInt16(off + 2, true) * 0.1;
      const z = dv.getInt16(off + 4, true);
      const sp = dv.getUint8(off + 6) % 5;
      const h = dv.getUint8(off + 7) * 0.25;
      off += 8;

      if (h < 4.2) continue;
      const cellKey = ((Math.round(x / 7.5) + 4096) << 14) ^ (Math.round(z / 7.5) + 4096);
      if (occupiedCells.has(cellKey)) continue;
      if (this.isInsideMajorBridgeCorridor(x, z, false)) continue;
      const y = this.getClampedGroundY(x, z, rawY);
      if (y < 0.5) continue;
      occupiedCells.add(cellKey);
      buckets[sp].push({ x, y, z, h });
    }

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    for (let sp = 0; sp < 5; sp++) {
      const list = buckets[sp];
      if (list.length === 0) continue;

      const spec = speciesPalette[sp];
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(spec.sat),
        roughness: 0.86,
        metalness: 0.0,
      });

      const inst = new THREE.InstancedMesh(spec.geo, mat, list.length);
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = true;

      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const hash = ((i * 2654435761) >>> 0) / 4294967296;
        const radius = t.h * (0.33 + hash * 0.08);
        dummy.position.set(t.x, t.y + t.h * 0.54, t.z);
        dummy.scale.set(radius, t.h * (0.48 + hash * 0.08), radius * (0.92 + (1 - hash) * 0.16));
        dummy.rotation.y = hash * Math.PI * 2;
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);

        const shade = 0.86 + hash * 0.26;
        tint.setRGB(shade * (0.96 + hash * 0.08), shade, shade * (0.94 + (1 - hash) * 0.08));
        inst.setColorAt(i, tint);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      this.detailGroup.add(inst);

      this.treeInstancedMeshes.push({
        mesh: inst,
        satColor: new THREE.Color(spec.sat),
        vecColor: new THREE.Color(spec.vec),
      });
    }
  }

  public setMode(mode: RenderMode) {
    this.mode = mode;
    const isVec = mode === 'vector';
    this.vectorOnlyGroup.visible = isVec;

    for (const item of this.modeMaterials) {
      item.mat.color.copy(isVec ? item.vecColor : item.satColor);
    }

    for (const item of this.treeInstancedMeshes) {
      const mat = item.mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(isVec ? item.vecColor : item.satColor);
    }
  }

  public update(dt: number, nightFactor: number, cameraPos?: THREE.Vector3) {
    const clampedDt = Math.min(0.1, dt);

    // Distance / Altitude LOD for fine street detail layers
    if (cameraPos) {
      const alt = cameraPos.y;
      this.streetLampDayGroup.visible = alt < 880;
      if (this.laneMarkingsMesh) {
        this.laneMarkingsMesh.visible = alt < 1750;
      }
      for (const t of this.treeInstancedMeshes) {
        t.mesh.visible = alt < 2800;
      }
    }

    // 1. Animate moving historic Cable Cars
    for (const car of this.cableCarMeshes) {
      car.progress += car.speed * clampedDt * car.dir;
      if (car.progress >= car.totalLen) {
        car.progress = car.totalLen;
        car.dir = -1;
      } else if (car.progress <= 0) {
        car.progress = 0;
        car.dir = 1;
      }

      let rem = car.progress;
      let idx = 0;
      while (idx < car.segLens.length - 1 && rem > car.segLens[idx]) {
        rem -= car.segLens[idx];
        idx++;
      }
      const p0 = car.routePts[idx];
      const p1 = car.routePts[idx + 1];
      const t = car.segLens[idx] > 0.01 ? rem / car.segLens[idx] : 0;

      car.mesh.position.lerpVectors(p0, p1, t);
      const lookTarget = car.dir > 0 ? p1 : p0;
      car.mesh.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
    }

    // 2. Animate 760 city-wide 3D cars, taxis, buses & trucks (with distance-throttled LOD)
    this.updateTrafficInstances(clampedDt, nightFactor, cameraPos);

    // 3. Street lamp luminaire & night halo glow
    if (this.lampGlowMat) {
      this.lampGlowMat.opacity = THREE.MathUtils.clamp(nightFactor * 1.15, 0, 0.92);
      this.nightLightsGroup.visible = nightFactor > 0.04;
    }
  }
}
