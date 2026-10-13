// Camera Controllers for SF 3D:
// 1. OrbitFlyController: Responsive WASD + Arrow keys free-flight & exploration, mouse look/orbit/pan/zoom, speed boost (Shift), Q/E/Space vertical flight, and bridge-deck-aware surface clamping
// 2. WalkController ('F' key): First-person walk on terrain AND across the Golden Gate Bridge & Bay Bridge decks (eye height 1.7m, slope-aware speed)
// 3. CinematicTour ('C' key): 90-second 12-shot hero path across San Francisco

import * as THREE from 'three';
import { enuToLatLon, latLonToENU } from '../world/coords';

export type RenderMode = 'satellite' | 'vector';
export type ControlMode = 'fly' | 'walk' | 'cinematic';

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  headingDeg: number; // 0 = North (-Z), 90 = East (+X), 180 = South (+Z), 270 = West (-X)
  pitchDeg: number;   // -89 (straight down) to +85 (looking up)
}

export interface CinematicShot {
  title: string;
  subtitle: string;
  startPos: [number, number, number];
  endPos: [number, number, number];
  lookAtStart: [number, number, number];
  lookAtEnd: [number, number, number];
  durationSec: number;
}

export class CameraSystem {
  public camera: THREE.PerspectiveCamera;
  public controlMode: ControlMode = 'fly';

  // Start with a cinematic aerial view over the Embarcadero & Bay looking across
  // Salesforce Tower, Transamerica Pyramid, Coit Tower, and the dense 3D San Francisco skyline!
  public pose: CameraPose = {
    x: 2450,
    y: 260,
    z: -1150,
    headingDeg: 282,
    pitchDeg: -17,
  };

  private targetPose: CameraPose = { ...this.pose };
  private activeCodes = new Set<string>();
  public moveSpeedMultiplier = 1.0;

  // Post-drag flick-glide velocity (ported from jeantimex/tokyo/src/main.js)
  private glideVelX = 0;
  private glideVelZ = 0;
  private lastMoveSamples: { dx: number; dz: number; t: number }[] = [];

  private isDraggingLeft = false;
  private isDraggingRight = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private touchDist = 0;

  private flyAnim: {
    active: boolean;
    startTime: number;
    durationMs: number;
    from: CameraPose;
    to: CameraPose;
  } | null = null;

  private cinematicActive = false;
  private cinematicTime = 0;
  public currentShotTitle = '';
  public currentShotSubtitle = '';
  public currentSlopePct = 0;

  private shots: CinematicShot[] = [];
  private sampleGroundHeight: (x: number, z: number) => number;
  private onUserTakeover?: () => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    sampleGroundHeight: (x: number, z: number) => number,
    onUserTakeover?: () => void
  ) {
    this.camera = camera;
    this.sampleGroundHeight = sampleGroundHeight;
    this.onUserTakeover = onUserTakeover;
    this.buildCinematicShots();
    this.bindEvents(domElement);
    this.applyPoseToCamera();
  }

  public isKeyActive(action: 'w' | 'a' | 's' | 'd' | 'up' | 'down' | 'boost'): boolean {
    switch (action) {
      case 'w':
        return this.activeCodes.has('KeyW') || this.activeCodes.has('ArrowUp');
      case 's':
        return this.activeCodes.has('KeyS') || this.activeCodes.has('ArrowDown');
      case 'a':
        return this.activeCodes.has('KeyA') || this.activeCodes.has('ArrowLeft');
      case 'd':
        return this.activeCodes.has('KeyD') || this.activeCodes.has('ArrowRight');
      case 'up':
        return this.activeCodes.has('KeyE') || this.activeCodes.has('Space');
      case 'down':
        return this.activeCodes.has('KeyQ');
      case 'boost':
        return this.activeCodes.has('ShiftLeft') || this.activeCodes.has('ShiftRight');
    }
  }

  public setVirtualKey(code: string, pressed: boolean) {
    if (pressed) {
      this.interruptCinematic();
      this.activeCodes.add(code);
    } else {
      this.activeCodes.delete(code);
    }
  }

  private isAnyMoveKeyHeld(): boolean {
    return (
      this.isKeyActive('w') ||
      this.isKeyActive('a') ||
      this.isKeyActive('s') ||
      this.isKeyActive('d') ||
      this.isKeyActive('up') ||
      this.isKeyActive('down')
    );
  }

  private buildCinematicShots() {
    const p = (lat: number, lon: number, alt: number): [number, number, number] => {
      const enu = latLonToENU(lat, lon, alt);
      return [enu.x, enu.y, enu.z];
    };

    this.shots = [
      {
        title: '1 / 12 — Golden Gate Bridge from Marin Headlands',
        subtitle: 'Hawk Hill & Battery Spencer overlooking the 1,280 m International Orange span',
        startPos: p(37.8275, -122.4860, 235),
        endPos: p(37.8155, -122.4730, 145),
        lookAtStart: p(37.8199, -122.4783, 95),
        lookAtEnd: p(37.8199, -122.4783, 80),
        durationSec: 7.5,
      },
      {
        title: '2 / 12 — Palace of Fine Arts & Marina',
        subtitle: '1915 Greco-Roman Rotunda, Corinthian Colonnade & Reflecting Lagoon',
        startPos: p(37.8042, -122.4448, 82),
        endPos: p(37.8018, -122.4452, 58),
        lookAtStart: p(37.8029, -122.4484, 24),
        lookAtEnd: p(37.8029, -122.4484, 28),
        durationSec: 7.5,
      },
      {
        title: '3 / 12 — Lombard Street Crooked Block',
        subtitle: 'Eight hairpin brick switchbacks descending Russian Hill’s 27% grade',
        startPos: p(37.8025, -122.4163, 98),
        endPos: p(37.8017, -122.4168, 78),
        lookAtStart: p(37.8021, -122.4189, 58),
        lookAtEnd: p(37.8020, -122.4195, 68),
        durationSec: 7.5,
      },
      {
        title: '4 / 12 — Coit Tower & Telegraph Hill',
        subtitle: '1933 Art Deco fluted belvedere column rising above North Beach',
        startPos: p(37.8045, -122.4025, 165),
        endPos: p(37.8008, -122.4022, 145),
        lookAtStart: p(37.8024, -122.4058, 95),
        lookAtEnd: p(37.8024, -122.4058, 88),
        durationSec: 7.5,
      },
      {
        title: '5 / 12 — Transamerica Pyramid & Financial District',
        subtitle: '260 m quartz-aggregate pyramid and Montgomery Street canyon',
        startPos: p(37.7988, -122.3982, 275),
        endPos: p(37.7928, -122.3978, 255),
        lookAtStart: p(37.7952, -122.4028, 150),
        lookAtEnd: p(37.7952, -122.4028, 165),
        durationSec: 7.5,
      },
      {
        title: '6 / 12 — Salesforce Tower & SoMa Skyline',
        subtitle: '326 m glass obelisk with illuminated night LED crown',
        startPos: p(37.7860, -122.3915, 340),
        endPos: p(37.7925, -122.3910, 310),
        lookAtStart: p(37.7897, -122.3969, 210),
        lookAtEnd: p(37.7897, -122.3969, 190),
        durationSec: 7.5,
      },
      {
        title: '7 / 12 — San Francisco–Oakland Bay Bridge',
        subtitle: 'Twin West Suspension Spans, Yerba Buena Island & East SAS Tower',
        startPos: p(37.7915, -122.3855, 220),
        endPos: p(37.8015, -122.3735, 210),
        lookAtStart: p(37.7983, -122.3778, 85),
        lookAtEnd: p(37.8125, -122.3620, 75),
        durationSec: 7.5,
      },
      {
        title: '8 / 12 — Ferry Building & The Embarcadero',
        subtitle: '1898 Beaux-Arts terminal & 245 ft clock tower on the waterfront',
        startPos: p(37.7975, -122.3895, 115),
        endPos: p(37.7938, -122.3902, 95),
        lookAtStart: p(37.7955, -122.3937, 38),
        lookAtEnd: p(37.7955, -122.3937, 32),
        durationSec: 7.5,
      },
      {
        title: '9 / 12 — Oracle Park & McCovey Cove',
        subtitle: 'Waterfront brick ballpark at China Basin & Mission Bay',
        startPos: p(37.7755, -122.3845, 145),
        endPos: p(37.7805, -122.3848, 125),
        lookAtStart: p(37.7786, -122.3893, 25),
        lookAtEnd: p(37.7786, -122.3893, 20),
        durationSec: 7.5,
      },
      {
        title: '10 / 12 — Twin Peaks Lookout',
        subtitle: '280 m Christmas Tree Point vista straight down Market Street',
        startPos: p(37.7525, -122.4495, 345),
        endPos: p(37.7565, -122.4455, 325),
        lookAtStart: p(37.7793, -122.4193, 110),
        lookAtEnd: p(37.7897, -122.3969, 140),
        durationSec: 7.5,
      },
      {
        title: '11 / 12 — Sutro Tower & Mount Sutro',
        subtitle: '298 m three-legged red-and-white broadcast tower piercing Karl the Fog',
        startPos: p(37.7515, -122.4475, 435),
        endPos: p(37.7582, -122.4478, 415),
        lookAtStart: p(37.7552, -122.4528, 340),
        lookAtEnd: p(37.7552, -122.4528, 320),
        durationSec: 7.5,
      },
      {
        title: '12 / 12 — Ocean Beach to Alcatraz Island',
        subtitle: 'Historic Cellhouse & 1854 Lighthouse in the center of San Francisco Bay',
        startPos: p(37.8225, -122.4285, 155),
        endPos: p(37.8295, -122.4175, 135),
        lookAtStart: p(37.8267, -122.4230, 35),
        lookAtEnd: p(37.8267, -122.4230, 28),
        durationSec: 7.5,
      },
    ];
  }

  private bindEvents(el: HTMLElement) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('#hud-root')) return;
      // Ensure any focused input/button releases focus so WASD works immediately
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      this.interruptCinematic();
      if (e.button === 0) this.isDraggingLeft = true;
      if (e.button === 2 || e.button === 1) this.isDraggingRight = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDraggingLeft && !this.isDraggingRight) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // In Walk mode, Right-click drag, Shift/Ctrl drag, OR while holding WASD keys:
      // dragging the mouse steers/looks around smoothly!
      if (
        this.controlMode === 'walk' ||
        this.isDraggingRight ||
        e.shiftKey ||
        e.ctrlKey ||
        this.isAnyMoveKeyHeld()
      ) {
        this.targetPose.headingDeg = (this.targetPose.headingDeg + dx * 0.24 + 360) % 360;
        this.targetPose.pitchDeg = Math.max(-85, Math.min(75, this.targetPose.pitchDeg - dy * 0.22));
        return;
      }

      if (this.isDraggingLeft) {
        // Left-drag without WASD: pan across ground proportional to altitude + record flick-glide samples (jeantimex/tokyo)
        const groundY = Math.max(0, this.sampleGroundHeight(this.pose.x, this.pose.z));
        const agl = Math.max(15, this.pose.y - groundY);
        const panSpeed = agl * 0.0018;
        const rad = (this.pose.headingDeg * Math.PI) / 180;
        const rightX = Math.cos(rad);
        const rightZ = Math.sin(rad);
        const fwdX = Math.sin(rad);
        const fwdZ = -Math.cos(rad);

        const moveX = -(rightX * dx - fwdX * dy) * panSpeed;
        const moveZ = -(rightZ * dx - fwdZ * dy) * panSpeed;
        this.targetPose.x += moveX;
        this.targetPose.z += moveZ;

        const now = performance.now();
        this.lastMoveSamples.push({ dx: moveX, dz: moveZ, t: now });
        while (this.lastMoveSamples.length > 0 && now - this.lastMoveSamples[0].t > 100) {
          this.lastMoveSamples.shift();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDraggingLeft && this.lastMoveSamples.length >= 2) {
        const first = this.lastMoveSamples[0];
        const last = this.lastMoveSamples[this.lastMoveSamples.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0.008 && performance.now() - last.t < 80) {
          let sumX = 0;
          let sumZ = 0;
          for (const s of this.lastMoveSamples) {
            sumX += s.dx;
            sumZ += s.dz;
          }
          this.glideVelX = (sumX / dt) * 0.55;
          this.glideVelZ = (sumZ / dt) * 0.55;
        }
      }
      this.lastMoveSamples.length = 0;
      this.isDraggingLeft = false;
      this.isDraggingRight = false;
    });

    el.addEventListener(
      'wheel',
      (e) => {
        if ((e.target as HTMLElement).closest('#hud-root')) return;
        e.preventDefault();
        this.interruptCinematic();
        if (this.controlMode === 'walk') return;

        // Cursor-targeted wheel zoom (ported from jeantimex/tokyo/src/main.js)
        const rect = el.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

        const groundY = Math.max(0, this.sampleGroundHeight(this.pose.x, this.pose.z));
        const agl = Math.max(2.0, this.targetPose.y - groundY);
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 32;
        if (e.deltaMode === 2) delta *= 300;

        const zoomFactor = Math.pow(0.9988, -delta);
        const newAgl = Math.max(2.2, Math.min(52000, agl * zoomFactor));
        const scaleChange = 1 - newAgl / agl;

        if (raycaster.ray.direction.y < -0.02) {
          const t = (groundY - raycaster.ray.origin.y) / raycaster.ray.direction.y;
          if (t > 0 && t < 45000) {
            const hitX = raycaster.ray.origin.x + raycaster.ray.direction.x * t;
            const hitZ = raycaster.ray.origin.z + raycaster.ray.direction.z * t;
            this.targetPose.x += (hitX - this.targetPose.x) * scaleChange * 0.72;
            this.targetPose.z += (hitZ - this.targetPose.z) * scaleChange * 0.72;
          }
        }
        this.targetPose.y = groundY + newAgl;
      },
      { passive: false }
    );

    // Touch controls
    el.addEventListener(
      'touchstart',
      (e) => {
        if ((e.target as HTMLElement).closest('#hud-root')) return;
        this.interruptCinematic();
        if (e.touches.length === 1) {
          this.isDraggingLeft = true;
          this.lastMouseX = e.touches[0].clientX;
          this.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          this.isDraggingLeft = false;
          this.touchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      },
      { passive: true }
    );

    el.addEventListener(
      'touchmove',
      (e) => {
        if ((e.target as HTMLElement).closest('#hud-root')) return;
        if (e.touches.length === 1 && this.isDraggingLeft) {
          const dx = e.touches[0].clientX - this.lastMouseX;
          const dy = e.touches[0].clientY - this.lastMouseY;
          this.lastMouseX = e.touches[0].clientX;
          this.lastMouseY = e.touches[0].clientY;
          this.targetPose.headingDeg = (this.targetPose.headingDeg - dx * 0.25 + 360) % 360;
          this.targetPose.pitchDeg = Math.max(-85, Math.min(60, this.targetPose.pitchDeg - dy * 0.2));
        } else if (e.touches.length === 2) {
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const delta = this.touchDist - dist;
          this.touchDist = dist;
          const groundY = Math.max(0, this.sampleGroundHeight(this.pose.x, this.pose.z));
          const agl = Math.max(2, this.targetPose.y - groundY);
          this.targetPose.y = Math.max(groundY + 2.2, Math.min(52000, this.targetPose.y + delta * agl * 0.006));
        }
      },
      { passive: true }
    );

    el.addEventListener('touchend', () => {
      this.isDraggingLeft = false;
    });

    // Physical key.code tracking so Shift+W, CapsLock, and multi-key combos never stick!
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const code = e.code;

      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'KeyQ' ||
        code === 'KeyE' ||
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        e.preventDefault();
        this.interruptCinematic();
      }

      this.activeCodes.add(code);
    });

    window.addEventListener('keyup', (e) => {
      this.activeCodes.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.activeCodes.clear();
    });
  }

  public interruptCinematic() {
    if (this.cinematicActive) {
      this.cinematicActive = false;
      this.controlMode = 'fly';
      this.currentShotTitle = '';
      this.currentShotSubtitle = '';
      this.targetPose = { ...this.pose };
      this.onUserTakeover?.();
    }
    if (this.flyAnim) {
      this.flyAnim = null;
    }
  }

  public toggleWalkMode(): ControlMode {
    this.interruptCinematic();
    if (this.controlMode === 'walk') {
      this.controlMode = 'fly';
      const gY = Math.max(0.5, this.sampleGroundHeight(this.pose.x, this.pose.z));
      this.targetPose.y = gY + 65;
      this.targetPose.pitchDeg = -18;
    } else {
      this.controlMode = 'walk';
      const gY = Math.max(0.5, this.sampleGroundHeight(this.pose.x, this.pose.z));
      this.pose.y = gY + 1.7;
      this.targetPose.y = gY + 1.7;
      this.pose.pitchDeg = -2;
      this.targetPose.pitchDeg = -2;
    }
    return this.controlMode;
  }

  public toggleCinematicTour(): boolean {
    if (this.cinematicActive) {
      this.interruptCinematic();
      return false;
    }
    this.flyAnim = null;
    this.cinematicActive = true;
    this.cinematicTime = 0;
    this.controlMode = 'cinematic';
    return true;
  }

  public isCinematic(): boolean {
    return this.cinematicActive;
  }

  public flyTo(to: CameraPose, durationMs = 2000) {
    this.interruptCinematic();
    this.controlMode = 'fly';
    this.flyAnim = {
      active: true,
      startTime: performance.now(),
      durationMs,
      from: { ...this.pose },
      to: { ...to },
    };
  }

  public setPoseImmediate(p: Partial<CameraPose>) {
    this.pose = { ...this.pose, ...p };
    this.targetPose = { ...this.pose };
    this.applyPoseToCamera();
  }

  public update(dt: number) {
    const clampedDt = Math.min(0.1, dt);

    // 1. Cinematic 90-second auto-tour across 12 SF hero shots
    if (this.cinematicActive) {
      this.cinematicTime = (this.cinematicTime + clampedDt) % 90.0;
      const shotIdx = Math.min(11, Math.floor(this.cinematicTime / 7.5));
      const shot = this.shots[shotIdx];
      const localT = (this.cinematicTime - shotIdx * 7.5) / shot.durationSec;
      const ease = localT * localT * (3 - 2 * localT);

      this.currentShotTitle = shot.title;
      this.currentShotSubtitle = shot.subtitle;

      const cx = shot.startPos[0] + (shot.endPos[0] - shot.startPos[0]) * ease;
      const cy = shot.startPos[1] + (shot.endPos[1] - shot.startPos[1]) * ease;
      const cz = shot.startPos[2] + (shot.endPos[2] - shot.startPos[2]) * ease;

      const lx = shot.lookAtStart[0] + (shot.lookAtEnd[0] - shot.lookAtStart[0]) * ease;
      const ly = shot.lookAtStart[1] + (shot.lookAtEnd[1] - shot.lookAtStart[1]) * ease;
      const lz = shot.lookAtStart[2] + (shot.lookAtEnd[2] - shot.lookAtStart[2]) * ease;

      const gY = Math.max(0, this.sampleGroundHeight(cx, cz));
      this.pose.x = cx;
      this.pose.y = Math.max(gY + 5, cy);
      this.pose.z = cz;

      const dx = lx - this.pose.x;
      const dy = ly - this.pose.y;
      const dz = lz - this.pose.z;
      const horiz = Math.hypot(dx, dz) || 1;
      this.pose.headingDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      this.pose.pitchDeg = (Math.atan2(dy, horiz) * 180) / Math.PI;
      this.targetPose = { ...this.pose };
      this.applyPoseToCamera();
      return;
    }

    // 2. Smooth Fly-To animation
    if (this.flyAnim && this.flyAnim.active) {
      const now = performance.now();
      const rawT = Math.min(1, (now - this.flyAnim.startTime) / this.flyAnim.durationMs);
      const ease = 1 - Math.pow(1 - rawT, 3);

      const { from, to } = this.flyAnim;
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      const arcBoost = Math.sin(rawT * Math.PI) * Math.min(550, dist * 0.16);

      this.pose.x = from.x + (to.x - from.x) * ease;
      this.pose.z = from.z + (to.z - from.z) * ease;
      this.pose.y = from.y + (to.y - from.y) * ease + arcBoost;

      const dHead = ((to.headingDeg - from.headingDeg + 540) % 360) - 180;
      this.pose.headingDeg = (from.headingDeg + dHead * ease + 360) % 360;
      this.pose.pitchDeg = from.pitchDeg + (to.pitchDeg - from.pitchDeg) * ease;

      const gY = Math.max(0, this.sampleGroundHeight(this.pose.x, this.pose.z));
      if (this.pose.y < gY + 2.2) this.pose.y = gY + 2.2;

      this.targetPose = { ...this.pose };
      if (rawT >= 1) {
        this.flyAnim = null;
      }
      this.applyPoseToCamera();
      return;
    }

    // 3. Responsive WASD + Arrow Exploration
    const rad = (this.pose.headingDeg * Math.PI) / 180;
    const pitchRad = (this.pose.pitchDeg * Math.PI) / 180;
    const fwdX = Math.sin(rad);
    const fwdZ = -Math.cos(rad);
    const rightX = Math.cos(rad);
    const rightZ = Math.sin(rad);

    let moveFwd = 0;
    let moveRight = 0;
    let moveUp = 0;

    if (this.isKeyActive('w')) moveFwd += 1;
    if (this.isKeyActive('s')) moveFwd -= 1;
    if (this.isKeyActive('d')) moveRight += 1;
    if (this.isKeyActive('a')) moveRight -= 1;
    if (this.isKeyActive('up')) moveUp += 1;
    if (this.isKeyActive('down')) moveUp -= 1;

    // Normalize diagonal WASD movement
    if (moveFwd !== 0 && moveRight !== 0) {
      moveFwd *= 0.7071;
      moveRight *= 0.7071;
    }

    const groundHere = Math.max(0.2, this.sampleGroundHeight(this.pose.x, this.pose.z));

    if (this.controlMode === 'walk') {
      // First-person walk mode on terrain OR across Golden Gate Bridge / Bay Bridge road decks!
      const baseWalkSpeed = (this.isKeyActive('boost') ? 16.0 : 7.0) * this.moveSpeedMultiplier;
      const stepX = (fwdX * moveFwd + rightX * moveRight) * baseWalkSpeed * clampedDt;
      const stepZ = (fwdZ * moveFwd + rightZ * moveRight) * baseWalkSpeed * clampedDt;
      const stepDist = Math.hypot(stepX, stepZ);

      if (stepDist > 0.001) {
        const nextGround = Math.max(
          0.2,
          this.sampleGroundHeight(this.targetPose.x + stepX, this.targetPose.z + stepZ)
        );
        const dElev = nextGround - groundHere;
        const slopeRatio = dElev / Math.max(0.05, stepDist);
        this.currentSlopePct = Math.round(slopeRatio * 100);
        const slopeFactor =
          slopeRatio > 0
            ? Math.max(0.35, 1.0 - slopeRatio * 1.7)
            : Math.min(1.25, 1.0 - slopeRatio * 0.35);
        this.targetPose.x += stepX * slopeFactor;
        this.targetPose.z += stepZ * slopeFactor;
      } else {
        this.currentSlopePct = 0;
      }

      const newGround = Math.max(0.2, this.sampleGroundHeight(this.targetPose.x, this.targetPose.z));
      this.targetPose.y = newGround + 1.7;
    } else {
      // Free-Flight Exploration Mode with WASD:
      // Speed scales smoothly with height above ground + Shift turbo boost
      const agl = Math.max(6, this.pose.y - groundHere);
      const boost = this.isKeyActive('boost') ? 2.8 : 1.0;
      const flySpeed =
        Math.max(55, Math.min(3600, 35 + agl * 1.45)) * boost * this.moveSpeedMultiplier;

      this.targetPose.x += (fwdX * moveFwd + rightX * moveRight) * flySpeed * clampedDt;
      this.targetPose.z += (fwdZ * moveFwd + rightZ * moveRight) * flySpeed * clampedDt;

      // Vertical flight via Q/E/Space, plus slight pitch-follow when diving or climbing steep
      const pitchVertical =
        Math.abs(this.pose.pitchDeg) > 26 ? Math.sin(pitchRad) * moveFwd * 0.45 : 0;
      this.targetPose.y += (moveUp * 0.75 + pitchVertical) * flySpeed * clampedDt;

      // Apply post-drag flick-glide inertia (jeantimex/tokyo)
      if (!this.isDraggingLeft && (Math.abs(this.glideVelX) > 0.2 || Math.abs(this.glideVelZ) > 0.2)) {
        if (moveFwd !== 0 || moveRight !== 0) {
          this.glideVelX = 0;
          this.glideVelZ = 0;
        } else {
          this.targetPose.x += this.glideVelX * clampedDt;
          this.targetPose.z += this.glideVelZ * clampedDt;
          const glideDecay = Math.exp(-3.4 * clampedDt);
          this.glideVelX *= glideDecay;
          this.glideVelZ *= glideDecay;
        }
      }
    }

    // Smooth exponential damping for responsive feel
    const damp = 1 - Math.exp(-16 * clampedDt);
    this.pose.x += (this.targetPose.x - this.pose.x) * damp;
    this.pose.z += (this.targetPose.z - this.pose.z) * damp;
    this.pose.y += (this.targetPose.y - this.pose.y) * damp;

    const dHead = ((this.targetPose.headingDeg - this.pose.headingDeg + 540) % 360) - 180;
    this.pose.headingDeg = (this.pose.headingDeg + dHead * damp + 360) % 360;
    this.pose.pitchDeg += (this.targetPose.pitchDeg - this.pose.pitchDeg) * damp;

    // Clamp so camera never goes underground or below bridge decks / sea level
    const minGroundY = Math.max(0.2, this.sampleGroundHeight(this.pose.x, this.pose.z));
    const minClearance = this.controlMode === 'walk' ? 1.7 : 2.5;
    if (this.pose.y < minGroundY + minClearance) {
      this.pose.y = minGroundY + minClearance;
      this.targetPose.y = Math.max(this.targetPose.y, this.pose.y);
    }
    if (this.pose.y > 52000) {
      this.pose.y = 52000;
      this.targetPose.y = 52000;
    }

    this.applyPoseToCamera();
  }

  private applyPoseToCamera() {
    this.camera.position.set(this.pose.x, this.pose.y, this.pose.z);

    const headRad = (this.pose.headingDeg * Math.PI) / 180;
    const pitchRad = (this.pose.pitchDeg * Math.PI) / 180;

    const cosP = Math.cos(pitchRad);
    const lookX = this.pose.x + Math.sin(headRad) * cosP * 100;
    const lookY = this.pose.y + Math.sin(pitchRad) * 100;
    const lookZ = this.pose.z - Math.cos(headRad) * cosP * 100;

    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  public serializeHash(mode: RenderMode): string {
    const { lat, lon } = enuToLatLon(this.pose.x, this.pose.z);
    const alt = Math.round(this.pose.y);
    const h = Math.round(this.pose.headingDeg);
    const p = Math.round(this.pose.pitchDeg);
    return `#${lat.toFixed(4)},${lon.toFixed(4)},${alt},${h},${p},${mode}`;
  }

  public parseHash(hash: string): { mode?: RenderMode } | null {
    const clean = hash.replace(/^#/, '').trim();
    if (!clean) return null;
    const parts = clean.split(',');
    if (parts.length < 5) return null;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    const alt = parseFloat(parts[2]);
    const headingDeg = parseFloat(parts[3]);
    const pitchDeg = parseFloat(parts[4]);
    const modeStr = parts[5]?.trim().toLowerCase();

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(alt) ||
      !Number.isFinite(headingDeg) ||
      !Number.isFinite(pitchDeg)
    ) {
      return null;
    }

    const enu = latLonToENU(lat, lon, alt);
    this.setPoseImmediate({
      x: enu.x,
      y: Math.max(2, alt),
      z: enu.z,
      headingDeg: ((headingDeg % 360) + 360) % 360,
      pitchDeg: Math.max(-88, Math.min(75, pitchDeg)),
    });

    if (modeStr === 'satellite' || modeStr === 'vector') {
      return { mode: modeStr };
    }
    return {};
  }
}
