// 2D Canvas Screen-Space Cartographic Label & Landmark Pin Renderer for SF 3D
// - Editorial & architectural cartography palette matching the HUD (#ece5d8 bone ink, #0d0e12 obsidian, #e4572e International Orange)
// - Pre-cached glyph width tables (zero per-frame measureText overhead)
// - Camera-motion dirty check & collision-culled neighborhood/road/landmark callouts

import * as THREE from 'three';
import type { RenderMode } from '../camera/CameraSystem';
import type { NeighborhoodLabel, RoadLabelPlacement } from '../../tools/labels';
import type { HeroLandmarkSpec } from '../../tools/landmarks';

interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class LabelsOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public neighborhoods: NeighborhoodLabel[] = [];
  public roadLabels: RoadLabelPlacement[] = [];
  public landmarks: HeroLandmarkSpec[] = [];

  private landmarkWidths: number[] = [];
  private neighborhoodUpper: string[] = [];
  private neighborhoodWidths: number[] = [];
  private roadNameWidths: number[] = [];
  private roadRefClean: string[] = [];
  private roadRefWidths: number[] = [];

  private projVec = new THREE.Vector3();
  private projVec2 = new THREE.Vector3();
  private clickablePins: { bbox: BBox; landmark: HeroLandmarkSpec }[] = [];

  private lastCamPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private lastCamQuat = new THREE.Quaternion();
  private lastMode: RenderMode | null = null;
  private forceRedraw = true;

  constructor(
    canvas: HTMLCanvasElement,
    onSelectLandmark: (lm: HeroLandmarkSpec) => void
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    window.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('#hud-root')) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const pin of this.clickablePins) {
        if (mx >= pin.bbox.x0 && mx <= pin.bbox.x1 && my >= pin.bbox.y0 && my <= pin.bbox.y1) {
          onSelectLandmark(pin.landmark);
          break;
        }
      }
    });
  }

  public async load(landmarks: HeroLandmarkSpec[]): Promise<void> {
    this.landmarks = landmarks;
    const res = await fetch('./data/labels.json');
    const data = await res.json();
    this.neighborhoods = data.neighborhoods || [];
    this.roadLabels = data.roadLabels || [];
    this.cacheTextMetrics();
    this.forceRedraw = true;
  }

  private cacheTextMetrics(): void {
    const ctx = this.ctx;

    ctx.font = '500 11px ui-sans-serif, system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif';
    this.landmarkWidths = this.landmarks.map((lm) => ctx.measureText(lm.name).width);

    this.neighborhoodUpper = [];
    this.neighborhoodWidths = [];
    for (const n of this.neighborhoods) {
      const upper = n.name.toUpperCase();
      this.neighborhoodUpper.push(upper);
      const fontSize = n.tier === 1 ? 11.5 : 10;
      ctx.font = `600 ${fontSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      this.neighborhoodWidths.push(ctx.measureText(upper).width + upper.length * 1.4);
    }

    this.roadNameWidths = [];
    this.roadRefClean = [];
    this.roadRefWidths = [];
    for (const rl of this.roadLabels) {
      if (rl.cls === 0 && rl.ref) {
        const refClean = rl.ref.split(';')[0].trim();
        this.roadRefClean.push(refClean);
        ctx.font = '600 10px ui-monospace, "SF Mono", Menlo, monospace';
        this.roadRefWidths.push(Math.max(30, ctx.measureText(refClean).width + 12));
        this.roadNameWidths.push(0);
      } else {
        this.roadRefClean.push('');
        this.roadRefWidths.push(0);
        ctx.font = '500 10.5px ui-sans-serif, system-ui, -apple-system, "SF Pro Text", sans-serif';
        this.roadNameWidths.push(ctx.measureText(rl.name).width);
      }
    }
  }

  public resize(width: number, height: number, dpr: number) {
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.forceRedraw = true;
  }

  public getNearestNeighborhood(x: number, z: number): string {
    if (this.neighborhoods.length === 0) return 'San Francisco';
    let bestName = 'San Francisco Bay';
    let bestDistSq = 4200 * 4200;
    for (const n of this.neighborhoods) {
      const dx = x - n.x;
      const dz = z - n.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestName = n.name;
      }
    }
    return bestName;
  }

  public render(camera: THREE.PerspectiveCamera, mode: RenderMode) {
    if (
      !this.forceRedraw &&
      this.lastMode === mode &&
      this.lastCamPos.distanceToSquared(camera.position) < 0.02 &&
      1 - Math.abs(this.lastCamQuat.dot(camera.quaternion)) < 1e-6
    ) {
      return;
    }
    this.forceRedraw = false;
    this.lastMode = mode;
    this.lastCamPos.copy(camera.position);
    this.lastCamQuat.copy(camera.quaternion);

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    this.clickablePins.length = 0;
    const occupied: BBox[] = [];

    const overlaps = (b: BBox): boolean => {
      if (b.x0 < 18 || b.y0 < 62 || b.x1 > w - 18 || b.y1 > h - 68) return true;
      for (let i = 0; i < occupied.length; i++) {
        const o = occupied[i];
        if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) {
          return true;
        }
      }
      return false;
    };

    const camPos = camera.position;
    const cx = camPos.x;
    const cy = camPos.y;
    const cz = camPos.z;
    const isVector = mode === 'vector';

    // 1. Architectural Landmark Callouts with Vertical Leader Tick
    ctx.font = '500 11px ui-sans-serif, system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif';
    for (let i = 0; i < this.landmarks.length; i++) {
      const lm = this.landmarks[i];
      const topY = lm.baseY + lm.heightM + 14;
      const dx = lm.x - cx;
      const dy = topY - cy;
      const dz = lm.z - cz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > 16500 * 16500 || dSq < 35 * 35) continue;

      this.projVec.set(lm.x, topY, lm.z).project(camera);
      if (this.projVec.z > 1 || this.projVec.z < -1) continue;

      const sx = (this.projVec.x * 0.5 + 0.5) * w;
      const sy = (-this.projVec.y * 0.5 + 0.5) * h;

      const textW = this.landmarkWidths[i] || 68;
      const pillW = textW + 22;
      const pillH = 21;
      const bbox: BBox = {
        x0: sx - pillW * 0.5 - 6,
        y0: sy - pillH - 12,
        x1: sx + pillW * 0.5 + 6,
        y1: sy + 4,
      };

      if (overlaps(bbox)) continue;
      occupied.push(bbox);
      this.clickablePins.push({ bbox, landmark: lm });

      const px = sx - pillW * 0.5;
      const py = sy - pillH - 8;

      ctx.save();
      // Subtle vertical leader line connecting callout pill to structure apex
      ctx.beginPath();
      ctx.moveTo(sx, py + pillH);
      ctx.lineTo(sx, sy - 1);
      ctx.strokeStyle = isVector ? 'rgba(30, 30, 34, 0.35)' : 'rgba(236, 229, 216, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isVector
        ? 'rgba(247, 244, 238, 0.92)'
        : 'rgba(12, 13, 17, 0.84)';
      ctx.strokeStyle = isVector
        ? 'rgba(20, 20, 22, 0.18)'
        : 'rgba(236, 229, 216, 0.20)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(px, py, pillW, pillH, 4);
      ctx.fill();
      ctx.stroke();

      // Category square beacon (#e4572e International Orange for bridges/towers, warm ochre for civic/campus)
      ctx.fillStyle =
        lm.category === 'bridge' || lm.category === 'skyscraper'
          ? '#e4572e'
          : '#d89b52';
      ctx.fillRect(px + 7.5, py + pillH * 0.5 - 2, 4, 4);

      ctx.fillStyle = isVector ? '#161618' : '#ece5d8';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(lm.name, px + 16, py + pillH * 0.5 + 0.5);
      ctx.restore();
    }

    // 2. Cartographic District Labels
    for (let i = 0; i < this.neighborhoods.length; i++) {
      const n = this.neighborhoods[i];
      const maxDist = n.tier === 1 ? 19000 : n.tier === 2 ? 6800 : 2900;
      const minDist = n.tier === 1 ? 350 : 120;

      const dx = n.x - cx;
      const dy = n.y - cy;
      const dz = n.z - cz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > maxDist * maxDist || dSq < minDist * minDist) continue;

      this.projVec.set(n.x, n.y, n.z).project(camera);
      if (this.projVec.z > 1 || this.projVec.z < -1) continue;

      const sx = (this.projVec.x * 0.5 + 0.5) * w;
      const sy = (-this.projVec.y * 0.5 + 0.5) * h;

      const tw = this.neighborhoodWidths[i] || 60;
      const bbox: BBox = {
        x0: sx - tw * 0.5 - 10,
        y0: sy - 10,
        x1: sx + tw * 0.5 + 10,
        y1: sy + 10,
      };
      if (overlaps(bbox)) continue;
      occupied.push(bbox);

      const dist = Math.sqrt(dSq);
      const fade =
        (1 - THREE.MathUtils.smoothstep(dist, maxDist * 0.68, maxDist)) *
        THREE.MathUtils.smoothstep(dist, minDist, minDist * 1.4);

      const fontSize = n.tier === 1 ? 11 : 9.5;
      const labelText = this.neighborhoodUpper[i];

      ctx.save();
      ctx.font = `600 ${fontSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      if ('letterSpacing' in ctx) {
        (ctx as any).letterSpacing = '1.4px';
      }
      ctx.globalAlpha = fade * 0.86;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (isVector) {
        ctx.strokeStyle = 'rgba(245, 242, 235, 0.88)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(labelText, sx, sy);
        ctx.fillStyle = '#2c2b29';
        ctx.fillText(labelText, sx, sy);
      } else {
        ctx.strokeStyle = 'rgba(10, 11, 14, 0.82)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(labelText, sx, sy);
        ctx.fillStyle = '#e5dfd3';
        ctx.fillText(labelText, sx, sy);
      }
      ctx.restore();
    }

    // 3. Arterial Street Labels & Route Badges (US-101, I-280, I-80)
    const maxRoadDist = isVector ? 3400 : 1650;
    const maxRoadDistSq = maxRoadDist * maxRoadDist;
    for (let i = 0; i < this.roadLabels.length; i++) {
      const rl = this.roadLabels[i];
      if (!isVector && rl.cls > 1) continue;
      if (rl.cls === 3 && cy > 950) continue;
      if (rl.cls === 2 && cy > 1800) continue;

      const dx = rl.x - cx;
      const dy = rl.y - cy;
      const dz = rl.z - cz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > maxRoadDistSq || dSq < 3600) continue;

      this.projVec.set(rl.x, rl.y, rl.z).project(camera);
      if (this.projVec.z > 1 || this.projVec.z < -1) continue;

      const sx = (this.projVec.x * 0.5 + 0.5) * w;
      const sy = (-this.projVec.y * 0.5 + 0.5) * h;

      if (rl.cls === 0 && rl.ref) {
        const refClean = this.roadRefClean[i];
        const rw = this.roadRefWidths[i] || 32;
        const rh = 17;
        const bbox: BBox = {
          x0: sx - rw * 0.5 - 4,
          y0: sy - rh * 0.5 - 4,
          x1: sx + rw * 0.5 + 4,
          y1: sy + rh * 0.5 + 4,
        };
        if (overlaps(bbox)) continue;
        occupied.push(bbox);

        ctx.save();
        ctx.font = '600 9.5px ui-monospace, "SF Mono", Menlo, monospace';
        ctx.fillStyle = 'rgba(18, 19, 24, 0.88)';
        ctx.strokeStyle = 'rgba(236, 229, 216, 0.32)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(sx - rw * 0.5, sy - rh * 0.5, rw, rh, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e5dfd3';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(refClean, sx, sy + 0.5);
        ctx.restore();
        continue;
      }

      const stepX = Math.cos(rl.angle) * 20;
      const stepZ = Math.sin(rl.angle) * 20;
      this.projVec2.set(rl.x + stepX, rl.y, rl.z + stepZ).project(camera);
      const sx2 = (this.projVec2.x * 0.5 + 0.5) * w;
      const sy2 = (-this.projVec2.y * 0.5 + 0.5) * h;
      let screenAngle = Math.atan2(sy2 - sy, sx2 - sx);
      if (screenAngle > Math.PI / 2) screenAngle -= Math.PI;
      if (screenAngle < -Math.PI / 2) screenAngle += Math.PI;

      const tw = this.roadNameWidths[i] || 56;
      const pad = tw * 0.5 + 6;
      const bbox: BBox = {
        x0: sx - pad,
        y0: sy - 12,
        x1: sx + pad,
        y1: sy + 12,
      };
      if (overlaps(bbox)) continue;
      occupied.push(bbox);

      ctx.save();
      ctx.font = '500 10px ui-sans-serif, system-ui, -apple-system, "SF Pro Text", sans-serif';
      ctx.translate(sx, sy);
      ctx.rotate(screenAngle);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = isVector ? 'rgba(247, 244, 238, 0.9)' : 'rgba(11, 12, 15, 0.82)';
      ctx.lineWidth = 2.5;
      ctx.strokeText(rl.name, 0, 0);
      ctx.fillStyle = isVector ? '#3a3936' : 'rgba(236, 229, 216, 0.82)';
      ctx.fillText(rl.name, 0, 0);
      ctx.restore();
    }
  }
}
