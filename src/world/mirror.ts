// Planar Water Mirror: ported directly from jeantimex/tokyo/src/world/mirror.js
// Draws the San Francisco skyline, Golden Gate Bridge, and Bay Bridge upside-down below sea level (y = 0)
// into a half-resolution texture that the water shader reflects with wave ripples and Fresnel!
import * as THREE from 'three';
import { shared } from './materials';

const SCALE = 0.5;
const MAX_MIRROR_DIM = 1024;
const CLIP = 0.35;

const _rot = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Plane();
const _v4 = new THREE.Vector4();
const _q = new THREE.Vector4();

export class WaterMirror {
  public target: THREE.WebGLRenderTarget;
  private camera = new THREE.PerspectiveCamera();
  private blank: THREE.DataTexture;
  private size = new THREE.Vector2();
  private clear = new THREE.Color(0, 0, 0);
  private lastCamPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private lastCamQuat = new THREE.Quaternion();
  private frameCount = 0;
  public enabled = true;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    this.blank.needsUpdate = true;
    shared.uMirror.value = this.blank;
  }

  public update(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    waterLevel = 0.0,
    hide: (THREE.Object3D | null | undefined)[] = []
  ): void {
    if (!this.enabled || camera.position.y < waterLevel + 0.5) {
      shared.uMirrorOn.value = 0;
      return;
    }

    this.frameCount++;
    const moved =
      this.lastCamPos.distanceToSquared(camera.position) > 0.25 ||
      1 - Math.abs(this.lastCamQuat.dot(camera.quaternion)) > 1e-5;
    if (shared.uMirrorOn.value === 1 && !moved && this.frameCount % 6 !== 0) {
      return;
    }
    this.lastCamPos.copy(camera.position);
    this.lastCamQuat.copy(camera.quaternion);

    const y = waterLevel;
    const r = this.renderer;
    r.getDrawingBufferSize(this.size).multiplyScalar(SCALE).floor();
    const w = Math.min(MAX_MIRROR_DIM, Math.max(4, this.size.x));
    const h = Math.min(MAX_MIRROR_DIM, Math.max(4, this.size.y));
    if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
    }

    const cam = this.camera;
    const plane = _plane.set(_up, -y);
    _pos.setFromMatrixPosition(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot.extractRotation(camera.matrixWorld)).add(_pos);
    cam.position.set(_pos.x, 2 * y - _pos.y, _pos.z);
    cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_up);
    cam.lookAt(_look.x, 2 * y - _look.y, _look.z);
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    // Oblique near clipping plane at water surface (Lengyel's method)
    _clip.copy(plane);
    _clip.constant += CLIP;
    _clip.applyMatrix4(cam.matrixWorldInverse);
    const p = cam.projectionMatrix.elements;
    const c = _v4.set(_clip.normal.x, _clip.normal.y, _clip.normal.z, _clip.constant);
    _q.x = (Math.sign(c.x) + p[8]) / p[0];
    _q.y = (Math.sign(c.y) + p[9]) / p[5];
    _q.z = -1;
    _q.w = (1 + p[10]) / p[14];
    c.multiplyScalar(2 / c.dot(_q));
    p[2] = c.x;
    p[6] = c.y;
    p[10] = c.z + 1;
    p[14] = c.w;

    shared.uMirrorMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    const hidden = hide.filter((o): o is THREE.Object3D => !!o && o.visible);
    for (const o of hidden) o.visible = false;

    const prevTarget = r.getRenderTarget();
    const prevShadows = r.shadowMap.autoUpdate;
    const prevBackground = scene.background;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();

    shared.uMirror.value = this.blank;
    shared.uMirrorOn.value = 0;
    r.shadowMap.autoUpdate = false;
    scene.background = null;
    r.setRenderTarget(this.target);
    r.setClearColor(this.clear, 0);
    r.clear();
    r.render(scene, cam);

    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    r.shadowMap.autoUpdate = prevShadows;
    scene.background = prevBackground;
    for (const o of hidden) o.visible = true;

    shared.uMirror.value = this.target.texture;
    shared.uMirrorOn.value = 1;
  }
}
