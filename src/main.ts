// SF 3D — Main Application Bootstrap
// Real-time 3D San Francisco Explorer powered by jeantimex/tokyo rendering & shaders:
// - @takram/three-atmosphere + @takram/three-clouds 3D volumetric clouds & physical sky
// - Planar WaterMirror + WindowReflections + multi-wave ripple() & cloudAbove() water shader
// - 176,777 procedural 3D SF buildings meshed via Web Workers (BuildingMesher.ts) with 6-layer DataArrayTexture,
//   3D interior-mapped windows, recessed window jambs, pitched roofs, parapets, balconies & rooftop equipment
// - Dedicated 3D architectural models in src/models/* (Golden Gate Bridge, Bay Bridge, Universities, SF Landmarks)
// - Progressive startup loader + cross-platform Windows/macOS DPI & adaptive frame-rate governor

import * as THREE from 'three';
import { CameraSystem, type RenderMode } from './camera/CameraSystem';
import { AtmosphereSky } from './sky/AtmosphereSky';
import { installSkyLight } from './world/environment';
import { buildTexturesSync } from './world/textures';
import { createMaterials, variant } from './world/materials';
import { WaterMirror } from './world/mirror';
import { TerrainAndWater } from './world/TerrainAndWater';
import { BuildingsLayer } from './buildings/BuildingsLayer';
import { RoadsAndLanduseLayer } from './world/RoadsAndLanduseLayer';
import { HeroLandmarks } from './world/HeroLandmarks';
import { BirdsLayer } from './world/BirdsLayer';
import { LabelsOverlay } from './world/LabelsOverlay';
import { HUD } from './app/HUD';

installSkyLight();

/**
 * Computes an optimal devicePixelRatio across Windows (DirectX/ANGLE) and macOS (Retina/Metal)
 * by capping the total physical framebuffer budget to ~3.68M pixels (2560x1440 equivalent).
 */
function getOptimalPixelRatio(qualityScale = 1.0): number {
  const rawDpr = window.devicePixelRatio || 1;
  const cssPixels = Math.max(1, window.innerWidth * window.innerHeight);
  const maxBudgetPixels = 2560000 * qualityScale; // ~2048x1250 physical pixel cap for smooth 60 FPS
  const budgetDpr = Math.sqrt(maxBudgetPixels / cssPixels);
  return Math.max(1.0, Math.min(rawDpr, budgetDpr, 1.5 * qualityScale));
}

class SF3DApp {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public mode: RenderMode = 'satellite';

  public materials: ReturnType<typeof createMaterials>;
  public waterMirror: WaterMirror;
  public cameraSys: CameraSystem;
  public sky: AtmosphereSky;
  public terrainWater: TerrainAndWater;
  public buildings: BuildingsLayer;
  public roadsLanduse: RoadsAndLanduseLayer;
  public heroLandmarks: HeroLandmarks;
  public birds: BirdsLayer;
  public labels: LabelsOverlay;
  public hud: HUD;

  private lastTime = performance.now();
  private elapsedSec = 0;
  private lastHashUpdate = 0;
  private isReady = false;
  public renderPaused = false;
  private emaFrameMs = 16.6;
  private qualityTier: 'high' | 'balanced' = 'high';
  private adaptiveCheckTimer = 0;

  constructor() {
    const container = document.getElementById('canvas-container')!;
    const labelCanvas = document.getElementById('label-canvas') as HTMLCanvasElement;
    const hudRoot = document.getElementById('hud-root')!;

    this.setLoadingUI(6, 'Initializing WebGL2 graphics pipeline…');

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      2.5,
      65000
    );

    const dpr = getOptimalPixelRatio(1.0);
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // Postprocessing SMAA handles antialiasing cleanly across Windows & macOS
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    // 1. Procedural 6-layer wall & 4-layer ground DataArrayTextures + jeantimex/tokyo materials
    this.setLoadingUI(14, 'Generating procedural PBR facade & ground textures…');
    const textures = buildTexturesSync(this.renderer);
    this.materials = createMaterials(textures);

    // 2. Planar WaterMirror for Bay & Golden Gate reflections
    this.waterMirror = new WaterMirror(this.renderer);

    // 3. Terrain & Water (using materials.terrain and materials.water)
    this.terrainWater = new TerrainAndWater(this.scene, {
      terrain: this.materials.terrain,
      water: this.materials.water,
    });

    // 4. Dedicated 3D Bridges, Universities & Landmarks (src/models/*)
    this.heroLandmarks = new HeroLandmarks((x, z) =>
      this.terrainWater.sampleGroundHeight(x, z)
    );

    // 5. Free Orbit / Pan / Zoom / WASD / Walk / Cinematic Tour Camera
    this.cameraSys = new CameraSystem(
      this.camera,
      this.renderer.domElement,
      (x, z) =>
        Math.max(
          this.terrainWater.sampleGroundHeight(x, z),
          this.heroLandmarks.sampleBridgeDeckHeight(x, z)
        ),
      () => this.hud?.update()
    );

    // 6. jeantimex/tokyo Atmosphere (@takram/three-clouds + @takram/three-atmosphere + N8AO + WindowReflections)
    this.sky = new AtmosphereSky(this.scene, this.renderer, this.camera);

    // 7. Roads, Parks, Piers, Cable Cars, Street Lamps & 47,896 Instanced Trees
    this.roadsLanduse = new RoadsAndLanduseLayer((x, z) =>
      this.terrainWater.sampleGroundHeight(x, z)
    );
    this.scene.add(this.roadsLanduse.group);

    // 8. 176,777 SF 3D Buildings (streamed via Web Workers + materials.facade)
    this.buildings = new BuildingsLayer(this.scene, this.materials.facade);

    this.scene.add(this.heroLandmarks.group);

    // 9. GPU-instanced flocking birds
    this.birds = new BirdsLayer(this.scene);

    // 10. Decluttered 2D Canvas Labels & HUD
    this.labels = new LabelsOverlay(labelCanvas, (lm) => {
      this.hud.flyToLandmark(lm);
    });
    this.labels.resize(
      window.innerWidth,
      window.innerHeight,
      Math.min(window.devicePixelRatio || 1, 2)
    );

    this.hud = new HUD(
      hudRoot,
      this.cameraSys,
      this.sky,
      () => this.mode,
      (m) => this.setMode(m),
      (x, z) => this.labels.getNearestNeighborhood(x, z)
    );

    if (window.location.hash) {
      const parsed = this.cameraSys.parseHash(window.location.hash);
      if (parsed?.mode) {
        this.mode = parsed.mode;
      }
    }

    this.bindGlobalKeys();
    window.addEventListener('resize', () => this.onResize());

    this.initAsync();
    requestAnimationFrame((t) => this.animate(t));
  }

  private setLoadingUI(pct: number, stageText?: string): void {
    const fill = document.getElementById('loading-bar-fill');
    const pctEl = document.getElementById('loading-pct-text');
    const stageEl = document.getElementById('loading-stage-text');
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (fill) fill.style.width = `${clamped}%`;
    if (pctEl) pctEl.textContent = `${clamped}%`;
    if (stageText && stageEl) stageEl.textContent = stageText;
  }

  private dismissLoadingUI(): void {
    this.setLoadingUI(100, 'Ready. Welcome to San Francisco');
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('loaded');
    }
  }

  private async initAsync() {
    try {
      // Stage 0: Wait for physical atmosphere LUTs & 3D cloud textures before any scene rendering
      this.setLoadingUI(18, 'Precomputing physical atmosphere & volumetric cloud LUTs…');
      await this.sky.atmosphere.readyPromise;

      // Stage 1: Core DEM Terrain & Bay Water
      this.setLoadingUI(28, 'Loading USGS elevation terrain & San Francisco Bay…');
      await this.terrainWater.load(this.renderer);
      this.buildings.setOrthoTexture(this.terrainWater.getOrthoTexture());

      // Stage 2: Bridges & Hero Landmarks + Primary Roads + Nearest Building Cells
      this.setLoadingUI(42, 'Constructing Golden Gate Bridge, Bay Bridge & skyline…');
      await this.heroLandmarks.load();

      this.setLoadingUI(58, 'Loading primary highways, piers & cable cars…');
      await this.roadsLanduse.load((stageLabel, frac) => {
        this.setLoadingUI(58 + frac * 16, stageLabel);
      });

      this.setLoadingUI(76, 'Streaming nearby 3D city blocks…');
      await this.buildings.loadManifest(
        this.camera.position.x,
        this.camera.position.z,
        (done, total) => {
          const frac = total > 0 ? done / total : 1;
          this.setLoadingUI(
            76 + frac * 16,
            `Meshing nearby city blocks (${done}/${total})…`
          );
        }
      );

      // Stage 3: Pre-compile shaders so first interactive frame is stutter-free
      this.setLoadingUI(95, 'Compiling shaders & atmosphere…');
      this.setMode(this.mode);
      this.scene.updateMatrixWorld();
      this.renderer.compile(this.scene, this.camera);
      this.stepFrame(0.016);

      // Non-blocking label catalog load
      void this.labels.load(this.heroLandmarks.landmarks).then(() => {
        this.hud.setSearchCatalog(this.heroLandmarks.landmarks, this.labels.neighborhoods);
      });
    } catch (err) {
      console.warn('Startup initialization warning:', err);
    } finally {
      this.isReady = true;
      this.dismissLoadingUI();
    }
  }

  public setMode(mode: RenderMode) {
    this.mode = mode;
    this.sky.setMode(mode);
    this.terrainWater.setMode(mode);
    this.buildings.setMode(mode);
    this.roadsLanduse.setMode(mode);
    this.heroLandmarks.setMode(mode);
    this.hud.syncModeUI(mode);
    this.syncHashNow();
  }

  public toggleMode() {
    this.setMode(this.mode === 'satellite' ? 'vector' : 'satellite');
  }

  private bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'm') {
        e.preventDefault();
        this.toggleMode();
      } else if (k === 'f') {
        e.preventDefault();
        this.cameraSys.toggleWalkMode();
        this.hud.update();
      } else if (k === 'c') {
        e.preventDefault();
        this.cameraSys.toggleCinematicTour();
        this.hud.update();
      } else if (k === 'l') {
        e.preventDefault();
        this.sky.cyclePreset();
        this.hud.syncLightingUI();
      } else if (k === 'n') {
        e.preventDefault();
        this.sky.setPreset(this.sky.preset === 'night' ? 'day' : 'night');
        this.hud.syncLightingUI();
      }
    });

    window.addEventListener('hashchange', () => {
      const parsed = this.cameraSys.parseHash(window.location.hash);
      if (parsed?.mode && parsed.mode !== this.mode) {
        this.setMode(parsed.mode);
      }
    });
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = getOptimalPixelRatio(this.qualityTier === 'high' ? 1.0 : 0.8);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.sky.setSize(w, h);
    this.labels.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  }

  private syncHashNow() {
    const hash = this.cameraSys.serializeHash(this.mode);
    window.history.replaceState(null, '', hash);
  }

  /**
   * Dynamically scales camera.near with altitude above ground so 24-bit depth buffer
   * precision stays rock-solid across 20+ km rendering distances without clipping close views.
   */
  private updateCameraDepthPlanes() {
    const groundY = Math.max(
      0,
      this.terrainWater.sampleGroundHeight(this.camera.position.x, this.camera.position.z)
    );
    const clearance = Math.max(2.0, this.camera.position.y - groundY);
    const targetNear = THREE.MathUtils.clamp(clearance * 0.14, 2.0, 22.0);
    if (Math.abs(this.camera.near - targetNear) > 0.35) {
      this.camera.near = targetNear;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Monitors real-time frame times on Windows & macOS browsers and automatically adjusts
   * volumetric cloud quality & DPI if an integrated GPU experiences sustained load.
   */
  private updateAdaptiveQuality(rawDtMs: number, dt: number) {
    if (!this.isReady || rawDtMs > 250) return;
    this.emaFrameMs = this.emaFrameMs * 0.94 + rawDtMs * 0.06;
    this.adaptiveCheckTimer += dt;
    if (this.adaptiveCheckTimer < 2.0) return;
    this.adaptiveCheckTimer = 0;

    if (this.qualityTier === 'high' && this.emaFrameMs > 23.0) {
      // Step down to balanced tier if FPS stays below ~43 FPS
      this.qualityTier = 'balanced';
      // The 'low' cloud preset drops shape detail and terminates rays early, which reads
      // as grainy, blocky clouds; trade resolution instead and keep the medium raymarch.
      this.sky.atmosphere.clouds.resolutionScale = 0.45;
      this.buildings.maxDrawDistance = 6800;
      this.buildings.shadowDistance = 1350;
      const dpr = getOptimalPixelRatio(0.8);
      this.renderer.setPixelRatio(dpr);
      this.sky.setSize(window.innerWidth, window.innerHeight);
    }
  }

  public stepFrame(dt: number) {
    this.elapsedSec += dt;

    this.renderer.info.reset();
    this.cameraSys.update(dt);
    this.updateCameraDepthPlanes();
    this.sky.update(dt, this.camera.position);

    this.terrainWater.update(
      dt,
      this.sky.sunDir,
      this.sky.sunColor,
      this.sky.skyHorizonColor,
      this.sky.skyZenithColor,
      this.sky.nightFactor
    );
    this.buildings.update(
      dt,
      this.sky.sunDir,
      this.sky.sunColor,
      this.sky.skyHorizonColor,
      this.sky.nightFactor,
      this.camera
    );
    this.roadsLanduse.update(dt, this.sky.nightFactor, this.camera.position);
    this.heroLandmarks.update(this.elapsedSec, this.sky.nightFactor, dt);
    this.birds.update(
      dt,
      this.camera.position,
      this.camera.position,
      (x, z) => this.terrainWater.sampleGroundHeight(x, z),
      this.sky.nightFactor
    );

    this.scene.updateMatrixWorld();

    this.waterMirror.enabled = this.sky.atmosphere.reflect && !variant.abstract;
    this.waterMirror.update(this.scene, this.camera, 0.0, [
      this.terrainWater.waterMesh,
      this.birds.mesh,
      this.roadsLanduse.detailGroup,
    ]);

    this.sky.render(dt);
    this.labels.render(this.camera, this.mode);
    this.hud.update();
  }

  private animate(now: number) {
    requestAnimationFrame((t) => this.animate(t));
    if (this.renderPaused || !this.isReady) {
      this.lastTime = now;
      return;
    }

    const rawDtMs = now - this.lastTime;
    const dt = Math.min(0.1, rawDtMs / 1000);
    this.lastTime = now;

    this.updateAdaptiveQuality(rawDtMs, dt);
    this.stepFrame(dt);

    if (now - this.lastHashUpdate > 600) {
      this.lastHashUpdate = now;
      this.syncHashNow();
    }
  }
}

const app = new SF3DApp();
(window as any).__SF3D__ = app;
