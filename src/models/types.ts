import * as THREE from 'three';

export interface BridgeCorridor {
  cx: number;
  cz: number;
  cosA: number;
  sinA: number;
  halfWidth: number;
  halfLength: number;
  deckY: number;
  camberM: number;
  getDeckY?: (zLocal: number) => number;
}

export interface BridgeCar {
  mesh: THREE.Group;
  corridor: BridgeCorridor;
  laneX: number;
  zLocal: number;
  speed: number;
  dir: number;
}

export interface EmissiveBeacon {
  mesh: THREE.Mesh;
  baseColor: THREE.Color;
  pulseSpeed?: number;
  phase?: number;
}

export class ModelContext {
  public readonly group = new THREE.Group();
  public satMaterials: THREE.MeshStandardMaterial[] = [];
  private matCache = new Map<string, THREE.MeshStandardMaterial>();
  public emissiveMeshes: EmissiveBeacon[] = [];
  public bridgeCorridors: BridgeCorridor[] = [];
  public bridgeCars: BridgeCar[] = [];
  public salesforceCrownMat?: THREE.ShaderMaterial;
  public alcatrazBeam?: THREE.Mesh;

  constructor(public readonly sampleGround: (x: number, z: number) => number) {}

  public mat(
    satHex: string,
    vecHex = '#FFFFFF',
    roughness = 0.55,
    metalness = 0.15
  ): THREE.MeshStandardMaterial {
    const key = `${satHex}|${vecHex}|${roughness.toFixed(3)}|${metalness.toFixed(3)}`;
    const cached = this.matCache.get(key);
    if (cached) return cached;

    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(satHex),
      roughness,
      metalness,
    });
    m.userData = {
      satColor: new THREE.Color(satHex),
      vecColor: new THREE.Color(vecHex),
    };
    this.matCache.set(key, m);
    this.satMaterials.push(m);
    return m;
  }

  public addBeacon(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    hex: number,
    radius = 1.6,
    pulseSpeed = 0,
    phase = 0
  ): void {
    const baseColor = new THREE.Color(hex);
    const mat = new THREE.MeshBasicMaterial({ color: baseColor.clone() });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    this.emissiveMeshes.push({ mesh, baseColor, pulseSpeed, phase });
  }

  public addStrutBetween(
    parent: THREE.Object3D,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    material: THREE.Material
  ): void {
    const len = a.distanceTo(b);
    if (len < 0.05) return;
    const geo = new THREE.CylinderGeometry(radius, radius, len, 6);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(a).lerp(b, 0.5);
    const dir = b.clone().sub(a).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.castShadow = true;
    parent.add(mesh);
  }

  public spawnBridgeTraffic(
    bridgeGroup: THREE.Group,
    corridor: BridgeCorridor,
    carCount: number
  ): void {
    const carColors = [0xf5f7fa, 0x2b3038, 0xd93829, 0x2868c7, 0xe8b838, 0x7c858e];
    const carMatPool = carColors.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.4 })
    );
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d6 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2211 });
    const activeCount = Math.max(8, Math.round(carCount * 0.55));

    for (let i = 0; i < activeCount; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const laneIdx = (i % 3) + 1;
      const laneX = dir * (2.0 + laneIdx * 2.7);
      const zLocal = ((i / activeCount) * 2 - 1) * corridor.halfLength * 0.92;

      const car = new THREE.Group();
      const bodyMat = carMatPool[i % carMatPool.length];
      const isBus = i % 7 === 0;
      const len = isBus ? 11.5 : 4.8;
      const h = isBus ? 3.1 : 1.55;

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, h, len), bodyMat);
      chassis.position.y = h * 0.5 + 0.5;
      car.add(chassis);

      const frontZ = dir * (len * 0.5 + 0.1);
      const backZ = -dir * (len * 0.5 + 0.1);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.2), headMat);
      hl.position.set(0, 0.9, frontZ);
      car.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.2), tailMat);
      tl.position.set(0, 0.9, backZ);
      car.add(tl);

      bridgeGroup.add(car);
      this.bridgeCars.push({
        mesh: car,
        corridor,
        laneX,
        zLocal,
        speed: 24 + (i % 5) * 3.5,
        dir,
      });
    }
  }

  public optimizeStaticMeshes(): void {
    this.group.updateMatrixWorld(true);

    // 1. Batch steady (non-pulsing) emissive beacons by color into 1 draw call per color
    const steadyByColor = new Map<number, EmissiveBeacon[]>();
    const remainingBeacons: EmissiveBeacon[] = [];
    for (const item of this.emissiveMeshes) {
      if (!item.pulseSpeed) {
        const hex = item.baseColor.getHex();
        let arr = steadyByColor.get(hex);
        if (!arr) {
          arr = [];
          steadyByColor.set(hex, arr);
        }
        arr.push(item);
      } else {
        remainingBeacons.push(item);
      }
    }

    for (const [hex, items] of steadyByColor.entries()) {
      if (items.length < 2) {
        remainingBeacons.push(...items);
        continue;
      }
      const baked: THREE.BufferGeometry[] = [];
      let totalVerts = 0;
      for (const it of items) {
        const g = it.mesh.geometry.index ? it.mesh.geometry.toNonIndexed() : it.mesh.geometry.clone();
        g.applyMatrix4(it.mesh.matrixWorld);
        baked.push(g);
        totalVerts += g.attributes.position.count;
        it.mesh.parent?.remove(it.mesh);
      }
      const posArr = new Float32Array(totalVerts * 3);
      let off = 0;
      for (const g of baked) {
        const p = g.attributes.position as THREE.BufferAttribute;
        posArr.set(p.array as Float32Array, off * 3);
        off += p.count;
        g.dispose();
      }
      const mergedGeo = new THREE.BufferGeometry();
      mergedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      mergedGeo.computeBoundingSphere();
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex) });
      const mergedMesh = new THREE.Mesh(mergedGeo, mat);
      this.group.add(mergedMesh);
      remainingBeacons.push({ mesh: mergedMesh, baseColor: new THREE.Color(hex), pulseSpeed: 0, phase: 0 });
    }
    this.emissiveMeshes = remainingBeacons;

    // 2. Batch static MeshStandardMaterial meshes across the entire landmark scene by material & shadow flags
    const dynamicObjects = new Set<THREE.Object3D>();
    if (this.alcatrazBeam) dynamicObjects.add(this.alcatrazBeam);
    for (const item of this.emissiveMeshes) dynamicObjects.add(item.mesh);
    for (const car of this.bridgeCars) {
      car.mesh.traverse((child) => dynamicObjects.add(child));
    }

    const buckets = new Map<
      string,
      {
        mat: THREE.MeshStandardMaterial;
        castShadow: boolean;
        receiveShadow: boolean;
        meshes: THREE.Mesh[];
      }
    >();

    this.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (dynamicObjects.has(obj)) return;
      if (!(obj.material instanceof THREE.MeshStandardMaterial)) return;
      if (obj.geometry.attributes.color) return;
      if (!obj.geometry.attributes.position || !obj.geometry.attributes.normal) return;

      const key = `${obj.material.uuid}|${obj.castShadow ? 1 : 0}|${obj.receiveShadow ? 1 : 0}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          mat: obj.material,
          castShadow: obj.castShadow,
          receiveShadow: obj.receiveShadow,
          meshes: [],
        };
        buckets.set(key, bucket);
      }
      bucket.meshes.push(obj);
    });

    for (const bucket of buckets.values()) {
      if (bucket.meshes.length < 2) continue;

      const bakedGeos: THREE.BufferGeometry[] = [];
      let totalVerts = 0;

      for (const m of bucket.meshes) {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        bakedGeos.push(g);
        totalVerts += g.attributes.position.count;
      }

      const posArr = new Float32Array(totalVerts * 3);
      const normArr = new Float32Array(totalVerts * 3);
      let offset = 0;
      for (const g of bakedGeos) {
        const pos = g.attributes.position as THREE.BufferAttribute;
        const norm = g.attributes.normal as THREE.BufferAttribute;
        posArr.set(pos.array as Float32Array, offset * 3);
        normArr.set(norm.array as Float32Array, offset * 3);
        offset += pos.count;
        g.dispose();
      }

      const mergedGeo = new THREE.BufferGeometry();
      mergedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      mergedGeo.computeBoundingSphere();

      const mergedMesh = new THREE.Mesh(mergedGeo, bucket.mat);
      mergedMesh.castShadow = bucket.castShadow;
      mergedMesh.receiveShadow = bucket.receiveShadow;
      this.group.add(mergedMesh);

      for (const m of bucket.meshes) {
        m.parent?.remove(m);
      }
    }
  }
}
