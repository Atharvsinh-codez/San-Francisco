// HeroLandmarks.ts — Clean Modular Orchestrator for SF 3D Bridges, Universities & Landmarks
// Delegates 3D geometry construction to dedicated modules in src/models/:
// - src/models/GoldenGateBridge.ts
// - src/models/BayBridge.ts
// - src/models/Universities.ts
// - src/models/CityLandmarks.ts

import * as THREE from 'three';
import type { RenderMode } from '../camera/CameraSystem';
import type { HeroLandmarkSpec } from '../../tools/landmarks';
import { ModelContext } from '../models/types';
import { buildGoldenGateBridge } from '../models/GoldenGateBridge';
import { buildBayBridge } from '../models/BayBridge';
import { buildUniversityCampuses } from '../models/Universities';
import { buildCityLandmarks } from '../models/CityLandmarks';

export class HeroLandmarks {
  public readonly ctx: ModelContext;
  public get group(): THREE.Group {
    return this.ctx.group;
  }
  public landmarks: HeroLandmarkSpec[] = [];
  private mode: RenderMode = 'satellite';

  constructor(sampleGround: (x: number, z: number) => number) {
    this.ctx = new ModelContext(sampleGround);
  }

  public async load(): Promise<void> {
    const res = await fetch('./data/landmarks.json');
    const data = await res.json();
    this.landmarks = data.landmarks || [];

    buildGoldenGateBridge(this.ctx);
    buildBayBridge(this.ctx);
    buildCityLandmarks(this.ctx);
    buildUniversityCampuses(this.ctx);

    this.ctx.optimizeStaticMeshes();
    this.setMode(this.mode);
  }

  public sampleBridgeDeckHeight(x: number, z: number): number {
    for (const c of this.ctx.bridgeCorridors) {
      const dx = x - c.cx;
      const dz = z - c.cz;
      const localX = dx * c.cosA - dz * c.sinA;
      const localZ = dx * c.sinA + dz * c.cosA;
      if (Math.abs(localX) <= c.halfWidth && Math.abs(localZ) <= c.halfLength) {
        if (c.getDeckY) return c.getDeckY(localZ);
        const norm = localZ / c.halfLength;
        const camber = Math.cos(norm * Math.PI * 0.5) * c.camberM;
        return c.deckY + camber;
      }
    }
    return -Infinity;
  }

  public setMode(mode: RenderMode): void {
    this.mode = mode;
    const isVec = mode === 'vector';
    for (const m of this.ctx.satMaterials) {
      if (m.userData.satColor && m.userData.vecColor) {
        m.color.copy(isVec ? m.userData.vecColor : m.userData.satColor);
      }
    }
    if (this.ctx.salesforceCrownMat) {
      this.ctx.salesforceCrownMat.uniforms.uModeVector.value = isVec ? 1.0 : 0.0;
    }
  }

  public update(elapsedSec: number, nightFactor: number, dt = 0.016): void {
    const clampedDt = Math.min(0.1, dt);

    for (const car of this.ctx.bridgeCars) {
      car.zLocal += car.speed * clampedDt * car.dir;
      const limit = car.corridor.halfLength * 0.94;
      if (car.zLocal > limit) car.zLocal = -limit;
      if (car.zLocal < -limit) car.zLocal = limit;

      const yDeck = car.corridor.getDeckY
        ? car.corridor.getDeckY(car.zLocal)
        : car.corridor.deckY +
          Math.cos(Math.min(1, Math.abs(car.zLocal) / car.corridor.halfLength) * Math.PI * 0.5) *
            car.corridor.camberM;
      car.mesh.position.set(car.laneX, yDeck + 0.55, car.zLocal);
    }

    if (this.ctx.salesforceCrownMat) {
      this.ctx.salesforceCrownMat.uniforms.uTime.value = elapsedSec;
      this.ctx.salesforceCrownMat.uniforms.uNightFactor.value = nightFactor;
    }
    if (this.ctx.alcatrazBeam) {
      this.ctx.alcatrazBeam.rotation.y = elapsedSec * 0.85;
      this.ctx.alcatrazBeam.visible = nightFactor > 0.15;
    }
    for (const item of this.ctx.emissiveMeshes) {
      const mat = item.mesh.material as THREE.MeshBasicMaterial;
      const phase = item.phase || 0;
      const pulse = item.pulseSpeed
        ? 0.65 + 0.35 * Math.sin(elapsedSec * item.pulseSpeed + phase)
        : 1.0;
      const intensity = (0.38 + 0.62 * nightFactor) * pulse;
      mat.color.copy(item.baseColor).multiplyScalar(intensity);
    }
  }
}
