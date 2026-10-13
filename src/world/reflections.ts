// Screen-space reflections for window glass panes and Bay water: ported directly from jeantimex/tokyo/src/world/reflections.js
import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';
import { shared } from './materials';

const STEPS = 56;

const fragment = /* glsl */ `
uniform mat4 uProjection;
uniform mat4 uInverseProjection;
uniform float uStrength;
uniform mat4 uCamWorld;
uniform float uRippleTime;

float rippleNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 viewPosition(const vec2 uv, const float depth) {
  vec4 p = uInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb, 1.0);
  float pane = 1.0 - inputColor.a;
  if (pane < 0.02 || depth >= 1.0) return;

  vec3 P = viewPosition(uv, depth);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  vec3 V = normalize(P);
  if (dot(N, V) > 0.0) N = -N;
  bool water = inputColor.a < 0.02;
  if (water) {
    vec2 w = (uCamWorld * vec4(P, 1.0)).xz;
    float t = uRippleTime;
    vec2 tilt = vec2(rippleNoise(w * 0.33 + vec2(t * 0.21, t * 0.08)), rippleNoise(w * 0.33 + 17.0 + vec2(-t * 0.15, t * 0.19))) - 0.5;
    N = normalize(N + transpose(mat3(uCamWorld)) * vec3(tilt.x, 0.0, tilt.y) * 0.006);
  }
  vec3 R = reflect(V, N);
  if (R.z > -0.02 && dot(R, V) < 0.0) return;

  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = 1.5 + jitter * (water ? 0.15 : 1.0), growth = water ? 1.12 : 1.24;
  vec2 hit = vec2(-1.0);
  float last = 0.0;
  for (int i = 0; i < ${STEPS}; i++) {
    vec3 Q = P + R * t;
    if (Q.z > -1.0) break;
    vec4 c = uProjection * vec4(Q, 1.0);
    vec2 q = c.xy / c.w * 0.5 + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
    float d = readDepth(q);
    if (d < 1.0) {
      float sceneZ = viewPosition(q, d).z, behind = sceneZ - Q.z;
      if (behind > 0.0 && behind < max(3.0, (t - last) * (water ? 1.1 : 1.5))) {
        float lo = last, hi = t;
        for (int k = 0; k < 8; k++) {
          float mid = 0.5 * (lo + hi);
          vec3 M = P + R * mid;
          vec4 mc = uProjection * vec4(M, 1.0);
          vec2 mq = mc.xy / mc.w * 0.5 + 0.5;
          if (viewPosition(mq, readDepth(mq)).z - M.z > 0.0) hi = mid; else lo = mid;
          q = mq;
        }
        hit = q;
        break;
      }
    }
    last = t;
    t = t * growth + 0.5;
  }
  if (hit.x < 0.0) return;

  float fresnel = (water ? 0.72 : 0.3) + (water ? 0.28 : 0.7) * pow(1.0 - max(dot(-V, N), 0.0), 3.0);
  vec2 edge = smoothstep(vec2(0.0), vec2(0.08), hit) * (1.0 - smoothstep(vec2(0.92), vec2(1.0), hit));
  float k = pane * fresnel * edge.x * edge.y * uStrength;
  vec3 seen = texture2D(inputBuffer, hit).rgb * (water ? vec3(0.9, 0.94, 0.96) : vec3(1.0));
  outputColor.rgb = mix(inputColor.rgb, seen, clamp(k, 0.0, 1.0));
}
`;

export class WindowReflections extends Effect {
  constructor(camera: THREE.Camera) {
    super('WindowReflections', fragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform<any>>([
        ['uProjection', new THREE.Uniform(camera.projectionMatrix)],
        ['uInverseProjection', new THREE.Uniform(camera.projectionMatrixInverse)],
        ['uStrength', new THREE.Uniform(1)],
        ['uCamWorld', new THREE.Uniform(camera.matrixWorld)],
        ['uRippleTime', shared.uTime as unknown as THREE.Uniform<any>],
      ]),
    });
  }

  get strength(): number {
    return this.uniforms.get('uStrength')!.value;
  }
  set strength(v: number) {
    this.uniforms.get('uStrength')!.value = v;
  }
}
