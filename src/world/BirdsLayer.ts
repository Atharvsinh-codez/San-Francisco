// GPU Flocking Birds ported directly from jeantimex/tokyo/src/world/birds.js
import * as THREE from 'three';

export const MAX_BIRDS = 1200;
const FLOCK = 14;
const FLOCKS = Math.ceil(MAX_BIRDS / FLOCK);
const SPAN = 3.2; // wingspan in metres so flocks are clearly visible from the air
const LAND = 13, TAKE_OFF = 9;
const CRUISE = 28;

function birdGeometry(): THREE.InstancedBufferGeometry {
  const pos: number[] = [];
  const wing: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    for (const [x, y, z, w] of [a, b, c]) {
      pos.push(x, y, z);
      wing.push(w);
    }
  };
  const h = SPAN / 2;
  tri([0, 0, 0.42, 0], [0.09, 0, -0.1, 0], [-0.09, 0, -0.1, 0]); // head and chest
  tri([0.09, 0, -0.1, 0], [0, 0, -0.5, 0], [-0.09, 0, -0.1, 0]); // tail
  for (const s of [-1, 1]) {
    tri([s * 0.06, 0, 0.2, 0], [s * h * 0.5, 0, 0.16, 0.5], [s * 0.06, 0, -0.16, 0]); // inner panel
    tri([s * h * 0.5, 0, 0.16, 0.5], [s * h * 0.5, 0, -0.1, 0.5], [s * 0.06, 0, -0.16, 0]);
    tri([s * h * 0.5, 0, 0.16, 0.5], [s * h, 0, -0.02, 1], [s * h * 0.5, 0, -0.1, 0.5]); // outer panel
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  const seed = new Float32Array(MAX_BIRDS * 4);
  for (let i = 0; i < MAX_BIRDS; i++) {
    seed.set([Math.floor(i / FLOCK), Math.random(), Math.random(), Math.random()], i * 4);
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  return g;
}

interface FlockState {
  state: 'new' | 'fly' | 'land' | 'perched' | 'takeoff';
  timer: number;
  perch: number;
  rate: number;
  anchor: THREE.Vector3;
  target: THREE.Vector3 | null;
}

export class BirdsLayer {
  public readonly mesh: THREE.Mesh;
  private data: Float32Array;
  private flockTex: THREE.DataTexture;
  private flocks: FlockState[];
  private uTime = { value: 0 };
  private uDark = { value: 0 };

  constructor(private scene: THREE.Scene) {
    this.data = new Float32Array(FLOCKS * 2 * 4);
    this.flockTex = new THREE.DataTexture(this.data, FLOCKS, 2, THREE.RGBAFormat, THREE.FloatType);
    this.flockTex.minFilter = this.flockTex.magFilter = THREE.NearestFilter;

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: this.uTime,
        uDark: this.uDark,
        uFlocks: { value: this.flockTex },
      },
      vertexShader: /* glsl */ `
        #define PIGEONS 0.85
        attribute float aWing;
        attribute vec4 aSeed;
        uniform float uTime;
        uniform sampler2D uFlocks;
        varying float vShade;
        varying float vCrow;
        float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        float aloft(float perch) {
          float b = clamp(perch * 1.4 - 0.4 * aSeed.w, 0.0, 1.0);
          return 1.0 - b * b * (3.0 - 2.0 * b);
        }
        vec3 place(float t, vec4 flock, float perch) {
          float f = aSeed.x, air = aloft(perch);
          vec2 reach = 45.0 + 170.0 * vec2(hash(f + 1.0), hash(f + 5.0));
          vec3 c = vec3(
            reach.x * sin(t * (0.05 + 0.06 * hash(f + 8.0)) + 6.28 * hash(f + 2.0)),
            24.0 + 180.0 * pow(hash(f + 3.0), 2.0) + 14.0 * sin(t * 0.05 + 6.28 * hash(f + 4.0)),
            reach.y * sin(t * (0.05 + 0.06 * hash(f + 10.0)) + 6.28 * hash(f + 6.0))
          );
          float radius = 8.0 + 55.0 * aSeed.y;
          float turn = (0.5 + aSeed.z) * 4.5 / radius * (hash(f + 7.0) < 0.5 ? -1.0 : 1.0);
          float a = t * turn + 6.28 * aSeed.w;
          vec3 own = vec3(
            cos(a) * radius,
            9.0 * sin(t * 0.21 + 6.28 * aSeed.z) + 45.0 * (aSeed.w - 0.5),
            sin(a) * radius * 0.8
          );
          own.y = max(own.y, 6.0 - c.y);
          vec3 twig = (vec3(aSeed.y, aSeed.z, aSeed.w) - 0.5) * vec3(3.0, 2.0, 3.0);
          return flock.xyz + mix(twig, c + own, air);
        }
        void main() {
          float u = (aSeed.x + 0.5) / ${FLOCKS}.0;
          vec4 flock = texture2D(uFlocks, vec2(u, 0.25));
          float rate = texture2D(uFlocks, vec2(u, 0.75)).x;
          vec3 p = place(uTime, flock, flock.w);
          vec3 ahead = place(uTime + 0.25, flock, clamp(flock.w + rate * 0.25, 0.0, 1.0));
          vec3 fwd = normalize(ahead - p + vec3(0.0, 0.0, 1e-4));
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          vec3 up = cross(fwd, right);
          float beat = smoothstep(-0.2, 0.3, sin(uTime * 0.35 + 6.28 * aSeed.y));
          float crow = step(PIGEONS, hash(aSeed.x + 9.0));
          float lift = mix(0.18, sin(uTime * mix(8.0, 4.5, crow) * (0.85 + 0.3 * aSeed.z) + 6.28 * aSeed.w), beat) * 0.55;
          vec3 local = position * mix(0.75, 1.0, crow) * smoothstep(0.0, 0.05, aloft(flock.w));
          vCrow = crow;
          local.y += abs(local.x) * lift * aWing;
          local.x *= 1.0 - 0.22 * abs(lift) * aWing;
          vec3 world = p + right * local.x + up * local.y + fwd * local.z;
          vShade = 0.75 + 0.25 * aWing;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uDark;
        varying float vShade;
        varying float vCrow;
        void main() {
          gl_FragColor = vec4(
            mix(vec3(0.90, 0.91, 0.94), vec3(0.05, 0.05, 0.06), vCrow) * vShade * mix(1.0, 0.5, uDark),
            1.0
          );
        }
      `,
    });

    const geo = birdGeometry();
    geo.instanceCount = 350;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'birds';
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: material.uniforms,
      vertexShader: material.vertexShader,
      fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
    });

    this.flocks = Array.from({ length: FLOCKS }, () => ({
      state: 'new',
      timer: 0,
      perch: 0,
      rate: 0,
      anchor: new THREE.Vector3(),
      target: null,
    }));

    this.scene.add(this.mesh);
  }

  public update(
    dt: number,
    focus: THREE.Vector3,
    cameraPos: THREE.Vector3,
    sampleGround: (x: number, z: number) => number,
    dark: number
  ): void {
    this.uTime.value += dt;
    this.uDark.value = dark;

    const reach = THREE.MathUtils.clamp(cameraPos.distanceTo(focus) * 0.75, 140, 850);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pickPoint = () => {
      const rx = focus.x + rnd(-reach, reach) * 0.75;
      const rz = focus.z + rnd(-reach, reach) * 0.75;
      const gy = Math.max(4, sampleGround(rx, rz));
      return new THREE.Vector3(rx, gy + 12, rz);
    };
    const far = (p: THREE.Vector3) => Math.hypot(p.x - focus.x, p.z - focus.z) > reach * 1.6;
    const count = Math.ceil((this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount / FLOCK);

    for (let i = 0; i < count; i++) {
      const f = this.flocks[i];
      f.rate = 0;
      if (f.state === 'new') {
        f.target = pickPoint();
        f.anchor.copy(f.target);
        f.state = 'fly';
        f.perch = 0;
        f.timer = rnd(15, 75);
      } else if (f.state === 'fly') {
        f.timer -= dt;
        if (!f.target || far(f.target)) f.target = pickPoint();
        const d = f.anchor.distanceTo(f.target);
        if (d > 0.05) {
          f.anchor.lerp(f.target, Math.min(1, (CRUISE * dt) / d));
        } else if (f.timer <= 0) {
          f.state = 'land';
        }
      } else if (f.state === 'land') {
        f.rate = 1 / LAND;
        f.perch += dt / LAND;
        if (f.perch >= 1) {
          f.perch = 1;
          f.state = 'perched';
          f.timer = rnd(5, 18);
        }
      } else if (f.state === 'perched') {
        f.timer -= dt;
        if (far(f.anchor)) {
          f.target = pickPoint();
          f.anchor.copy(f.target);
        }
        if (f.timer <= 0) f.state = 'takeoff';
      } else {
        f.rate = -1 / TAKE_OFF;
        f.perch -= dt / TAKE_OFF;
        if (f.perch <= 0) {
          f.perch = 0;
          f.state = 'fly';
          f.timer = rnd(30, 85);
        }
      }
      this.data.set([f.anchor.x, f.anchor.y, f.anchor.z, f.perch], i * 4);
      this.data[(FLOCKS + i) * 4] = f.rate;
    }
    this.flockTex.needsUpdate = true;
  }
}
