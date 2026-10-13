// BuildingsLayer — Streams and meshes all 176,777 San Francisco buildings across 36 spatial cells
// using a dedicated Web Worker pool (src/buildings/buildingWorker.ts -> BuildingMesher.ts)
// with view-frustum priority streaming, frame-budgeted GPU uploads (1 cell/frame),
// dynamic camera-centric shadow culling, and distance LOD.

import * as THREE from 'three';
import { VisualMode } from './coords';
import { meshBuildingCellBuffer, type MeshedBuildingCell } from '../buildings/BuildingMesher';
import type { WorkerMeshResponse } from '../buildings/buildingWorker';
import { shared, setVariant } from './materials';

export interface BuildingCellInfo {
  ix: number;
  iz: number;
  file: string;
  count: number;
  centerX: number;
  centerZ: number;
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
}

export interface BuildingManifest {
  totalBuildings: number;
  gridCols: number;
  gridRows: number;
  coordQuantScale: number;
  cells: BuildingCellInfo[];
}

interface ReadyCellPayload {
  cell: BuildingCellInfo;
  meshed: MeshedBuildingCell;
}

export class BuildingsLayer {
  public readonly group = new THREE.Group();
  public material: THREE.MeshStandardMaterial;
  public cellMeshes: THREE.Mesh[] = [];
  public loadedCellCount = 0;
  public totalTriangles = 0;
  public maxDrawDistance = 8200;
  public shadowDistance = 1650;

  private manifest: BuildingManifest | null = null;
  private pendingCells: BuildingCellInfo[] = [];
  private readyQueue: ReadyCellPayload[] = [];
  private builtCells = new Set<string>();
  private inFlightCount = 0;
  private readonly maxConcurrent = 2;

  private workers: Worker[] = [];
  private workerRoundRobin = 0;
  private nextReqId = 1;
  private workerCallbacks = new Map<number, (meshed: MeshedBuildingCell | null) => void>();

  private camPos = new THREE.Vector3(1450, 220, -1350);
  private lastCullCamPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private camForward = new THREE.Vector3(0, 0, -1);
  private cullTick = 0;

  constructor(private scene: THREE.Scene, facadeMat: THREE.MeshStandardMaterial) {
    this.material = facadeMat;
    this.scene.add(this.group);
    this.initWorkers();
  }

  private initWorkers(): void {
    if (typeof Worker === 'undefined') return;
    try {
      const workerCount = Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 4) >> 1));
      for (let i = 0; i < workerCount; i++) {
        const w = new Worker(new URL('../buildings/buildingWorker.ts', import.meta.url), {
          type: 'module',
        });
        w.onmessage = (e: MessageEvent<WorkerMeshResponse>) => {
          const data = e.data;
          const cb = this.workerCallbacks.get(data.id);
          if (!cb) return;
          this.workerCallbacks.delete(data.id);
          if (!data.position || !data.normal || !data.color || !data.aFacade || !data.aBldg || data.triangles === 0) {
            cb(null);
          } else {
            cb({
              position: data.position,
              normal: data.normal,
              color: data.color,
              aFacade: data.aFacade,
              aBldg: data.aBldg,
              triangles: data.triangles,
            });
          }
        };
        w.onerror = () => {
          // Fallback handled per request if needed
        };
        this.workers.push(w);
      }
    } catch {
      this.workers = [];
    }
  }

  private meshCellAsync(cell: BuildingCellInfo, buffer: ArrayBuffer): Promise<MeshedBuildingCell | null> {
    const quant = this.manifest?.coordQuantScale ?? 0.08;
    if (this.workers.length === 0) {
      return Promise.resolve(
        meshBuildingCellBuffer(buffer, cell.centerX, cell.centerZ, cell.ix, cell.iz, quant)
      );
    }

    return new Promise((resolve) => {
      const id = this.nextReqId++;
      this.workerCallbacks.set(id, resolve);
      const worker = this.workers[this.workerRoundRobin % this.workers.length];
      this.workerRoundRobin++;
      worker.postMessage(
        {
          id,
          file: cell.file,
          buffer,
          centerX: cell.centerX,
          centerZ: cell.centerZ,
          ix: cell.ix,
          iz: cell.iz,
          quant,
        },
        [buffer]
      );
    });
  }

  public setOrthoTexture(tex: THREE.Texture | null): void {
    shared.uOrtho.value = tex;
  }

  public applyMode(mode: VisualMode): void {
    const isAbstract = mode === 'vector';
    shared.uOrthoOn.value = isAbstract ? 0.0 : 1.0;
    setVariant({ abstract: isAbstract });
  }

  public setMode(mode: VisualMode): void {
    this.applyMode(mode);
  }

  private resolveUrl(file: string): string {
    // Relative to the page so the site also works under a sub-path (e.g. GitHub Pages).
    const f = file.replace(/^\.?\/+/, '');
    return f.startsWith('data/')
      ? `./${f}`
      : f.startsWith('buildings/')
        ? `./data/${f}`
        : `./data/buildings/${f}`;
  }

  private scoreCellPriority(cell: BuildingCellInfo): number {
    const dx = cell.centerX - this.camPos.x;
    const dz = cell.centerZ - this.camPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1800) return dist * 0.4; // Immediate neighborhood around camera always first
    const inv = 1 / (dist || 1);
    const dot = (dx * inv) * this.camForward.x + (dz * inv) * this.camForward.z;
    // Cells in front of camera view frustum get priority over cells behind camera
    const dirWeight = dot > 0.15 ? 0.55 : dot > -0.2 ? 0.85 : 1.25;
    return dist * dirWeight;
  }

  public async loadManifest(
    cameraX = 1450,
    cameraZ = -1350,
    onInitialProgress?: (done: number, total: number) => void
  ): Promise<void> {
    this.camPos.set(cameraX, 220, cameraZ);
    const res = await fetch('./data/buildings/manifest.json');
    this.manifest = (await res.json()) as BuildingManifest;

    const validCells = [...this.manifest.cells].filter((c) => c.count > 0 && c.file);
    validCells.sort((a, b) => this.scoreCellPriority(a) - this.scoreCellPriority(b));

    // Only load the 4 nearest cells around the starting camera during the initial loading screen
    // so the user enters a 60 FPS scene fast; stream the remaining 32 cells in the background!
    const initialCount = Math.min(4, validCells.length);
    const initialCells = validCells.slice(0, initialCount);
    this.pendingCells = validCells.slice(initialCount);

    let done = 0;
    onInitialProgress?.(0, initialCount);

    await Promise.all(
      initialCells.map(async (cell) => {
        try {
          const buf = await fetch(this.resolveUrl(cell.file)).then((r) => r.arrayBuffer());
          const meshed = await this.meshCellAsync(cell, buf);
          if (meshed && !this.builtCells.has(cell.file)) {
            this.builtCells.add(cell.file);
            this.uploadCellMesh(cell, meshed);
            this.loadedCellCount++;
          }
        } catch (err) {
          console.warn('Failed to load initial building cell:', cell.file, err);
        } finally {
          done++;
          onInitialProgress?.(done, initialCount);
        }
      })
    );

    // Kick off background streaming for remaining cells
    this.pumpBackgroundQueue();
  }

  public async loadAllRemaining(): Promise<void> {
    const remaining = [...this.pendingCells];
    this.pendingCells.length = 0;
    await Promise.all(
      remaining.map(async (cell) => {
        if (this.builtCells.has(cell.file)) return;
        try {
          const buf = await fetch(this.resolveUrl(cell.file)).then((r) => r.arrayBuffer());
          const meshed = await this.meshCellAsync(cell, buf);
          if (meshed && !this.builtCells.has(cell.file)) {
            this.builtCells.add(cell.file);
            this.uploadCellMesh(cell, meshed);
            this.loadedCellCount++;
          }
        } catch (err) {
          console.warn('Failed to preload cell:', cell.file, err);
        }
      })
    );
    while (this.inFlightCount > 0) {
      await new Promise((r) => setTimeout(r, 25));
    }
    while (this.readyQueue.length > 0) {
      const next = this.readyQueue.shift()!;
      if (!this.builtCells.has(next.cell.file)) {
        this.builtCells.add(next.cell.file);
        this.uploadCellMesh(next.cell, next.meshed);
        this.loadedCellCount++;
      }
    }
  }

  private pumpBackgroundQueue(): void {
    while (this.inFlightCount < this.maxConcurrent && this.pendingCells.length > 0) {
      // Pick highest-priority cell for current camera position & look direction
      let bestIdx = 0;
      let bestScore = this.scoreCellPriority(this.pendingCells[0]);
      for (let i = 1; i < this.pendingCells.length; i++) {
        const s = this.scoreCellPriority(this.pendingCells[i]);
        if (s < bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      }

      const [cell] = this.pendingCells.splice(bestIdx, 1);
      if (this.builtCells.has(cell.file)) continue;

      this.inFlightCount++;
      fetch(this.resolveUrl(cell.file))
        .then((r) => r.arrayBuffer())
        .then((buf) => this.meshCellAsync(cell, buf))
        .then((meshed) => {
          if (meshed && !this.builtCells.has(cell.file)) {
            this.readyQueue.push({ cell, meshed });
          }
        })
        .catch((err) => {
          console.warn('Failed to stream building cell:', cell.file, err);
        })
        .finally(() => {
          this.inFlightCount--;
          this.pumpBackgroundQueue();
        });
    }
  }

  public update(
    dt: number,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    _skyHorizon: THREE.Color,
    nightFactor: number,
    camera?: THREE.Camera
  ): void {
    shared.uTime.value += dt;
    shared.uWindowLife.value.y = (shared.uWindowLife.value.y + dt * 6.0) % 1e5;
    shared.uSunDir.value.copy(sunDir);
    shared.uSunGlint.value.copy(sunColor).multiplyScalar(1.5);
    shared.uNight.value = nightFactor;
    shared.uDark.value = nightFactor;

    if (camera) {
      this.camPos.copy(camera.position);
      camera.getWorldDirection(this.camForward);
      this.camForward.y = 0;
      if (this.camForward.lengthSq() > 1e-4) this.camForward.normalize();
    }

    // Upload at most 1 meshed building cell per frame to avoid GPU upload stalls
    if (this.readyQueue.length > 0) {
      const next = this.readyQueue.shift()!;
      if (!this.builtCells.has(next.cell.file)) {
        this.builtCells.add(next.cell.file);
        this.uploadCellMesh(next.cell, next.meshed);
        this.loadedCellCount++;
      }
    }

    if (this.pendingCells.length > 0 && this.inFlightCount < this.maxConcurrent) {
      this.pumpBackgroundQueue();
    }

    // Dynamic distance culling, view-frustum hysteresis & camera-centric shadow caster management
    // Runs every 8 frames during smooth flight, or immediately on camera cuts/teleports (>60m jump)
    this.cullTick++;
    const jumped = this.lastCullCamPos.distanceToSquared(this.camPos) > 60 * 60;
    if ((this.cullTick % 8 === 0 || jumped) && this.cellMeshes.length > 0) {
      this.lastCullCamPos.copy(this.camPos);
      const cx = this.camPos.x;
      const cz = this.camPos.z;
      const altBoost = Math.min(2800, Math.max(0, (this.camPos.y - 250) * 2.2));
      const effMaxDist = this.maxDrawDistance + altBoost;
      const maxDistSq = effMaxDist * effMaxDist;
      const nearAlwaysSq = 2800 * 2800;
      const shadowDistSq = this.shadowDistance * this.shadowDistance;

      for (let i = 0; i < this.cellMeshes.length; i++) {
        const m = this.cellMeshes[i];
        const dx = (m.userData.centerX as number) - cx;
        const dz = (m.userData.centerZ as number) - cz;
        const dSq = dx * dx + dz * dz;
        if (dSq > maxDistSq) {
          m.visible = false;
          m.castShadow = false;
          continue;
        }
        if (dSq <= nearAlwaysSq) {
          m.visible = true;
          m.castShadow = dSq <= shadowDistSq;
          continue;
        }
        const inv = 1 / Math.sqrt(dSq);
        const dot = dx * inv * this.camForward.x + dz * inv * this.camForward.z;
        // Cull cells behind the camera beyond 2.8 km so unseen neighborhoods cost 0 GPU vertices
        m.visible = dot > -0.35;
        m.castShadow = m.visible && dSq <= shadowDistSq;
      }
    }
  }

  private uploadCellMesh(cell: BuildingCellInfo, meshed: MeshedBuildingCell): void {
    if (meshed.triangles === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(meshed.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(meshed.normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(meshed.color, 3));
    geo.setAttribute('aFacade', new THREE.BufferAttribute(meshed.aFacade, 4));
    geo.setAttribute('aBldg', new THREE.BufferAttribute(meshed.aBldg, 4));
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.userData.facade = true;
    mesh.userData.centerX = cell.centerX;
    mesh.userData.centerZ = cell.centerZ;

    const distSq =
      (cell.centerX - this.camPos.x) ** 2 + (cell.centerZ - this.camPos.z) ** 2;
    mesh.visible = distSq <= this.maxDrawDistance * this.maxDrawDistance;
    mesh.castShadow = distSq <= this.shadowDistance * this.shadowDistance;
    mesh.receiveShadow = true;

    this.group.add(mesh);
    this.cellMeshes.push(mesh);
    this.totalTriangles += meshed.triangles;
  }
}
