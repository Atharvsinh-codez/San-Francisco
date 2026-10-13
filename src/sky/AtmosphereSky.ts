// AtmosphereSky.ts — Physical Sky, Aerial Perspective & 3D Volumetric Clouds for SF 3D
// Powered by jeantimex/tokyo's Atmosphere (@takram/three-atmosphere + @takram/three-clouds)
// and Environment (SunDirectionalLight + SkyLightProbe + PMREM cubemap + N8AO + WindowReflections).

import * as THREE from 'three';
import { ORIGIN_LAT, ORIGIN_LON, WORLD_BOUNDS } from '../world/coords';
import { Atmosphere } from '../world/atmosphere';
import { Environment } from '../world/environment';
import { shared, variant } from '../world/materials';

export type WeatherPreset = 'day' | 'golden' | 'fog' | 'night';

export class AtmosphereSky {
  public readonly atmosphere: Atmosphere;
  public readonly env: Environment;

  public timeOfDay = 16.2; // Late-afternoon California sun: warm light and long, readable shadows
  public preset: WeatherPreset = 'day';
  public fogAmount = 0.008;
  public cloudCover = 0.22;

  public sunDirection = new THREE.Vector3(0.45, 0.78, 0.42).normalize();
  public sunColor = new THREE.Color(0xfffaf0);
  public skyHorizonColor = new THREE.Color(0xadc4dc);
  public skyZenithColor = new THREE.Color(0x2b559c);

  public night = 0.0;
  public nightFactor = 0.0;
  public dark = 0.0;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    private camera: THREE.PerspectiveCamera
  ) {
    // Ensure scene.background and scene.fog are null so @takram/three-atmosphere & @takram/three-clouds
    // render the physical sky, aerial perspective, and 3D volumetric cloud layer directly.
    this.scene.background = null;
    this.scene.fog = null;

    this.env = new Environment(this.scene, this.renderer);
    this.atmosphere = new Atmosphere(
      this.renderer,
      this.scene,
      this.camera,
      { lon: ORIGIN_LON, lat: ORIGIN_LAT },
      WORLD_BOUNDS
    );

    this.env.lightFromSky(
      this.atmosphere.textures,
      this.atmosphere.worldToECEF,
      this.atmosphere.environmentSky(),
      () => this.atmosphere.ready
    );

    this.atmosphere.cloudsOn = true;
    this.atmosphere.overCity = false;
    this.atmosphere.coverage = this.cloudCover;
    this.atmosphere.base = 1500;
    this.atmosphere.fog = this.fogAmount;

    this.setPreset('day');
  }

  private getSFDate(hour: number): Date {
    // June 21 (summer solstice week) in San Francisco (PDT = UTC - 7)
    const midnightPDT = Date.UTC(2025, 5, 21, 7, 0, 0);
    return new Date(midnightPDT + hour * 3600 * 1000);
  }

  public setPreset(preset: WeatherPreset): void {
    this.preset = preset;
    // Cloud base stays well above typical camera altitudes (100-700 m) so the volumetric layer
    // never sits between the camera and the bridges/city like a white wall.
    if (preset === 'day') {
      this.timeOfDay = 16.2;
      this.fogAmount = 0.008;
      this.cloudCover = 0.22;
      this.atmosphere.base = 1500;
    } else if (preset === 'golden') {
      this.timeOfDay = 19.65;
      this.fogAmount = 0.04;
      this.cloudCover = 0.28;
      this.atmosphere.base = 1600;
    } else if (preset === 'fog') {
      this.timeOfDay = 16.2;
      this.fogAmount = 0.38;
      this.cloudCover = 0.58;
      this.atmosphere.base = 250; // Low coastal marine layer ("Karl the Fog")
    } else if (preset === 'night') {
      this.timeOfDay = 22.0;
      this.fogAmount = 0.015;
      this.cloudCover = 0.18;
      this.atmosphere.base = 1700;
    }

    this.atmosphere.coverage = this.cloudCover;
    this.atmosphere.fog = this.fogAmount;
    this.syncSkyState();
  }

  public cyclePreset(): WeatherPreset {
    const order: WeatherPreset[] = ['day', 'golden', 'fog', 'night'];
    const next = order[(order.indexOf(this.preset) + 1) % order.length];
    this.setPreset(next);
    return next;
  }

  public setTimeOfDay(hours: number): void {
    this.timeOfDay = ((hours % 24) + 24) % 24;
    if (this.timeOfDay >= 20.3 || this.timeOfDay <= 5.6) {
      this.preset = 'night';
    } else if (this.timeOfDay >= 18.5 && this.timeOfDay < 20.3) {
      this.preset = 'golden';
    } else if (this.fogAmount > 0.25) {
      this.preset = 'fog';
    } else {
      this.preset = 'day';
    }
    this.syncSkyState();
  }

  public setMode(mode: 'satellite' | 'vector'): void {
    const cloudShadow = 0.58;
    const isAbstract = mode === 'vector';
    this.atmosphere.shade =
      Math.round((1 - cloudShadow) * (isAbstract ? 0.6 : 1) * 100) / 100;
  }

  public get sunDir(): THREE.Vector3 {
    return this.sunDirection;
  }

  private syncSkyState(): void {
    const date = this.getSFDate(this.timeOfDay);
    const { sun, moon, sunECEF } = this.atmosphere.setDate(date);
    this.env.setSky(sun, moon, sunECEF);

    this.sunDirection.copy(this.env.sunDir);
    this.sunColor.copy(this.env.sunColor);
    this.night = this.env.night;
    this.nightFactor = this.env.night;
    this.dark = this.env.dark;

    shared.uNight.value = this.night;
    shared.uDark.value = this.dark;
  }

  public update(_dt: number, cameraPos: THREE.Vector3, focusPos?: THREE.Vector3): void {
    this.syncSkyState();
    const target = focusPos ?? cameraPos;
    this.env.follow(target, this.camera);
    this.atmosphere.bloom.intensity = this.env.bloom * 3;
    this.atmosphere.balance.uniforms.get('gain')!.value.copy(this.env.balance);
    this.atmosphere.lightFog(this.env.dark, this.env.warmth * this.env.daylight, Math.max(0, target.y));
  }

  public setSize(w: number, h: number): void {
    this.atmosphere.setSize(w, h);
  }

  public render(dt: number): void {
    this.atmosphere.render(dt);
  }
}
