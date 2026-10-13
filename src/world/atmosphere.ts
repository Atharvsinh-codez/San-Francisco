// Post-processing, Sky, Aerial Perspective, and 3D Volumetric Clouds (@takram/three-atmosphere + @takram/three-clouds)
// ported directly from jeantimex/tokyo/src/world/atmosphere.js
import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  Effect,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';
// @ts-ignore
import { N8AOPostPass } from 'n8ao';
import { WindowReflections } from './reflections';
import { FogEffect } from './fog';
import {
  AerialPerspectiveEffect,
  PrecomputedTexturesGenerator,
  PrecomputedTexturesLoader,
  SkyMaterial,
  getSunDirectionECEF,
  getMoonDirectionECEF,
} from '@takram/three-atmosphere';
import {
  CloudsEffect,
  CLOUD_SHAPE_TEXTURE_SIZE,
  CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
} from '@takram/three-clouds';
import {
  DataTextureLoader,
  Ellipsoid,
  Geodetic,
  parseUint8Array,
  radians,
  STBNLoader,
} from '@takram/three-geospatial';
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects';
import { shared } from './materials';

const ASSETS = 'assets/takram';
const UNITS = 0.1;
const FADE = 2500;
const CLOUD_GLOW = 0.6;
const CLOUD_NIGHT = new THREE.Vector3(0.62, 0.56, 0.6);
const FOG_DAY = new THREE.Color(0.72, 0.75, 0.79);
const HAZE_DAY = new THREE.Color(0.56, 0.68, 0.86);
const HAZE_WARM = new THREE.Color(1.05, 0.56, 0.3);
const FOG_WARM = new THREE.Color(0.85, 0.6, 0.45);
const FOG_NIGHT = new THREE.Color(0.035, 0.04, 0.055);
export const SHADE = 0.86;

class Grade extends Effect {
  constructor() {
    super(
      'Grade',
      `uniform float amount;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 g = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
  g = mix(g, g * g * (3.0 - 2.0 * g), 0.4 * amount);
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, 1.0 + 0.16 * amount);
  g += amount * (vec3(0.03, 0.012, -0.022) * smoothstep(0.45, 1.0, l) + vec3(-0.016, 0.0, 0.026) * (1.0 - smoothstep(0.0, 0.45, l)));
  g *= 1.0 - 0.26 * amount * smoothstep(0.35, 1.0, length(uv - 0.5) * 1.3);
  outputColor = vec4(mix(inputColor.rgb, pow(max(g, 0.0), vec3(2.2)), step(1e-4, amount)), inputColor.a);
}`,
      { uniforms: new Map([['amount', new THREE.Uniform(0)]]) }
    );
  }
}

const PICTURE: Record<string, number> = {
  contrast: 1,
  saturation: 1,
  highlights: 0.15,
  shadows: 0.03,
  tint: -0.25,
};
class Picture extends Effect {
  constructor() {
    super(
      'Picture',
      `uniform float contrast, highlights, shadows, saturation, vibrance, temperature, tint, vignette;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  c *= vec3(1.0 + 0.18 * temperature, 1.0 - 0.1 * tint, 1.0 - 0.18 * temperature) * (1.0 + 0.05 * tint);
  vec3 g = pow(c, vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g += 0.3 * shadows * (1.0 - smoothstep(0.0, 0.5, l)) * (1.0 - l) * g / max(l, 0.05) * 0.5 + 0.3 * highlights * smoothstep(0.5, 1.0, l) * l;
  g = (g - 0.5) * contrast + 0.5;
  l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  float vivid = max(g.r, max(g.g, g.b)) - min(g.r, min(g.g, g.b));
  g = mix(vec3(l), g, saturation * (1.0 + vibrance * (1.0 - clamp(vivid * 1.6, 0.0, 1.0))));
  g *= 1.0 - vignette * smoothstep(0.35, 1.0, length(uv - 0.5) * 1.3);
  outputColor = vec4(pow(max(g, 0.0), vec3(2.2)), inputColor.a);
}`,
      {
        uniforms: new Map(
          [
            'contrast',
            'highlights',
            'shadows',
            'saturation',
            'vibrance',
            'temperature',
            'tint',
            'vignette',
          ].map((k) => [k, new THREE.Uniform(PICTURE[k] ?? 0)])
        ),
      }
    );
  }
}

class Balance extends Effect {
  constructor() {
    super(
      'Balance',
      'uniform vec3 gain; void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = vec4(inputColor.rgb * gain, inputColor.a); }',
      { uniforms: new Map([['gain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))]]) }
    );
  }
}

class Scale extends Effect {
  constructor(k: number) {
    super(
      'Scale',
      'uniform float k; void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = vec4(inputColor.rgb * k, inputColor.a); }',
      { uniforms: new Map([['k', new THREE.Uniform(k)]]) }
    );
  }
}

export class Atmosphere {
  public worldToECEF: THREE.Matrix4;
  public rotation: THREE.Matrix3;
  private toWorld?: THREE.Matrix3;
  public aerial: AerialPerspectiveEffect;
  public plain: AerialPerspectiveEffect;
  public clouds: CloudsEffect;
  public composer: EffectComposer;
  public reflections: WindowReflections;
  public reflectionPass: EffectPass;
  public ao: any;
  public fogEffect: FogEffect;
  public fogPass: EffectPass;
  public cloudPass: EffectPass;
  public skyPass: EffectPass;
  public bloom: BloomEffect;
  public gradeEffect: Grade;
  public toneMapping: ToneMappingEffect;
  public pictureEffect: Picture;
  public picture: Record<string, THREE.Uniform<any>>;
  public balance: Balance;
  public finalPass: EffectPass;
  public smaaPass: EffectPass;
  public textures: any;
  public ready = false;
  public readyPromise: Promise<void>;
  public skyMaterial?: SkyMaterial;

  private cityRect: THREE.Uniform<THREE.Vector4>;
  private cityFade: THREE.Uniform<number>;
  private cloudAmbient = new THREE.Uniform(new THREE.Vector3());
  private shadeNow?: number;
  private fogAmount = 0;
  private hazeAmount = 0;
  private aa = 'smaa';
  private cloudQuality: 'low' | 'medium' | 'high' | 'ultra' = 'high';
  public sun = new THREE.Vector3();
  public moon = new THREE.Vector3();

  constructor(
    public renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    origin: { lon: number; lat: number },
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  ) {
    renderer.toneMapping = THREE.NoToneMapping;

    const position = new Geodetic(radians(origin.lon), radians(origin.lat), 0).toECEF();
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    const up = new THREE.Vector3();
    Ellipsoid.WGS84.getEastNorthUpVectors(position, east, north, up);
    this.worldToECEF = new THREE.Matrix4()
      .makeBasis(east, up, north.clone().negate())
      .setPosition(position);
    this.rotation = new THREE.Matrix3().setFromMatrix4(this.worldToECEF);

    const aerial = (this.aerial = new AerialPerspectiveEffect(camera));
    aerial.sky = true;
    aerial.ground = false;
    aerial.worldToECEFMatrix.copy(this.worldToECEF);
    const hook = 'radiance = inputColor.rgb;\n  #endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)';
    const source = aerial.getFragmentShader();
    if (source.includes(hook)) {
      (aerial as any).setFragmentShader(
        source.replace(
          hook,
          `radiance = inputColor.rgb * mix(${SHADE.toFixed(2)}, 1.0, sunTransmittance);\n  #endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)`
        )
      );
    }
    const sky = `    outputColor.rgb = getSkyRadiance(\n      vCameraPosition,\n      rayDirection,`;
    const lit = aerial.getFragmentShader();
    if (lit.includes(sky)) {
      (aerial as any).setFragmentShader(
        lit
          .replace(
            sky,
            `    vec3 skyUp = normalize(vCameraPosition);
    float skyBelow = min(dot(rayDirection, skyUp), 0.0);
    vec3 skyDirection = rayDirection - 2.0 * skyBelow * skyUp;
    outputColor.rgb = getSkyRadiance(
      vCameraPosition,
      skyDirection,`
          )
          .replace(
            `    outputColor.a = 1.0;\n    #else // SKY`,
            `    if (skyBelow < 0.0) outputColor.rgb = min(outputColor.rgb, vec3(0.5));\n    outputColor.a = 1.0;\n    #else // SKY`
          )
      );
    }

    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftwareGL = /swiftshader|llvmpipe|software/i.test(gpuRenderer);

    const clouds = (this.clouds = new CloudsEffect(camera));
    clouds.worldToECEFMatrix.copy(this.worldToECEF);
    clouds.coverage = 0.34;
    Object.assign(clouds.shadow, {
      farScale: 0.25,
      maxFar: 1e5,
      cascadeCount: 2,
      splitMode: 'practical',
      splitLambda: 0.71,
    });
    clouds.shadow.mapSize.set(512, 512);
    this.quality = isSoftwareGL ? 'low' : 'medium';
    // Disable 4x4 checkerboard temporal upscaling: it renders 1/16th of the pixels per
    // frame and leaves a visible 4x4 pixel grid whenever the camera moves or frame rate
    // drops. Render every pixel each frame at half resolution with linear filtering instead.
    clouds.temporalUpscale = false;
    clouds.resolutionScale = isSoftwareGL ? 0.45 : 0.6;
    clouds.localWeatherVelocity.set(0.0005, 0);
    // Scattered fair-weather cumulus with wide blue-sky gaps.
    Object.assign(clouds.cloudLayers[0], {
      height: 620,
      densityScale: 0.18,
      shapeAmount: 0.88,
      shapeDetailAmount: 0.55,
      weatherExponent: 1.75,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.5,
    });
    Object.assign(clouds.cloudLayers[1], {
      height: 750,
      densityScale: 0.12,
      shapeAmount: 0.8,
      shapeDetailAmount: 0.45,
      weatherExponent: 2.6,
      shapeAlteringBias: 0.35,
      coverageFilterWidth: 0.45,
    });
    this.base = 450;

    this.cityRect = new THREE.Uniform(
      new THREE.Vector4(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ)
    );
    this.cityFade = new THREE.Uniform(FADE);
    const where = 'vec2 getGlobeUv(const vec3 position) {';
    const mask = '  #ifdef SHADOW\n  localWeather *= shadowLayerMask;';
    for (const material of [
      clouds.cloudsPass.currentMaterial,
      clouds.shadowPass.currentMaterial,
    ] as any[]) {
      const src: string = material.fragmentShader;
      if (!src.includes(where) || !src.includes(mask)) continue;
      material.fragmentShader = src
        .replace(
          where,
          `uniform vec4 cityRect;\nuniform float cityFade;\nvec3 cityPosition;\n${where}\n  cityPosition = position;`
        )
        .replace(
          mask,
          `  {\n    vec3 w = (ecefToWorldMatrix * vec4(cityPosition - altitudeCorrection, 1.0)).xyz;\n    vec2 d = max(cityRect.xy - w.xz, w.xz - cityRect.zw);\n    localWeather *= 1.0 - smoothstep(0.0, cityFade, max(d.x, d.y));\n  }\n${mask}`
        );
      material.uniforms.cityRect = this.cityRect;
      material.uniforms.cityFade = this.cityFade;
      material.needsUpdate = true;
    }

    {
      const material = clouds.cloudsPass.currentMaterial as any;
      const light = 'radiance += skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyLightScale;';
      if (material.fragmentShader.includes(light)) {
        material.fragmentShader = material.fragmentShader
          .replace(
            light,
            'radiance += (skyIrradiance * skyLightScale + cloudAmbient) * RECIPROCAL_PI4 * skyGradient;'
          )
          .replace(
            'uniform float skyLightScale;',
            'uniform float skyLightScale;\nuniform vec3 cloudAmbient;'
          );
        material.uniforms.cloudAmbient = this.cloudAmbient;
        material.needsUpdate = true;
      }
    }

    const pass = (property: string) => {
      if (property === 'atmosphereOverlay') aerial.overlay = clouds.atmosphereOverlay;
      else if (property === 'atmosphereShadow') aerial.shadow = clouds.atmosphereShadow;
      else if (property === 'atmosphereShadowLength')
        aerial.shadowLength = clouds.atmosphereShadowLength;
    };
    clouds.events.addEventListener('change', (e: any) => pass(e.property));
    ['atmosphereOverlay', 'atmosphereShadow', 'atmosphereShadowLength'].forEach(pass);

    // `?bakedLUT` loads takram's published LUT files instead of computing them on the GPU.
    // The offline recorder uses it: in headless Chrome the multi-second precompute burst can
    // trip the Windows GPU timeout, which resets the context and leaves the sky black.
    let lutReady: Promise<unknown>;
    if (new URLSearchParams(window.location.search).has('bakedLUT')) {
      let lutDone!: () => void;
      lutReady = new Promise<void>((r) => (lutDone = r));
      this.textures = new PrecomputedTexturesLoader({ format: 'binary' }).load(
        `${ASSETS}/atmosphere`,
        () => lutDone(),
        undefined,
        (e) => {
          console.error('Baked atmosphere LUT failed to load:', e);
          lutDone();
        }
      );
    } else {
      const generator = new PrecomputedTexturesGenerator(renderer);
      this.textures = generator.textures;
      lutReady = generator.update().catch((e) => {
        console.warn('PrecomputedTexturesGenerator fallback:', e);
      });
    }
    Object.assign(aerial, this.textures);
    Object.assign(clouds, this.textures);

    const repeat = (t: THREE.Texture) => {
      t.minFilter = THREE.LinearMipMapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
    };
    const volume = (size: number) =>
      new DataTextureLoader(THREE.Data3DTexture as any, parseUint8Array, {
        width: size,
        height: size,
        depth: size,
        format: THREE.RedFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        wrapR: THREE.RepeatWrapping,
        colorSpace: THREE.NoColorSpace,
      });

    const waitTex = <T>(loadFn: (done: () => void) => T): [T, Promise<void>] => {
      let resolve!: () => void;
      const p = new Promise<void>((r) => {
        resolve = r;
      });
      const tex = loadFn(() => resolve());
      return [tex, p];
    };

    const [localWeatherTex, pWeather] = waitTex((done) =>
      new THREE.TextureLoader().load(
        `${ASSETS}/local_weather.png`,
        (t) => {
          repeat(t);
          done();
        },
        undefined,
        () => done()
      )
    );
    clouds.localWeatherTexture = localWeatherTex;
    shared.uCloudMap.value = clouds.localWeatherTexture;
    shared.uWorldToECEF.value.copy(this.worldToECEF);
    shared.uCloudRect.value.copy(this.cityRect.value);

    const [turbulenceTex, pTurb] = waitTex((done) =>
      new THREE.TextureLoader().load(
        `${ASSETS}/turbulence.png`,
        (t) => {
          repeat(t);
          done();
        },
        undefined,
        () => done()
      )
    );
    clouds.turbulenceTexture = turbulenceTex;

    const [shapeTex, pShape] = waitTex((done) =>
      volume(CLOUD_SHAPE_TEXTURE_SIZE).load(
        `${ASSETS}/shape.bin`,
        () => done(),
        undefined,
        () => done()
      )
    );
    clouds.shapeTexture = shapeTex as any;

    const [shapeDetailTex, pDetail] = waitTex((done) =>
      volume(CLOUD_SHAPE_DETAIL_TEXTURE_SIZE).load(
        `${ASSETS}/shape_detail.bin`,
        () => done(),
        undefined,
        () => done()
      )
    );
    clouds.shapeDetailTexture = shapeDetailTex as any;

    const [stbn, pStbn] = waitTex((done) =>
      new STBNLoader().load(
        `${ASSETS}/stbn.bin`,
        () => done(),
        undefined,
        () => done()
      )
    );
    clouds.stbnTexture = stbn;
    aerial.stbnTexture = stbn;

    this.readyPromise = Promise.all([
      lutReady,
      pWeather,
      pTurb,
      pShape,
      pDetail,
      pStbn,
    ]).then(() => {
      this.ready = true;
    });

    const plain = (this.plain = new AerialPerspectiveEffect(camera));
    plain.sky = true;
    plain.ground = false;
    plain.worldToECEFMatrix.copy(this.worldToECEF);
    (plain as any).setFragmentShader(aerial.getFragmentShader());
    Object.assign(plain, this.textures);
    plain.stbnTexture = stbn;

    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    });
    this.composer.addPass(new RenderPass(scene, camera));
    this.reflections = new WindowReflections(camera);
    this.reflectionPass = new EffectPass(camera, this.reflections);
    this.composer.addPass(this.reflectionPass);

    this.ao = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight);
    Object.assign(this.ao.configuration, {
      aoRadius: 7,
      distanceFalloff: 1,
      intensity: 2.2,
      halfRes: true,
      gammaCorrection: false,
      transparencyAware: false,
    });
    this.ao.configuration.color = new THREE.Color(0.02, 0.02, 0.03);
    this.ao.enabled = !isSoftwareGL;
    this.composer.addPass(this.ao);

    this.fogEffect = new FogEffect(camera);
    this.fogPass = new EffectPass(camera, this.fogEffect);
    this.fogPass.enabled = false;
    this.composer.addPass(this.fogPass);

    this.composer.addPass(new EffectPass(camera, new Scale(UNITS)));
    this.cloudPass = new EffectPass(camera, clouds, aerial);
    this.composer.addPass(this.cloudPass);
    this.skyPass = new EffectPass(camera, plain);
    this.composer.addPass(this.skyPass);
    this.composer.addPass(new EffectPass(camera, new Scale(1 / UNITS)));

    this.bloom = new BloomEffect({
      intensity: 0.5,
      luminanceThreshold: 0.9,
      luminanceSmoothing: 0.2,
      mipmapBlur: true,
    });
    this.gradeEffect = new Grade();
    this.composer.addPass(new EffectPass(camera, new LensFlareEffect()));
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    this.pictureEffect = new Picture();
    this.picture = Object.fromEntries(
      [...this.pictureEffect.uniforms].map(([k, u]) => [k, u])
    );
    this.balance = new Balance();
    this.finalPass = new EffectPass(
      camera,
      this.balance,
      this.bloom,
      this.toneMapping,
      this.gradeEffect,
      this.pictureEffect,
      new DitheringEffect()
    );
    this.composer.addPass(this.finalPass);
    this.smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
    this.composer.addPass(this.smaaPass);
    this.composer.autoRenderToScreen = false;
    this.antialias = 'smaa';
    this.cloudsOn = true; // Volumetric clouds enabled by default just like jeantimex/tokyo!
    this.overCity = false; // Spread clouds across the full San Francisco Bay & Marin sky
  }

  get shade(): number {
    return this.shadeNow ?? SHADE;
  }
  set shade(v: number) {
    if (v === this.shade) return;
    this.shadeNow = v;
    for (const fx of [this.aerial, this.plain]) {
      (fx as any).setFragmentShader(
        fx
          .getFragmentShader()
          .replace(/mix\([0-9.]+, 1\.0, sunTransmittance\)/, `mix(${v.toFixed(2)}, 1.0, sunTransmittance)`)
      );
    }
  }

  public environmentSky(): { mesh: THREE.Mesh; scale: number } {
    const material = (this.skyMaterial = new SkyMaterial({
      sun: false,
      moon: false,
      ground: true,
      groundAlbedo: new THREE.Color(0.22, 0.21, 0.19),
    }));
    Object.assign(material, this.textures);
    material.worldToECEFMatrix.copy(this.worldToECEF);
    material.sunDirection.copy(this.sun);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    return { mesh, scale: 0.72 / UNITS };
  }

  get fog(): number {
    return this.fogAmount;
  }
  set fog(v: number) {
    this.fogAmount = v;
    this.setAir();
  }
  get haze(): number {
    return this.hazeAmount;
  }
  set haze(v: number) {
    this.hazeAmount = v;
    this.setAir();
  }
  private setAir(): void {
    const f = this.fogAmount;
    const h = this.hazeAmount;
    const u = this.fogEffect.uniforms;
    this.fogPass.enabled = f > 0 || h > 0;
    u.get('uDensity')!.value = (f > 0 ? 0.0001 + 0.0059 * f * f : 0) + 0.00009 * h;
    u.get('uHeight')!.value = f > 0 ? 120 + 260 * f : 420;
  }

  get antialias(): string {
    return this.aa;
  }
  set antialias(mode: string) {
    this.aa = mode;
    const smaa = mode === 'smaa' || mode === 'both';
    const samples = mode === 'msaa' || mode === 'both' ? 4 : 0;
    this.smaaPass.enabled = this.smaaPass.renderToScreen = smaa;
    this.finalPass.renderToScreen = !smaa;
    if (this.composer.multisampling !== samples) this.composer.multisampling = samples;
  }

  public lightFog(dark: number, warm: number, ground: number): void {
    if (!this.fogPass.enabled) return;
    const u = this.fogEffect.uniforms;
    const thick = Math.min(1, this.fogAmount * 3);
    u.get('uColor')!
      .value.copy(HAZE_DAY)
      .lerp(HAZE_WARM, warm * (1 - dark))
      .lerp(FOG_DAY.clone().lerp(FOG_WARM, 0.55 * warm * (1 - dark)), thick)
      .lerp(FOG_NIGHT, dark);
    u.get('uGround')!.value = ground;
  }

  get cloudsOn(): boolean {
    return this.cloudPass.enabled;
  }
  set cloudsOn(v: boolean) {
    this.cloudPass.enabled = v;
    this.skyPass.enabled = !v;
  }
  get reflect(): boolean {
    return this.reflectionPass.enabled;
  }
  set reflect(v: boolean) {
    this.reflectionPass.enabled = v;
  }
  get coverage(): number {
    return this.clouds.coverage;
  }
  set coverage(v: number) {
    this.clouds.coverage = v;
  }
  get base(): number {
    return this.clouds.cloudLayers[0].altitude;
  }
  set base(v: number) {
    this.clouds.cloudLayers[0].altitude = v;
    this.clouds.cloudLayers[1].altitude = v + 250;
  }
  get overCity(): boolean {
    return this.cityFade.value < 1e6;
  }
  set overCity(v: boolean) {
    this.cityFade.value = v ? FADE : 1e9;
  }
  get quality(): 'low' | 'medium' | 'high' | 'ultra' {
    return this.cloudQuality;
  }
  set quality(v: 'low' | 'medium' | 'high' | 'ultra') {
    this.cloudQuality = v;
    this.clouds.qualityPreset = v;
  }

  public setDate(date: Date): {
    sun: THREE.Vector3;
    moon: THREE.Vector3;
    sunECEF: THREE.Vector3;
  } {
    getSunDirectionECEF(date, this.sun);
    getMoonDirectionECEF(date, this.moon);
    for (const fx of [this.aerial, this.plain]) {
      fx.sunDirection.copy(this.sun);
      fx.moonDirection.copy(this.moon);
    }
    this.clouds.sunDirection.copy(this.sun);
    this.skyMaterial?.sunDirection.copy(this.sun);
    const toWorld = (this.toWorld ??= this.rotation.clone().transpose());
    const sun = this.sun.clone().applyMatrix3(toWorld);
    const height = THREE.MathUtils.radToDeg(Math.asin(sun.y));
    const low = 1 - THREE.MathUtils.smoothstep(height, 2, 14);
    const night = 1 - THREE.MathUtils.smoothstep(height, -12, -3);
    this.cloudAmbient.value
      .set(1, 0.8, 0.72)
      .lerp(CLOUD_NIGHT, night)
      .multiplyScalar(low * THREE.MathUtils.lerp(CLOUD_GLOW, CLOUD_GLOW * 0.07, night));
    return { sun, moon: this.moon.clone().applyMatrix3(toWorld), sunECEF: this.sun };
  }

  public setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  public render(dt: number): void {
    if (!this.ready) return;
    shared.uCloudsOn.value = this.cloudsOn ? 1 : 0;
    shared.uCloudCover.value = this.clouds.coverage;
    shared.uCloudBase.value = this.clouds.cloudLayers[0].altitude;
    shared.uCloudOffset.value.copy(this.clouds.localWeatherOffset);
    shared.uCloudFade.value = this.cityFade.value;
    this.composer.render(dt);
  }
}

const SEE_THROUGH = 3;
const SEE_THROUGH_SOLID = 4;
function leanTransparency(ao: any): void {
  const clear = new THREE.Color(0, 0, 0);
  const old = new THREE.Color();
  const found = [0, 0];
  let mask = 0;
  const mark = (o: any) => {
    if (!o.visible) return;
    const m = o.material;
    if (m) {
      const seen = (o.layers.mask & mask) !== 0;
      const off = o.userData?.treatAsOpaque;
      const a = seen && ((m.transparent && !m.depthWrite && !off) || !!o.userData?.cannotReceiveAO);
      const b = seen && !!m.transparent && m.depthWrite && !off;
      if (a) {
        o.layers.enable(SEE_THROUGH);
        found[0]++;
      } else o.layers.disable(SEE_THROUGH);
      if (b) {
        o.layers.enable(SEE_THROUGH_SOLID);
        found[1]++;
      } else o.layers.disable(SEE_THROUGH_SOLID);
    } else if (o.isLight) {
      o.layers.enable(SEE_THROUGH);
      o.layers.enable(SEE_THROUGH_SOLID);
    }
    for (const c of o.children) mark(c);
  };
  ao.renderTransparency = function (renderer: THREE.WebGLRenderer) {
    const scene = this.scene;
    const camera = this.camera;
    const background = scene.background;
    const alpha = renderer.getClearAlpha();
    const depth = renderer.autoClearDepth;
    renderer.getClearColor(old);
    mask = camera.layers.mask & ~((1 << SEE_THROUGH) | (1 << SEE_THROUGH_SOLID));
    found[0] = found[1] = 0;
    mark(scene);
    scene.background = null;
    renderer.autoClearDepth = false;
    renderer.setClearColor(clear, 0);
    this.depthCopyPass.material.uniforms.depthTexture.value = this.depthTexture;
    this.depthCopyPass.material.uniforms.reverseDepthBuffer.value =
      this.configuration.depthBufferType === 3;
    [
      [this.transparencyRenderTargetDWFalse, SEE_THROUGH],
      [this.transparencyRenderTargetDWTrue, SEE_THROUGH_SOLID],
    ].forEach(([target, layer], i) => {
      renderer.setRenderTarget(target);
      renderer.clear(true, true, true);
      this.depthCopyPass.render(renderer);
      camera.layers.mask = 1 << layer;
      if (found[i]) renderer.render(scene, camera);
      camera.layers.mask = mask;
    });
    renderer.setClearColor(old, alpha);
    scene.background = background;
    renderer.autoClearDepth = depth;
  };
}
