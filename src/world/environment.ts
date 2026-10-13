// Environment & physical sun/sky lighting ported directly from jeantimex/tokyo/src/world/environment.js
import * as THREE from 'three';
import { SunDirectionalLight, SkyLightProbe } from '@takram/three-atmosphere';
import { shared } from './materials';

const SHADOW_SIZE = 2048;
const LIGHT = 10;
const EXPOSURE = { target: 2.25, least: 0.6, most: 1.7 };
const BLOOM = { day: 0.08, night: 0.6 };
const DAYLIGHT = new THREE.Vector3(0.83, 1, 1.2);
const MOON = { strength: 0.32, color: new THREE.Color(0x9fb4e0) };
const GLOW = { strength: 0.5, sky: new THREE.Color(0xe6eaf4), ground: new THREE.Color(0x8a8172) };
const MOON_STAND_IN = new THREE.Vector3().setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - 40),
  THREE.MathUtils.degToRad(205)
);

export function installSkyLight(): void {
  THREE.ShaderChunk.envmap_physical_pars_fragment =
    THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
      'return PI * envMapColor.rgb * envMapIntensity;',
      'return vec3( 0.0 );'
    );
}

export class Environment {
  public night = 0;
  public dark = 0;
  public daylight = 1;
  public moonlight = 0;
  public warmth = 0;
  public elevation = 40;
  public brightness = 1;
  public sunStrength = 1;
  public skyStrength = 1;
  public bounceStrength = 1.3;
  public moonStrength = 1;
  public glowStrength = 1;
  public nightBrightness = 1;
  public balance = new THREE.Vector3(1, 1, 1);
  public sunDir = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
  public bloom = BLOOM.day;

  public sun: SunDirectionalLight;
  public skyLight: SkyLightProbe;
  public glow: THREE.HemisphereLight;
  public bounce: THREE.HemisphereLight;

  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private physical: { glow: THREE.MeshBasicMaterial; scale: number; ready: () => boolean } | null = null;
  private bakedSun = new THREE.Vector3();
  private baked = -1;
  private bakedAt = 0;
  private shadowExtent = 0;
  public sunColor = new THREE.Color(1, 0.98, 0.94);

  constructor(
    public scene: THREE.Scene,
    public renderer: THREE.WebGLRenderer
  ) {
    this.sun = new SunDirectionalLight({ distance: 2000 });
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    const c = this.sun.shadow.camera;
    c.near = 10;
    c.far = 4000;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.5;
    this.sun.shadow.radius = 3;
    this.sun.intensity = 3.2;

    this.skyLight = new SkyLightProbe();
    this.skyLight.intensity = 1.2;
    this.glow = new THREE.HemisphereLight(GLOW.sky, GLOW.ground, 0);
    this.bounce = new THREE.HemisphereLight(0xffe8c8, 0xd8d0c2, 0.6);
    scene.add(this.sun, this.sun.target, this.skyLight, this.glow, this.bounce);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.apply();
  }

  public lightFromSky(
    textures: { transmittanceTexture: THREE.Texture | null; irradianceTexture: THREE.Texture | null },
    worldToECEF: THREE.Matrix4,
    sky: { mesh: THREE.Mesh; scale: number },
    ready: () => boolean
  ): void {
    this.sun.transmittanceTexture = textures.transmittanceTexture;
    this.skyLight.irradianceTexture = textures.irradianceTexture;
    this.sun.worldToECEFMatrix.copy(worldToECEF);
    this.skyLight.worldToECEFMatrix.copy(worldToECEF);
    const glow = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    Object.assign(sky.mesh.material, {
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    sky.mesh.renderOrder = 1;
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), glow), sky.mesh);
    this.physical = { glow, scale: sky.scale, ready };
  }

  public bakeEnvironment(sun: THREE.Vector3): void {
    if (!this.physical?.ready()) return;
    this.bakedAt = performance.now();
    this.baked = this.dark;
    this.bakedSun.copy(sun);
    this.physical.glow.color
      .setRGB(0.05, 0.04, 0.045)
      .multiplyScalar(this.dark / this.physical.scale);
    const old = this.scene.environment;
    this.scene.environment = this.pmrem.fromScene(this.envScene, 0, 0.1, 10).texture;
    this.scene.environmentIntensity = this.physical.scale;
    old?.dispose();
  }

  public setSky(sun: THREE.Vector3, moon: THREE.Vector3, sunECEF: THREE.Vector3): void {
    const deg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1)));
    const step = THREE.MathUtils.smoothstep;
    this.elevation = deg;
    this.night = 1 - step(deg, 0, 9);
    this.dark = 1 - step(deg, -13, 5);
    this.daylight = step(deg, -5, 9);
    this.moonlight = 1 - step(deg, -14, -5.5);
    this.warmth = 1 - step(deg, 3, 24);
    const sunUp = deg > -5.5;
    if (sunUp) this.sunDir.copy(sun).setY(Math.max(sun.y, 0.06)).normalize();
    else if (moon.y > 0.2) this.sunDir.copy(moon);
    else this.sunDir.copy(MOON_STAND_IN);
    shared.uSunDir.value.copy(sun);

    if (this.physical?.ready()) {
      this.sun.sunDirection.copy(sunECEF);
      this.sun.update();
      this.sunColor.copy(this.sun.color);
      if (sunUp) this.sun.intensity = LIGHT * this.sunStrength;
      else {
        this.sun.color.copy(MOON.color);
        this.sun.intensity = MOON.strength * this.moonStrength * this.moonlight;
      }
      const sent = sunUp ? 0.3 * this.sun.intensity * Math.max(sun.y, 0) * this.bounceStrength : 0;
      this.bounce.groundColor.copy(this.sunColor).multiplyScalar(0.8 * sent);
      this.bounce.color.copy(this.sunColor).multiplyScalar(0.2 * sent);

      this.skyLight.sunDirection.copy(sunECEF);
      this.skyLight.position.copy(this.sun.target.position);
      this.skyLight.update();
      this.skyLight.intensity = LIGHT * this.skyStrength;
      shared.uSunGlint.value.copy(this.sunColor).multiplyScalar(LIGHT * 0.9);
      const now = performance.now();
      if (
        now - this.bakedAt > 200 &&
        (this.baked < 0 || sun.angleTo(this.bakedSun) > 0.006 || Math.abs(this.dark - this.baked) > 0.04)
      ) {
        this.bakeEnvironment(sun);
      }
    }
    this.apply();
  }

  public follow(focus: THREE.Vector3, camera: THREE.Camera): void {
    const want = THREE.MathUtils.clamp(camera.position.distanceTo(focus) * 1.05, 180, 1280);
    const extent = 180 * 1.3 ** Math.ceil(Math.log(want / 180) / Math.log(1.3));
    if (extent !== this.shadowExtent) {
      this.shadowExtent = extent;
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -extent;
      c.right = c.top = extent;
      c.updateProjectionMatrix();
      this.sun.shadow.normalBias = 0.25 + extent / 900;
    }
    const texel = (2 * extent) / SHADOW_SIZE;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 2000);
  }

  public apply(): void {
    const t = this.dark;
    const lerp = (a: number, b: number) => a + (b - a) * t;
    this.glow.intensity = GLOW.strength * this.glowStrength * t;
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const sh = this.skyLight.sh.coefficients[0];
    const light =
      0.3 * lum(this.sun.color) * this.sun.intensity * Math.max(this.sunDir.y, 0.05) +
      2.5 * (0.2126 * sh.x + 0.7152 * sh.y + 0.0722 * sh.z) * this.skyLight.intensity +
      1.3 * t * t * t;
    this.renderer.toneMappingExposure =
      THREE.MathUtils.clamp(EXPOSURE.target / Math.max(light, 1e-3), EXPOSURE.least, EXPOSURE.most) *
      this.brightness *
      (1 + (this.nightBrightness - 1) * t);
    this.bloom = lerp(BLOOM.day, BLOOM.night);
    this.balance.set(1, 1, 1).lerp(DAYLIGHT, this.daylight);
    shared.uNight.value = this.night;
    shared.uDark.value = t;
  }
}
