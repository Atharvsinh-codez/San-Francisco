// CityLandmarks.ts — Dedicated 3D Models for San Francisco's Iconic Towers, Civic Monuments & Waterfront Landmarks
// Includes: Salesforce Tower, Transamerica Pyramid, Coit Tower, Sutro Tower, Palace of Fine Arts,
// Ferry Building, Alcatraz Island + rotating lighthouse beam, Oracle Park, Chase Center,
// San Francisco City Hall, Grace Cathedral, Painted Ladies, Lombard Street Crooked Block, Pier 39, Twin Peaks Lookout.

import * as THREE from 'three';
import { latLonToENU } from '../world/coords';
import type { ModelContext } from './types';

export function buildCityLandmarks(ctx: ModelContext): void {
  buildSalesforceTower(ctx);
  buildTransamericaPyramid(ctx);
  buildCoitTower(ctx);
  buildSutroTower(ctx);
  buildPalaceOfFineArts(ctx);
  buildFerryBuilding(ctx);
  buildAlcatraz(ctx);
  buildOraclePark(ctx);
  buildChaseCenter(ctx);
  buildCityHall(ctx);
  buildGraceCathedral(ctx);
  buildPaintedLadies(ctx);
  buildLombardCrookedBlock(ctx);
  buildPier39(ctx);
  buildTwinPeaksLookout(ctx);
}

function buildSalesforceTower(ctx: ModelContext): void {
  const enu = latLonToENU(37.7897, -122.3969);
  const baseY = Math.max(2, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (9 * Math.PI) / 180;

  const glassMat = ctx.mat('#4F7C9E', '#FFFFFF', 0.08, 0.88);
  const finMat = ctx.mat('#E6ECF2', '#E8E4DD', 0.28, 0.56);

  const totalH = 326.0;
  const crownH = 42.0;
  const bodyH = totalH - crownH;

  const tiers = 22;
  const tierH = bodyH / tiers;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const t1 = (i + 1) / tiers;
    // Soft obelisk curve tapering gracefully toward the crown
    const r0 = 28.5 * (1 - Math.pow(t0, 1.35) * 0.29);
    const r1 = 28.5 * (1 - Math.pow(t1, 1.35) * 0.29);
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, tierH + 0.25, 20),
      glassMat
    );
    seg.position.y = i * tierH + tierH * 0.5;
    seg.castShadow = true;
    seg.receiveShadow = true;
    g.add(seg);

    // Brushed aluminum horizontal sunshade spandrel sill
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(r0 + 0.42, r0 + 0.42, 0.72, 20),
      finMat
    );
    ring.position.y = i * tierH;
    g.add(ring);
  }

  // Vertical aluminum mullions hugging the tapered body (3 chords per mullion track the curve)
  const radiusAt = (t: number) => 28.5 * (1 - Math.pow(t, 1.35) * 0.29);
  for (let m = 0; m < 16; m++) {
    const a = (m / 16) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3;
      const t1 = (k + 1) / 3;
      const r0 = radiusAt(t0) + 0.2;
      const r1 = radiusAt(t1) + 0.2;
      ctx.addStrutBetween(
        g,
        new THREE.Vector3(ca * r0, t0 * bodyH, sa * r0),
        new THREE.Vector3(ca * r1, t1 * bodyH, sa * r1),
        0.38,
        finMat
      );
    }
  }

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(29.5, 30.8, 16, 20), finMat);
  plinth.position.y = 4;
  g.add(plinth);

  ctx.salesforceCrownMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNightFactor: { value: 0 },
      uModeVector: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uNightFactor;
      uniform float uModeVector;
      void main() {
        vec3 dayCol = uModeVector > 0.5 ? vec3(0.96, 0.95, 0.93) : vec3(0.76, 0.86, 0.95);
        float ribs = 0.85 + 0.15 * sin(vUv.x * 64.0);
        float wave = 0.5 + 0.5 * sin(vUv.y * 12.0 - uTime * 2.2 + sin(vUv.x * 18.0) * 1.5);
        vec3 ledCol = mix(vec3(0.22, 0.64, 1.0), vec3(0.98, 0.56, 0.90), wave) * ribs;
        vec3 col = mix(dayCol * ribs, ledCol, clamp(uNightFactor * 1.25, 0.15, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(16.2, 20.4, crownH, 20),
    ctx.salesforceCrownMat
  );
  crown.position.y = bodyH + crownH * 0.5;
  g.add(crown);

  ctx.group.add(g);
}

function buildTransamericaPyramid(ctx: ModelContext): void {
  const enu = latLonToENU(37.7952, -122.4028);
  const baseY = Math.max(2, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (9 * Math.PI) / 180;

  const quartzMat = ctx.mat('#F2EDE4', '#FFFFFF', 0.55, 0.08);
  const wingMat = ctx.mat('#E2DCD0', '#E8E4DD', 0.62, 0.08);
  const darkWindowMat = ctx.mat('#1E2A36', '#9CA6B0', 0.12, 0.82);
  const spireMat = ctx.mat('#D4E6F7', '#F5F3EE', 0.20, 0.68);
  const redwoodMat = ctx.mat('#2F5A36', '#7EB082', 0.88, 0.0);

  // Iconic perimeter structural space-frame K-truss base (floors 1-4)
  const baseCore = new THREE.Mesh(new THREE.BoxGeometry(38, 20, 38), darkWindowMat);
  baseCore.position.y = 10;
  g.add(baseCore);

  const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(50, 3.2, 50), quartzMat);
  basePlinth.position.y = 1.6;
  g.add(basePlinth);

  const collarBeam = new THREE.Mesh(new THREE.BoxGeometry(49, 2.8, 49), quartzMat);
  collarBeam.position.y = 19.5;
  g.add(collarBeam);

  // Diagonal K-truss struts around all 4 sides of the Transamerica base
  for (const rot of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const face = new THREE.Group();
    face.rotation.y = rot;
    for (let k = -1; k <= 1; k++) {
      const xCenter = k * 14.5;
      const topMid = new THREE.Vector3(xCenter, 19.2, 23.5);
      const botL = new THREE.Vector3(xCenter - 7.0, 2.2, 23.5);
      const botR = new THREE.Vector3(xCenter + 7.0, 2.2, 23.5);
      ctx.addStrutBetween(face, botL, topMid, 0.72, quartzMat);
      ctx.addStrutBetween(face, botR, topMid, 0.72, quartzMat);
    }
    g.add(face);
  }

  const mainBodyH = 192;
  const bodyGeo = new THREE.CylinderGeometry(10.5, 35.5, mainBodyH, 4);
  bodyGeo.rotateY(Math.PI / 4);
  const body = new THREE.Mesh(bodyGeo, quartzMat);
  body.position.y = 20 + mainBodyH * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Horizontal window band courses stepped up the pyramid
  for (let fl = 1; fl <= 22; fl++) {
    const t = fl / 23;
    const y = 22 + t * (mainBodyH - 6);
    const r = (35.5 * (1 - t) + 10.5 * t) * 1.008;
    const bandGeo = new THREE.CylinderGeometry(r - 0.35, r, 1.9, 4);
    bandGeo.rotateY(Math.PI / 4);
    const band = new THREE.Mesh(bandGeo, darkWindowMat);
    band.position.y = y;
    g.add(band);
  }

  // East & West elevator/stair wings (starting at 29th floor up to the spire base)
  const wingLeft = new THREE.Mesh(new THREE.BoxGeometry(10.5, 132, 12.5), wingMat);
  wingLeft.position.set(-15.5, 146, 0);
  wingLeft.castShadow = true;
  g.add(wingLeft);

  const wingRight = new THREE.Mesh(new THREE.BoxGeometry(10.5, 132, 12.5), wingMat);
  wingRight.position.set(15.5, 146, 0);
  wingRight.castShadow = true;
  g.add(wingRight);

  const spireGeo = new THREE.ConeGeometry(10.5, 48, 4);
  spireGeo.rotateY(Math.PI / 4);
  const spire = new THREE.Mesh(spireGeo, spireMat);
  spire.position.y = 212 + 24;
  g.add(spire);

  // Transamerica Redwood Park on the east side of the pyramid
  for (let tx = 28; tx <= 46; tx += 7.5) {
    for (let tz = -18; tz <= 18; tz += 8.5) {
      const rw = new THREE.Mesh(new THREE.ConeGeometry(3.2, 18, 7), redwoodMat);
      rw.position.set(tx, 10, tz);
      rw.castShadow = true;
      g.add(rw);
    }
  }

  // Famous "Crown Jewel" beacon at the 260m pinnacle
  ctx.addBeacon(g, 0, 260.5, 0, 0xfff4cc, 2.4);
  ctx.group.add(g);
}

function buildCoitTower(ctx: ModelContext): void {
  const enu = latLonToENU(37.8024, -122.4058);
  const baseY = Math.max(5, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);

  const concreteMat = ctx.mat('#F7F4EE', '#FFFFFF', 0.64, 0.05);
  const trimMat = ctx.mat('#E0DBD2', '#E8E4DD', 0.72, 0.05);
  const windowMat = ctx.mat('#26323E', '#8E9AA6', 0.2, 0.7);
  const roadMat = ctx.mat('#3A3F47', '#DCD8D0', 0.82, 0.05);
  const bronzeMat = ctx.mat('#4A6856', '#7A9684', 0.45, 0.55);

  // Pioneer Park circular turnaround drive & parapet wall atop Telegraph Hill
  const turnaround = new THREE.Mesh(new THREE.CylinderGeometry(28, 31, 6, 32), roadMat);
  turnaround.position.y = -1;
  g.add(turnaround);

  const basePlaza = new THREE.Mesh(new THREE.CylinderGeometry(19, 21, 9, 24), trimMat);
  basePlaza.position.y = 3.5;
  basePlaza.castShadow = true;
  g.add(basePlaza);

  const rotundaLobby = new THREE.Mesh(new THREE.BoxGeometry(22, 7.5, 22), concreteMat);
  rotundaLobby.position.y = 6.5;
  rotundaLobby.castShadow = true;
  g.add(rotundaLobby);

  // Columbus statue pedestal in the center of the Pioneer Park turnaround
  const statuePed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.2, 2.8), trimMat);
  statuePed.position.set(0, 4.0, 22);
  g.add(statuePed);
  const statueFig = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 3.2, 8), bronzeMat);
  statueFig.position.set(0, 7.6, 22);
  g.add(statueFig);

  // 24-fluted Art Deco concrete column shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.6, 48, 24), concreteMat);
  shaft.position.y = 8 + 24;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const flute = new THREE.Mesh(new THREE.BoxGeometry(0.55, 46, 0.65), trimMat);
    flute.position.set(Math.cos(a) * 7.1, 31.5, Math.sin(a) * 7.1);
    flute.rotation.y = -a;
    g.add(flute);
  }

  // Belvedere observation gallery with arched viewing windows
  const belvedere = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 6.2, 16), trimMat);
  belvedere.position.y = 56;
  g.add(belvedere);

  const belvedereGlass = new THREE.Mesh(new THREE.CylinderGeometry(7.55, 7.55, 2.6, 16), windowMat);
  belvedereGlass.position.y = 56.2;
  g.add(belvedereGlass);

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.6, 5.5, 16), concreteMat);
  lantern.position.y = 61.5;
  g.add(lantern);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 4.9, 2.2, 16), trimMat);
  cap.position.y = 65.2;
  g.add(cap);

  ctx.addBeacon(g, 0, 58, 0, 0xffe6a8, 1.8);
  ctx.group.add(g);
}

function buildSutroTower(ctx: ModelContext): void {
  const enu = latLonToENU(37.7552, -122.4528);
  const baseY = Math.max(10, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);

  const redMat = ctx.mat('#E03B2B', '#D94B38', 0.48, 0.3);
  const whiteMat = ctx.mat('#F8F9FA', '#FFFFFF', 0.48, 0.25);

  const baseRadius = 32;
  const waistRadius = 11.5;
  const waistY = 172;
  const topDeckRadius = 18.5;
  const topDeckY = 232;
  const spireTopY = 297.8;

  const legAngles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  const basePts = legAngles.map(
    (a) => new THREE.Vector3(Math.cos(a) * baseRadius, -4, Math.sin(a) * baseRadius)
  );
  const waistPts = legAngles.map(
    (a) => new THREE.Vector3(Math.cos(a) * waistRadius, waistY, Math.sin(a) * waistRadius)
  );
  const topPts = legAngles.map(
    (a) => new THREE.Vector3(Math.cos(a) * topDeckRadius, topDeckY, Math.sin(a) * topDeckRadius)
  );

  for (let i = 0; i < 3; i++) {
    const segs = 5;
    for (let s = 0; s < segs; s++) {
      const a = basePts[i].clone().lerp(waistPts[i], s / segs);
      const b = basePts[i].clone().lerp(waistPts[i], (s + 1) / segs);
      ctx.addStrutBetween(g, a, b, 2.2, s % 2 === 0 ? redMat : whiteMat);
    }

    ctx.addStrutBetween(g, waistPts[i], topPts[i], 1.8, redMat);

    const spireTop = new THREE.Vector3(topPts[i].x, spireTopY, topPts[i].z);
    ctx.addStrutBetween(g, topPts[i], spireTop, 0.9, whiteMat);
    ctx.addBeacon(g, spireTop.x, spireTopY + 1.5, spireTop.z, 0xff2211, 2.0);
  }

  const ringLevels = [
    { f: 0.34, lower: true },
    { f: 0.67, lower: true },
    { f: 1.0, lower: true },
    { f: 0.5, lower: false },
    { f: 1.0, lower: false },
  ];

  for (const lvl of ringLevels) {
    const pts = [0, 1, 2].map((i) =>
      lvl.lower
        ? basePts[i].clone().lerp(waistPts[i], lvl.f)
        : waistPts[i].clone().lerp(topPts[i], lvl.f)
    );
    for (let i = 0; i < 3; i++) {
      ctx.addStrutBetween(g, pts[i], pts[(i + 1) % 3], 1.5, lvl.f === 1.0 ? whiteMat : redMat);
    }
  }

  ctx.group.add(g);
}

function buildPalaceOfFineArts(ctx: ModelContext): void {
  const enu = latLonToENU(37.8029, -122.4484);
  const baseY = Math.max(2, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);

  const travertineMat = ctx.mat('#E6CBA5', '#FFFFFF', 0.65, 0.05);
  const darkStoneMat = ctx.mat('#C9AA82', '#E2DCD2', 0.72, 0.05);
  const domeMat = ctx.mat('#D49B6A', '#E8E4DD', 0.58, 0.08);

  // Stepped Rotunda podium (the lagoon itself comes from the baked water layer)
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(23, 25.5, 4.8, 16), travertineMat);
  plinth.position.y = 1.6;
  plinth.receiveShadow = true;
  g.add(plinth);

  // Paired Corinthian columns & 8 grand Roman arch piers around the Rotunda
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 18.8;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;

    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, 2.6), darkStoneMat);
    ped.position.set(cx, 5.2, cz);
    ped.rotation.y = -a;
    g.add(ped);

    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.12, 18.5, 12), travertineMat);
    col.position.set(cx, 16.2, cz);
    col.castShadow = true;
    g.add(col);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 2.4), darkStoneMat);
    cap.position.set(cx, 25.8, cz);
    cap.rotation.y = -a;
    g.add(cap);
  }

  // Sculpted attic drum with frieze panels and weeping-maiden corner planters
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(19.6, 20.2, 7.6, 16), travertineMat);
  drum.position.y = 29.8;
  drum.castShadow = true;
  g.add(drum);

  const cornice = new THREE.Mesh(new THREE.CylinderGeometry(20.8, 20.4, 1.6, 16), darkStoneMat);
  cornice.position.y = 33.8;
  g.add(cornice);

  // Terracotta coffered dome with 16 radial ribs & crown oculus ring
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(18.6, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48),
    domeMat
  );
  dome.position.y = 33.5;
  dome.castShadow = true;
  g.add(dome);

  const oculus = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.8, 16), travertineMat);
  oculus.position.y = 51.6;
  g.add(oculus);

  // Two curved peristyle wings north and south of the Rotunda, wrapping the lagoon.
  // Centroids, axes and length come from the DataSF footprints of the real colonnades.
  // The exhibition hall behind them stays as the regular extruded footprint.
  const lagoonCenter = { x: 45, z: 0 };
  const wings = [
    { cx: 7, cz: 59, axisDeg: 38 },
    { cx: -12, cz: -66, axisDeg: -57 },
  ];
  const halfLen = 50;
  const sag = 14;
  const rowOffset = 4.2;
  const steps = 22;
  for (const w of wings) {
    const a = (w.axisDeg * Math.PI) / 180;
    const ax = Math.cos(a);
    const az = Math.sin(a);
    let nx = -az;
    let nz = ax;
    if (nx * (lagoonCenter.x - w.cx) + nz * (lagoonCenter.z - w.cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    // Ends sit closer to the lagoon than the middle, so the wing is concave toward the water.
    const at = (s: number) => {
      const bow = -sag * (1 - s * s - 2 / 3);
      return new THREE.Vector2(w.cx + ax * halfLen * s + nx * bow, w.cz + az * halfLen * s + nz * bow);
    };

    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * 2 - 1;
      const p = at(s);
      for (const side of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 20, 10), travertineMat);
        col.position.set(p.x + nx * rowOffset * side, 11, p.y + nz * rowOffset * side);
        col.castShadow = true;
        g.add(col);
      }

      if (i % 3 === 0) {
        const urn = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.6, 3.0), darkStoneMat);
        urn.position.set(p.x, 24.2, p.y);
        urn.rotation.y = -a;
        urn.castShadow = true;
        g.add(urn);
      }

      if (i < steps) {
        const q = at(((i + 1) / steps) * 2 - 1);
        const len = p.distanceTo(q);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 2.4, rowOffset * 2 + 2.4), travertineMat);
        beam.position.set((p.x + q.x) * 0.5, 21.5, (p.y + q.y) * 0.5);
        beam.rotation.y = -Math.atan2(q.y - p.y, q.x - p.x);
        beam.castShadow = true;
        g.add(beam);
      }
    }
  }

  ctx.addBeacon(g, 0, 22, 0, 0xffd28a, 2.2);
  ctx.group.add(g);
}

function buildFerryBuilding(ctx: ModelContext): void {
  const enu = latLonToENU(37.7955, -122.3937);
  const baseY = Math.max(2.5, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (34 * Math.PI) / 180;

  const stoneMat = ctx.mat('#EFEAE0', '#FFFFFF', 0.60, 0.08);
  const trimMat = ctx.mat('#D8D1C4', '#E6E2DA', 0.68, 0.08);
  const roofMat = ctx.mat('#627480', '#E8E4DD', 0.48, 0.25);
  const archGlassMat = ctx.mat('#233442', '#8FA0AE', 0.14, 0.82);
  const pierDeckMat = ctx.mat('#C9C2B4', '#E2DDD2', 0.82, 0.05);

  // Waterfront ferry apron & 3 historic ferry slips extending into the Bay (+X)
  const apron = new THREE.Mesh(new THREE.BoxGeometry(58, 3.4, 214), pierDeckMat);
  apron.position.set(14, -0.5, 0);
  apron.receiveShadow = true;
  g.add(apron);

  for (const sz of [-64, 0, 64]) {
    const slip = new THREE.Mesh(new THREE.BoxGeometry(46, 3.0, 14), pierDeckMat);
    slip.position.set(54, -0.6, sz);
    g.add(slip);
  }

  // 200 m Beaux-Arts Marketplace Nave
  const nave = new THREE.Mesh(new THREE.BoxGeometry(26, 16.5, 198), stoneMat);
  nave.position.y = 8.25;
  nave.castShadow = true;
  nave.receiveShadow = true;
  g.add(nave);

  // Repeating Beaux-Arts ground-floor & second-story arched window bays along West & East facades
  for (let z = -90; z <= 90; z += 9) {
    if (Math.abs(z) < 12) continue;
    const bayGlass = new THREE.Mesh(new THREE.BoxGeometry(26.6, 11.5, 4.8), archGlassMat);
    bayGlass.position.set(0, 7.2, z);
    g.add(bayGlass);

    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(27.2, 15.5, 1.4), trimMat);
    pilaster.position.set(0, 8.0, z + 4.5);
    g.add(pilaster);
  }

  // Grand central triple-arch entry portal facing Market Street
  const portal = new THREE.Mesh(new THREE.BoxGeometry(29.5, 18.5, 24), trimMat);
  portal.position.set(0, 9.25, 0);
  portal.castShadow = true;
  g.add(portal);

  // Continuous skylights & gabled roof ridge
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(9, 13.5, 196, 4), roofMat);
  gable.rotation.x = Math.PI / 2;
  gable.rotation.z = Math.PI / 4;
  gable.position.y = 18.5;
  g.add(gable);

  // 75 m (245 ft) Seville Giralda-inspired Clock Tower
  const towerShaft = new THREE.Mesh(new THREE.BoxGeometry(10.8, 48, 10.8), stoneMat);
  towerShaft.position.y = 16 + 24;
  towerShaft.castShadow = true;
  towerShaft.receiveShadow = true;
  g.add(towerShaft);

  for (const cy of [28, 40, 51, 63]) {
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(11.8, 1.2, 11.8), trimMat);
    cornice.position.y = cy;
    g.add(cornice);
  }

  // 4 Illuminated Clock Faces with Roman dial markings & hands at y = 55m
  const dialCanvas = document.createElement('canvas');
  dialCanvas.width = dialCanvas.height = 128;
  const dctx = dialCanvas.getContext('2d')!;
  dctx.fillStyle = '#fdf8ec';
  dctx.beginPath();
  dctx.arc(64, 64, 58, 0, Math.PI * 2);
  dctx.fill();
  dctx.lineWidth = 5;
  dctx.strokeStyle = '#2b2620';
  dctx.stroke();
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    dctx.beginPath();
    dctx.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
    dctx.lineTo(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53);
    dctx.stroke();
  }
  dctx.lineWidth = 4;
  dctx.beginPath();
  dctx.moveTo(64, 64);
  dctx.lineTo(64, 26);
  dctx.moveTo(64, 64);
  dctx.lineTo(92, 64);
  dctx.stroke();
  const dialTex = new THREE.CanvasTexture(dialCanvas);
  dialTex.colorSpace = THREE.SRGBColorSpace;
  const dialMat = new THREE.MeshBasicMaterial({ map: dialTex });

  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(3.5, 24), dialMat);
    face.position.set(Math.sin(ang) * 5.55, 55.5, Math.cos(ang) * 5.55);
    face.rotation.y = ang;
    g.add(face);
  }

  const belfry = new THREE.Mesh(new THREE.BoxGeometry(8.4, 11, 8.4), stoneMat);
  belfry.position.y = 65;
  belfry.castShadow = true;
  g.add(belfry);

  const belfryArch = new THREE.Mesh(new THREE.BoxGeometry(8.7, 6.2, 4.2), archGlassMat);
  belfryArch.position.y = 65;
  g.add(belfryArch);

  const cupola = new THREE.Mesh(new THREE.SphereGeometry(4.3, 14, 12), roofMat);
  cupola.position.y = 72;
  g.add(cupola);

  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 6.5, 8), roofMat);
  spire.position.y = 77.5;
  g.add(spire);

  ctx.addBeacon(g, 0, 55.5, 0, 0xfff1c0, 2.2);
  ctx.group.add(g);
}

function buildAlcatraz(ctx: ModelContext): void {
  const enu = latLonToENU(37.8267, -122.4230);
  const baseY = Math.max(18, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (-32 * Math.PI) / 180;

  const rockMat = ctx.mat('#A89882', '#DED8CE', 0.88, 0.02);
  const concreteMat = ctx.mat('#E5DED0', '#FFFFFF', 0.72, 0.05);
  const roofMat = ctx.mat('#7D6E60', '#E8E4DD', 0.78, 0.05);
  const whiteMat = ctx.mat('#F8F6F0', '#FFFFFF', 0.5, 0.1);
  const brickMat = ctx.mat('#9E4A38', '#D8C8BE', 0.78, 0.05);
  const windowMat = ctx.mat('#2A3540', '#96A0AA', 0.25, 0.6);

  // Steep sandstone citadel terrace & perimeter retaining wall
  const citadel = new THREE.Mesh(new THREE.BoxGeometry(54, 14, 152), rockMat);
  citadel.position.set(0, -5, 6);
  citadel.receiveShadow = true;
  g.add(citadel);

  // Main Cellhouse (Blocks A, B, C, D) with tall barred window bays
  const cellhouse = new THREE.Mesh(new THREE.BoxGeometry(36, 16, 106), concreteMat);
  cellhouse.position.set(0, 8, 0);
  cellhouse.castShadow = true;
  cellhouse.receiveShadow = true;
  g.add(cellhouse);

  for (let z = -42; z <= 42; z += 10.5) {
    const winBay = new THREE.Mesh(new THREE.BoxGeometry(36.6, 9.5, 4.2), windowMat);
    winBay.position.set(0, 8.8, z);
    g.add(winBay);
  }

  const cellRoof = new THREE.Mesh(new THREE.BoxGeometry(37.4, 2.2, 107.4), roofMat);
  cellRoof.position.set(0, 16.8, 0);
  g.add(cellRoof);

  // Warden's House shell & Administration wing on the south-east end
  const warden = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 18), concreteMat);
  warden.position.set(12, 6, 62);
  warden.castShadow = true;
  g.add(warden);

  // Guard Tower & Building 64 barracks near the ferry dock on the east shore
  const barracks = new THREE.Mesh(new THREE.BoxGeometry(18, 11, 44), brickMat);
  barracks.position.set(28, -2, 34);
  barracks.castShadow = true;
  g.add(barracks);

  const dockPier = new THREE.Mesh(new THREE.BoxGeometry(24, 3, 32), concreteMat);
  dockPier.position.set(44, -baseY + 2.2, 42);
  g.add(dockPier);

  const guardTower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 14, 8), concreteMat);
  guardTower.position.set(36, 5, 52);
  g.add(guardTower);

  // Historic 26 m octagonal Alcatraz Lighthouse & rotating beacon
  const lhKeeper = new THREE.Mesh(new THREE.BoxGeometry(12, 7.5, 14), whiteMat);
  lhKeeper.position.set(6, 3.75, 68);
  g.add(lhKeeper);

  const lhShaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 4.2, 26, 8), whiteMat);
  lhShaft.position.set(6, 13, 68);
  lhShaft.castShadow = true;
  g.add(lhShaft);

  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.0, 12), roofMat);
  gallery.position.set(6, 25.5, 68);
  g.add(gallery);

  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 4, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff5c0 })
  );
  lantern.position.set(6, 28, 68);
  g.add(lantern);

  const beamGeo = new THREE.ConeGeometry(18, 220, 16, 1, true);
  beamGeo.translate(0, -110, 0);
  beamGeo.rotateX(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff5c8,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  ctx.alcatrazBeam = new THREE.Mesh(beamGeo, beamMat);
  ctx.alcatrazBeam.position.set(6, 28, 68);
  g.add(ctx.alcatrazBeam);

  // Historic Alcatraz Water Tower on the north-west end
  const wtTank = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 9.5, 14), whiteMat);
  wtTank.position.set(-16, 23, -60);
  wtTank.castShadow = true;
  g.add(wtTank);
  const wtRoof = new THREE.Mesh(new THREE.ConeGeometry(6.0, 3.8, 14), roofMat);
  wtRoof.position.set(-16, 29.5, -60);
  g.add(wtRoof);
  const wtLegs = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 6.8, 18, 6, 1, true), roofMat);
  wtLegs.position.set(-16, 9, -60);
  g.add(wtLegs);

  ctx.group.add(g);
}

function buildOraclePark(ctx: ModelContext): void {
  // Local frame: home plate at the origin, center field along +Z, right field toward -X.
  // Home plate sits by 3rd & King; center field points ESE (bearing ~115°) and right field
  // runs along McCovey Cove.
  const DEG = Math.PI / 180;
  const center = latLonToENU(37.7786, -122.3893);
  const bearing = 115 * DEG;
  const dirX = Math.sin(bearing);
  const dirZ = -Math.cos(bearing);
  const hx = center.x - dirX * 35;
  const hz = center.z - dirZ * 35;
  const rotY = Math.atan2(dirX, dirZ);
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const toWorld = (lx: number, lz: number): [number, number] => [
    hx + lx * cosR + lz * sinR,
    hz - lx * sinR + lz * cosR,
  ];

  // Outfield fence distances in meters (339 LF, 364 LCF, 399 CF, 421 Triples Alley, 365 RCF, 309 RF)
  const fenceCtrl: [number, number][] = [
    [-45, 103.3],
    [-22, 111.0],
    [0, 121.6],
    [15, 128.3],
    [30, 111.3],
    [45, 94.2],
  ];
  const fenceDist = (a: number): number => {
    for (let i = 0; i < fenceCtrl.length - 1; i++) {
      const [a0, d0] = fenceCtrl[i];
      const [a1, d1] = fenceCtrl[i + 1];
      if (a <= a1) {
        const t = THREE.MathUtils.clamp((a - a0) / (a1 - a0), 0, 1);
        const s = t * t * (3 - 2 * t);
        return d0 + (d1 - d0) * s;
      }
    }
    return fenceCtrl[fenceCtrl.length - 1][1];
  };
  const polar = (aDeg: number, d: number): [number, number] => [
    -Math.sin(aDeg * DEG) * d,
    Math.cos(aDeg * DEG) * d,
  ];
  const fencePts: [number, number][] = [];
  for (let a = -45; a <= 45; a += 3) fencePts.push(polar(a, fenceDist(a)));

  // Sit the whole park on the highest ground sample so terrain/roads never poke through the field
  let baseY = 2.5;
  for (const [lx, lz] of [[0, 0], [0, 60], [0, 120], [70, 70], [-65, 65], [0, -70], [60, -20], [-60, -20]]) {
    const [wx, wz] = toWorld(lx, lz);
    baseY = Math.max(baseY, ctx.sampleGround(wx, wz));
  }
  baseY += 0.3;

  const g = new THREE.Group();
  g.position.set(hx, baseY, hz);
  g.rotation.y = rotY;

  // === 1. FIELD: canvas-painted turf with mowing pattern, infield dirt, base paths, lines ===
  const FX0 = -160;
  const FZ0 = -90;
  const FW = 320;
  const CANVAS = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CANVAS;
  const c2 = canvas.getContext('2d')!;
  const px = (x: number, z: number): [number, number] => [
    ((x - FX0) / FW) * CANVAS,
    ((z - FZ0) / FW) * CANVAS,
  ];
  const m = CANVAS / FW; // pixels per meter
  const pathPoly = (pts: [number, number][]) => {
    pts.forEach(([x, z], i) => {
      const [u, v] = px(x, z);
      if (i === 0) c2.moveTo(u, v);
      else c2.lineTo(u, v);
    });
    c2.closePath();
  };

  const standsCZ = 30; // seating bowl center on the CF axis
  const bowlIn = 50;
  const arc = (cz: number, r: number, f0: number, f1: number, step = 4): [number, number][] => {
    const out: [number, number][] = [];
    for (let f = f0; f <= f1 + 1e-6; f += step) {
      out.push([-Math.sin(f * DEG) * r, cz + Math.cos(f * DEG) * r]);
    }
    return out;
  };
  const rfPole = polar(45, fenceDist(45));
  const lfPole = polar(-45, fenceDist(-45));
  const fairPoly: [number, number][] = [[0, 0], ...fencePts];
  const foulPoly: [number, number][] = [
    rfPole,
    [rfPole[0] - 12, rfPole[1] - 12],
    ...arc(standsCZ, bowlIn, 80, 280),
    [lfPole[0] + 12, lfPole[1] - 12],
    lfPole,
    [0, 0],
  ];
  const concoursePoly: [number, number][] = [[0, 0]];
  for (let a = -45; a <= 45; a += 3) {
    concoursePoly.push(polar(a, a > 25 ? fenceDist(a) + 8 : 146));
  }

  c2.clearRect(0, 0, CANVAS, CANVAS);
  c2.save();
  c2.beginPath();
  pathPoly(concoursePoly);
  pathPoly(foulPoly);
  c2.clip();
  c2.fillStyle = '#b5ae a2'.replace(' ', '');
  c2.fillRect(0, 0, CANVAS, CANVAS);

  // Turf (fair + foul territory)
  c2.beginPath();
  pathPoly(fairPoly);
  pathPoly(foulPoly);
  c2.fillStyle = '#3d7a35';
  c2.fill();

  // Checkerboard mowing pattern aligned with the foul lines
  c2.save();
  c2.beginPath();
  pathPoly(fairPoly);
  pathPoly(foulPoly);
  c2.clip();
  const [hu, hv] = px(0, 0);
  for (const rot of [Math.PI / 4, -Math.PI / 4]) {
    c2.save();
    c2.translate(hu, hv);
    c2.rotate(rot);
    c2.fillStyle = 'rgba(120, 180, 95, 0.16)';
    const band = 7.5 * m;
    for (let k = -40; k < 40; k += 2) c2.fillRect(k * band, -CANVAS, band, CANVAS * 2);
    c2.restore();
  }
  c2.restore();

  // Warning track just inside the fence
  c2.save();
  c2.beginPath();
  pathPoly(fairPoly);
  c2.clip();
  c2.beginPath();
  fencePts.forEach(([x, z], i) => {
    const [u, v] = px(x, z);
    if (i === 0) c2.moveTo(u, v);
    else c2.lineTo(u, v);
  });
  c2.strokeStyle = '#9a6a48';
  c2.lineWidth = 9 * m;
  c2.stroke();

  // Infield dirt arc (95 ft from the rubber), then infield grass square
  const mound: [number, number] = [0, 18.44];
  const [mu, mv] = px(mound[0], mound[1]);
  c2.beginPath();
  c2.arc(mu, mv, 29 * m, 0, Math.PI * 2);
  c2.fillStyle = '#a8724c';
  c2.fill();
  c2.restore();

  const base = 27.43;
  const b1: [number, number] = [-base * Math.SQRT1_2, base * Math.SQRT1_2];
  const b2: [number, number] = [0, base * Math.SQRT2];
  const b3: [number, number] = [base * Math.SQRT1_2, base * Math.SQRT1_2];
  const inset = (p: [number, number], k: number): [number, number] => [
    p[0] * k,
    base * Math.SQRT1_2 + (p[1] - base * Math.SQRT1_2) * k,
  ];
  const kIn = (base - 2.8) / base;
  c2.beginPath();
  pathPoly([inset([0, 0], kIn), inset(b1, kIn), inset(b2, kIn), inset(b3, kIn)]);
  c2.fillStyle = '#44853b';
  c2.fill();

  // Home plate circle, pitcher's mound, bases, batter's boxes
  c2.beginPath();
  c2.arc(hu, hv, 4.0 * m, 0, Math.PI * 2);
  c2.fillStyle = '#a8724c';
  c2.fill();
  c2.beginPath();
  c2.arc(mu, mv, 2.7 * m, 0, Math.PI * 2);
  c2.fillStyle = '#b07a52';
  c2.fill();
  c2.fillStyle = '#f4f2ec';
  for (const b of [b1, b2, b3]) {
    const [u, v] = px(b[0], b[1]);
    c2.fillRect(u - 0.3 * m, v - 0.3 * m, 0.6 * m, 0.6 * m);
  }
  c2.fillRect(hu - 0.25 * m, hv - 0.25 * m, 0.5 * m, 0.5 * m);
  c2.fillRect(mu - 0.4 * m, mv - 0.1 * m, 0.8 * m, 0.2 * m);
  c2.strokeStyle = '#f4f2ec';
  c2.lineWidth = Math.max(1.5, 0.1 * m);
  for (const sx of [-1.25, 1.25]) {
    const [bu, bv] = px(sx - 0.6, -0.9);
    c2.strokeRect(bu, bv, 1.2 * m, 1.8 * m);
  }

  // Foul lines and on-deck circles
  c2.lineWidth = Math.max(2, 0.12 * m);
  for (const pole of [rfPole, lfPole]) {
    const [u, v] = px(pole[0], pole[1]);
    c2.beginPath();
    c2.moveTo(hu, hv);
    c2.lineTo(u, v);
    c2.stroke();
  }
  for (const sx of [-14, 14]) {
    const [u, v] = px(sx, -6);
    c2.beginPath();
    c2.arc(u, v, 1.2 * m, 0, Math.PI * 2);
    c2.fillStyle = '#c9a07a';
    c2.fill();
  }
  c2.restore();

  const fieldTex = new THREE.CanvasTexture(canvas);
  fieldTex.colorSpace = THREE.SRGBColorSpace;
  fieldTex.anisotropy = 8;
  const fieldGeo = new THREE.PlaneGeometry(FW, FW);
  fieldGeo.rotateX(-Math.PI / 2);
  fieldGeo.translate(FX0 + FW / 2, 0.25, FZ0 + FW / 2);
  const field = new THREE.Mesh(
    fieldGeo,
    new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.92, metalness: 0, alphaTest: 0.5 })
  );
  field.receiveShadow = true;
  g.add(field);

  // === 2. SEATING BOWL, FACADE & WALLS: one merged vertex-colored mesh ===
  const pos: number[] = [];
  const col: number[] = [];
  const C = (hex: string) => new THREE.Color(hex);
  const seatA = C('#1f4a33');
  const seatB = C('#27573b');
  const riser = C('#b8b2a5');
  const aisle = C('#cdc7ba');
  const cream = C('#e8e0cc');
  const glass = C('#25313c');
  const brick = C('#9a4632');
  const brickDark = C('#7a3526');
  const opening = C('#2b2420');
  const padGreen = C('#1d3a2b');
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
  };
  const P = (f: number, r: number, y: number, cz: number): number[] => [
    -Math.sin(f * DEG) * r,
    y,
    cz + Math.cos(f * DEG) * r,
  ];
  const ring = (r: number, y0: number, y1: number, f0: number, f1: number, cz: number, color: THREE.Color) => {
    const segs = Math.max(2, Math.round((f1 - f0) / 3));
    for (let s = 0; s < segs; s++) {
      const fa = f0 + ((f1 - f0) * s) / segs;
      const fb = f0 + ((f1 - f0) * (s + 1)) / segs;
      quad(P(fa, r, y0, cz), P(fb, r, y0, cz), P(fb, r, y1, cz), P(fa, r, y1, cz), color);
    }
  };
  const tier = (
    rIn: number, rOut: number, yIn: number, yOut: number,
    f0: number, f1: number, rows: number, cz: number,
    front: { y0: number; color: THREE.Color }, backY0: number | null
  ) => {
    const segs = Math.max(4, Math.round((f1 - f0) / 3));
    for (let s = 0; s < segs; s++) {
      const fa = f0 + ((f1 - f0) * s) / segs;
      const fb = f0 + ((f1 - f0) * (s + 1)) / segs;
      const isAisle = s % 6 === 3;
      for (let j = 0; j < rows; j++) {
        const r0 = rIn + ((rOut - rIn) * j) / rows;
        const r1 = rIn + ((rOut - rIn) * (j + 1)) / rows;
        const y0 = yIn + ((yOut - yIn) * j) / rows;
        const y1 = yIn + ((yOut - yIn) * (j + 1)) / rows;
        quad(P(fa, r0, y0, cz), P(fb, r0, y0, cz), P(fb, r0, y1, cz), P(fa, r0, y1, cz), riser);
        quad(
          P(fa, r0, y1, cz), P(fb, r0, y1, cz), P(fb, r1, y1, cz), P(fa, r1, y1, cz),
          isAisle ? aisle : j % 2 ? seatA : seatB
        );
      }
    }
    ring(rIn, front.y0, yIn, f0, f1, cz, front.color);
    if (backY0 !== null) ring(rOut, backY0, yOut, f0, f1, cz, brickDark);
    for (const f of [f0, f1]) {
      quad(P(f, rIn, front.y0, cz), P(f, rOut, front.y0, cz), P(f, rOut, yOut, cz), P(f, rIn, yIn, cz), riser);
    }
  };

  // Lower bowl, club level with suite fascia, upper deck
  tier(bowlIn, 78, 1.6, 13, 80, 280, 20, standsCZ, { y0: 0, color: padGreen }, 0);
  ring(78, 13, 17, 86, 274, standsCZ, cream);
  tier(78, 90, 17, 24, 86, 274, 8, standsCZ, { y0: 17, color: cream }, null);
  ring(90, 24, 29, 94, 266, standsCZ, glass);
  tier(88, 108, 29.5, 44, 94, 266, 14, standsCZ, { y0: 27, color: cream }, null);

  // Straight left-field line stands out toward the foul pole
  {
    const ux = Math.SQRT1_2, uz = Math.SQRT1_2;
    const nx = Math.SQRT1_2, nz = -Math.SQRT1_2;
    const S = (t: number, o: number, y: number) => [ux * t + nx * o, y, uz * t + nz * o];
    const t0 = 60, t1 = 100, o0 = 11, o1 = 34, rows = 12;
    for (let t = t0; t < t1; t += 5) {
      const tb = Math.min(t1, t + 5);
      const isAisle = Math.round(t) % 20 === 0;
      for (let j = 0; j < rows; j++) {
        const oa = o0 + ((o1 - o0) * j) / rows;
        const ob = o0 + ((o1 - o0) * (j + 1)) / rows;
        const ya = 1.6 + (9.4 * j) / rows;
        const yb = 1.6 + (9.4 * (j + 1)) / rows;
        quad(S(t, oa, ya), S(tb, oa, ya), S(tb, oa, yb), S(t, oa, yb), riser);
        quad(S(t, oa, yb), S(tb, oa, yb), S(tb, ob, yb), S(t, ob, yb), isAisle ? aisle : j % 2 ? seatA : seatB);
      }
      quad(S(t, o0, 0), S(tb, o0, 0), S(tb, o0, 1.6), S(t, o0, 1.6), padGreen);
      quad(S(t, o1, 0), S(tb, o1, 0), S(tb, o1, 11), S(t, o1, 11), brick);
    }
    quad(S(t1, o0, 0), S(t1, o1, 0), S(t1, o1, 11), S(t1, o0, 1.6), brick);
  }

  // Center-field bleachers behind the fence
  tier(126, 138, 3, 9, -24, 8, 6, 0, { y0: 0, color: padGreen }, 0);

  // Brick outer facade with three rows of arched openings
  {
    const r = 110;
    const f0 = 90, f1 = 270;
    const segs = Math.round((f1 - f0) / 2.5);
    const bands: [number, number, boolean][] = [
      [0, 3, false], [3, 10, true], [10, 15, false], [15, 22, true],
      [22, 28, false], [28, 35, true], [35, 44.5, false],
    ];
    for (let s = 0; s < segs; s++) {
      const fa = f0 + ((f1 - f0) * s) / segs;
      const fb = f0 + ((f1 - f0) * (s + 1)) / segs;
      for (const [y0, y1, arched] of bands) {
        const color = arched && s % 2 === 1 ? opening : s % 6 === 0 ? brickDark : brick;
        quad(P(fa, r, y0, standsCZ), P(fb, r, y0, standsCZ), P(fb, r, y1, standsCZ), P(fa, r, y1, standsCZ), color);
      }
      quad(P(fa, r, 44.5, standsCZ), P(fb, r, 44.5, standsCZ), P(fb, r, 46, standsCZ), P(fa, r, 46, standsCZ), cream);
    }
    // Lower brick wall wrapping the ends of the lower bowl
    ring(80, 0, 13, 80, 90, standsCZ, brick);
    ring(80, 0, 13, 270, 280, standsCZ, brick);
  }

  // Outfield wall: low padded wall in left/center, 25 ft brick wall along McCovey Cove in right
  for (let i = 0; i < fencePts.length - 1; i++) {
    const a = -45 + i * 3 + 1.5;
    const [x0, z0] = fencePts[i];
    const [x1, z1] = fencePts[i + 1];
    const tall = a > 22;
    const h = tall ? 7.6 : 2.4;
    const wallColor = tall ? brick : padGreen;
    const nx = -(z1 - z0), nz = x1 - x0;
    const nl = Math.hypot(nx, nz) || 1;
    const ox = (nx / nl) * 0.6, oz = (nz / nl) * 0.6;
    quad([x0, 0, z0], [x1, 0, z1], [x1, h, z1], [x0, h, z0], wallColor);
    quad([x0 + ox, 0, z0 + oz], [x1 + ox, 0, z1 + oz], [x1 + ox, h, z1 + oz], [x0 + ox, h, z0 + oz], tall && i % 2 ? opening : wallColor);
    quad([x0, h, z0], [x1, h, z1], [x1 + ox, h, z1 + oz], [x0 + ox, h, z0 + oz], C('#e9c23a'));
  }

  const bowlGeo = new THREE.BufferGeometry();
  bowlGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bowlGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  bowlGeo.computeVertexNormals();
  const bowl = new THREE.Mesh(
    bowlGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide })
  );
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  g.add(bowl);

  // === 3. DUGOUTS & FOUL POLES ===
  const dugoutMat = ctx.mat('#1b2229', '#D8D4CC', 0.7, 0.1);
  const dugoutRoof = ctx.mat('#2f5e43', '#E8E4DD', 0.6, 0.1);
  for (const side of [-1, 1]) {
    // side -1 = first-base (RF) line, +1 = third-base (LF) line
    const t = 24;
    const ux = side * Math.SQRT1_2, uz = Math.SQRT1_2;
    const nx = side * Math.SQRT1_2, nz = -Math.SQRT1_2;
    const dug = new THREE.Group();
    dug.position.set(ux * t + nx * 13, 0, uz * t + nz * 13);
    dug.rotation.y = Math.atan2(ux, uz);
    const pit = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 20), dugoutMat);
    pit.position.y = 0.7;
    dug.add(pit);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 20.6), dugoutRoof);
    roof.position.y = 1.6;
    dug.add(roof);
    g.add(dug);
  }
  const poleMat = ctx.mat('#F2C230', '#F6C84B', 0.4, 0.3);
  for (const pole of [rfPole, lfPole]) {
    const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 26, 8), poleMat);
    fp.position.set(pole[0], 13, pole[1]);
    g.add(fp);
  }

  // === 4. LIGHT TOWERS (rim of the upper deck + outfield masts) ===
  const steelMat = ctx.mat('#D9DDE0', '#FFFFFF', 0.4, 0.6);
  const bankMat = ctx.mat('#3a4048', '#C8C8C8', 0.5, 0.4);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
  const lampBase = new THREE.Color(0xfff1d6);
  const addLightTower = (x: number, z: number, y0: number, height: number) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, height, 8), steelMat);
    mast.position.set(x, y0 + height / 2, z);
    mast.castShadow = true;
    g.add(mast);
    const topY = y0 + height;
    const tx = 0, tz = 45;
    const yaw = Math.atan2(tx - x, tz - z);
    const tilt = Math.atan2(topY, Math.hypot(tx - x, tz - z));
    const bank = new THREE.Group();
    bank.position.set(x, topY + 3, z);
    bank.rotation.set(tilt, yaw, 0, 'YXZ');
    const frame = new THREE.Mesh(new THREE.BoxGeometry(13, 7, 1.2), bankMat);
    bank.add(frame);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.3), lampMat);
    panel.position.z = 0.7;
    bank.add(panel);
    ctx.emissiveMeshes.push({ mesh: panel, baseColor: lampBase });
    g.add(bank);
  };
  for (const f of [100, 130, 160, 200, 230, 260]) {
    const p = P(f, 109, 0, standsCZ);
    addLightTower(p[0], p[2], 46, 16);
  }
  for (const [a, d] of [[-32, 150], [40, 104]] as [number, number][]) {
    const [x, z] = polar(a, d);
    addLightTower(x, z, 0, 58);
  }

  // === 5. SCOREBOARD (right-center field) ===
  {
    const sc = document.createElement('canvas');
    sc.width = 512;
    sc.height = 208;
    const s2 = sc.getContext('2d')!;
    s2.fillStyle = '#0c1015';
    s2.fillRect(0, 0, 512, 208);
    s2.fillStyle = '#f26a21';
    s2.font = 'bold 44px Arial, sans-serif';
    s2.fillText('GIANTS', 20, 56);
    s2.fillStyle = '#e8e8e8';
    s2.font = 'bold 22px Arial, sans-serif';
    for (let i = 1; i <= 9; i++) s2.fillText(String(i), 200 + i * 30, 40);
    s2.fillText('R  H  E', 205 + 10 * 30, 40);
    s2.fillStyle = '#ffd34a';
    const line = ['0', '1', '0', '0', '2', '0', '1', '', ''];
    line.forEach((v, i) => s2.fillText(v, 200 + (i + 1) * 30, 84));
    s2.fillText('4  8  0', 205 + 10 * 30, 84);
    s2.fillStyle = '#26303a';
    s2.fillRect(20, 110, 472, 80);
    s2.fillStyle = '#9fd3ff';
    s2.font = 'bold 30px Arial, sans-serif';
    s2.fillText('ORACLE PARK  ·  SAN FRANCISCO', 34, 162);
    const scTex = new THREE.CanvasTexture(sc);
    scTex.colorSpace = THREE.SRGBColorSpace;

    const [sx, sz] = polar(14, 140);
    const board = new THREE.Group();
    board.position.set(sx, 0, sz);
    board.rotation.y = Math.atan2(-sx, -sz);
    for (const lx of [-10, 10]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 12, 1.4), steelMat);
      leg.position.set(lx, 6, 0);
      board.add(leg);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(32, 13.5, 2.2), bankMat);
    box.position.y = 18.5;
    box.castShadow = true;
    board.add(box);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 12.2),
      new THREE.MeshBasicMaterial({ map: scTex, color: 0xdddddd })
    );
    screen.position.set(0, 18.5, 1.15);
    board.add(screen);
    g.add(board);
  }

  // === 6. LEFT-FIELD GIANT GLOVE & SODA BOTTLE SLIDE ===
  {
    const leather = ctx.mat('#8B5A2B', '#E5D3BE', 0.75, 0.05);
    const [gx, gz] = polar(-28, 134);
    const glove = new THREE.Group();
    glove.position.set(gx, 14, gz);
    glove.rotation.y = Math.atan2(-gx, -gz);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), leather);
    palm.scale.set(1, 1.15, 0.55);
    glove.add(palm);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 6, 4, 10), leather);
      finger.position.set(-4.2 + i * 2.8, 8.5, 0);
      finger.rotation.z = (i - 1.5) * 0.12;
      glove.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 5, 4, 10), leather);
    thumb.position.set(7.2, 1.5, 0.5);
    thumb.rotation.z = -0.9;
    glove.add(thumb);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 8, 10), steelMat);
    post.position.y = -9;
    glove.add(post);
    g.add(glove);

    const bottleMat = ctx.mat('#B3261E', '#F2C6C2', 0.35, 0.2);
    const profile = [
      [0, 0], [3.6, 0], [4.2, 1.2], [4.2, 8], [3.4, 11], [3.8, 14], [3.8, 17], [2.2, 21], [1.3, 24], [1.4, 25.5], [0, 25.5],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), bottleMat);
    const [bx, bz] = polar(-38, 128);
    bottle.position.set(bx, 0, bz);
    bottle.castShadow = true;
    g.add(bottle);
  }

  // === 7. WILLIE MAYS PLAZA CLOCK TOWER behind home plate ===
  {
    const towerBrick = ctx.mat('#9A4632', '#F4F1EA', 0.78, 0.05);
    const copper = ctx.mat('#4F8A78', '#DCE8E4', 0.5, 0.35);
    const clockFace = ctx.mat('#F3EFE4', '#FFFFFF', 0.4, 0.05);
    const tw = new THREE.Group();
    tw.position.set(0, 0, -88);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(13, 38, 13), towerBrick);
    shaft.position.y = 19;
    shaft.castShadow = true;
    tw.add(shaft);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(14.2, 1.2, 14.2), C('#e8e0cc') && ctx.mat('#E8E0CC', '#FFFFFF', 0.6, 0.05));
    belt.position.y = 26;
    tw.add(belt);
    for (let k = 0; k < 4; k++) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(3.6, 28), clockFace);
      const ang = (k * Math.PI) / 2;
      face.position.set(Math.sin(ang) * 6.56, 32, Math.cos(ang) * 6.56);
      face.rotation.y = ang;
      tw.add(face);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(10, 11, 4), copper);
    roof.position.y = 43.5;
    roof.rotation.y = Math.PI / 4;
    tw.add(roof);
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), steelMat);
    flag.position.y = 53;
    tw.add(flag);
    g.add(tw);
  }

  ctx.group.add(g);
}

function buildChaseCenter(ctx: ModelContext): void {
  const enu = latLonToENU(37.7680, -122.3877);
  const baseY = Math.max(2.5, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);

  const metalMat = ctx.mat('#E2E8F0', '#FFFFFF', 0.28, 0.62);
  const accentMat = ctx.mat('#8DA2B8', '#E8E4DD', 0.36, 0.42);
  const glassMat = ctx.mat('#243E56', '#8AA0B4', 0.12, 0.85);
  const plazaMat = ctx.mat('#D8D2C6', '#EAE6DE', 0.78, 0.05);
  const finMat = ctx.mat('#F4F6F8', '#FFFFFF', 0.32, 0.5);

  // Thrive City plaza, kept inside the footprint exclusion radius so it never covers mapped streets
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(94, 94, 2.2, 40), plazaMat);
  plaza.position.y = 0.2;
  plaza.receiveShadow = true;
  g.add(plaza);

  const lowerDrum = new THREE.Mesh(new THREE.CylinderGeometry(86, 90, 20, 36), accentMat);
  lowerDrum.position.y = 10;
  lowerDrum.castShadow = true;
  lowerDrum.receiveShadow = true;
  g.add(lowerDrum);

  // Glass lobby band facing the plaza
  const lobbyGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(90.4, 90.8, 13, 24, 1, true, -Math.PI * 0.4, Math.PI * 0.8),
    glassMat
  );
  lobbyGlass.position.y = 8.5;
  g.add(lobbyGlass);

  const upperDrum = new THREE.Mesh(new THREE.CylinderGeometry(76, 83, 21, 36), metalMat);
  upperDrum.position.y = 30.5;
  upperDrum.castShadow = true;
  g.add(upperDrum);

  // Vertical aluminum fins that give the drum its ribbed silhouette
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 20, 1.6), finMat);
    fin.position.set(Math.cos(a) * 80.2, 30.5, Math.sin(a) * 80.2);
    fin.rotation.y = -a;
    g.add(fin);
  }

  const roofCrown = new THREE.Mesh(new THREE.CylinderGeometry(64, 76, 5.5, 36), accentMat);
  roofCrown.position.y = 43.7;
  g.add(roofCrown);

  ctx.group.add(g);
}

function buildCityHall(ctx: ModelContext): void {
  const enu = latLonToENU(37.7793, -122.4193);
  const baseY = Math.max(4, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (9 * Math.PI) / 180;

  const graniteMat = ctx.mat('#F2EEE6', '#FFFFFF', 0.58, 0.08);
  const trimMat = ctx.mat('#DDD6C8', '#EAE6DE', 0.68, 0.08);
  const patinaMat = ctx.mat('#4E8C7D', '#DCE8E4', 0.38, 0.38);
  const goldMat = ctx.mat('#F0C44D', '#F6C84B', 0.22, 0.85);
  const windowMat = ctx.mat('#2A3642', '#94A0AC', 0.18, 0.72);

  // Grand 4-story Beaux-Arts granite block (92m x 122m)
  const palace = new THREE.Mesh(new THREE.BoxGeometry(92, 26, 122), graniteMat);
  palace.position.y = 13;
  palace.castShadow = true;
  palace.receiveShadow = true;
  g.add(palace);

  // Doric colonnade & triangular pediment portico on East & West entrances
  for (const sideX of [-47, 47]) {
    const portico = new THREE.Mesh(new THREE.BoxGeometry(5.5, 24, 38), trimMat);
    portico.position.set(sideX, 12, 0);
    portico.castShadow = true;
    g.add(portico);

    for (let cz = -15; cz <= 15; cz += 5) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 16, 10), graniteMat);
      col.position.set(sideX + Math.sign(sideX) * 2.8, 13.5, cz);
      col.castShadow = true;
      g.add(col);
    }

    const pediment = new THREE.Mesh(new THREE.ConeGeometry(22, 6.5, 4), trimMat);
    pediment.rotation.y = Math.PI / 4;
    pediment.scale.set(0.24, 1, 1);
    pediment.position.set(sideX, 27.2, 0);
    g.add(pediment);
  }

  // Lower & upper baroque tambour drums with 16 paired Corinthian columns & tall windows
  const drumBase = new THREE.Mesh(new THREE.BoxGeometry(44, 8, 44), trimMat);
  drumBase.position.y = 29;
  g.add(drumBase);

  const drum1 = new THREE.Mesh(new THREE.CylinderGeometry(20, 21.5, 20, 24), graniteMat);
  drum1.position.y = 42;
  drum1.castShadow = true;
  g.add(drum1);

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 17, 8), trimMat);
    col.position.set(Math.cos(a) * 20.8, 42, Math.sin(a) * 20.8);
    g.add(col);

    const win = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11, 1.8), windowMat);
    const wa = a + Math.PI / 16;
    win.position.set(Math.cos(wa) * 20.1, 42, Math.sin(wa) * 20.1);
    win.rotation.y = -wa;
    g.add(win);
  }

  const drum2 = new THREE.Mesh(new THREE.CylinderGeometry(17.6, 19.2, 13, 24), graniteMat);
  drum2.position.y = 57.5;
  drum2.castShadow = true;
  g.add(drum2);

  // 93.7 m (307.5 ft) Patina Copper Dome with 16 gilded ribs
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(17.4, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    patinaMat
  );
  dome.position.y = 62.5;
  dome.castShadow = true;
  g.add(dome);

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const ribGeo = new THREE.TorusGeometry(17.45, 0.28, 6, 16, Math.PI * 0.48);
    const rib = new THREE.Mesh(ribGeo, goldMat);
    rib.position.y = 62.5;
    rib.rotation.y = a;
    g.add(rib);
  }

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 11.5, 12), goldMat);
  lantern.position.y = 83;
  g.add(lantern);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 8.5, 8), goldMat);
  spire.position.y = 92.5;
  g.add(spire);

  ctx.addBeacon(g, 0, 95, 0, 0xffe494, 2.0);
  ctx.group.add(g);
}

function buildGraceCathedral(ctx: ModelContext): void {
  const enu = latLonToENU(37.7919, -122.4130);
  const baseY = Math.max(10, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (9 * Math.PI) / 180;

  const stoneMat = ctx.mat('#E2DDD2', '#FFFFFF', 0.70, 0.05);
  const trimMat = ctx.mat('#CFC8BA', '#E6E2DA', 0.76, 0.05);
  const roofMat = ctx.mat('#58646E', '#E8E4DD', 0.62, 0.18);
  const goldMat = ctx.mat('#E5B84B', '#F4C85A', 0.28, 0.78);
  const roseGlassMat = ctx.mat('#3A5A8C', '#9AB4D8', 0.18, 0.75);

  const nave = new THREE.Mesh(new THREE.BoxGeometry(96, 26, 24), stoneMat);
  nave.position.y = 13;
  nave.castShadow = true;
  nave.receiveShadow = true;
  g.add(nave);

  const naveRoof = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 12.5, 95, 4), roofMat);
  naveRoof.rotation.z = Math.PI / 2;
  naveRoof.rotation.x = Math.PI / 4;
  naveRoof.position.y = 29;
  g.add(naveRoof);

  for (let x = -36; x <= 28; x += 10.6) {
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(2.2, 24, 30), trimMat);
    buttress.position.set(x, 12, 0);
    buttress.castShadow = true;
    g.add(buttress);
  }

  const transept = new THREE.Mesh(new THREE.BoxGeometry(24, 26, 56), stoneMat);
  transept.position.set(-10, 13, 0);
  transept.castShadow = true;
  g.add(transept);

  for (const tz of [-10.5, 10.5]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(11.5, 50, 11.5), stoneMat);
    tower.position.set(42, 25, tz);
    tower.castShadow = true;
    tower.receiveShadow = true;
    g.add(tower);

    for (const px of [-5, 5]) {
      for (const pz of [-5, 5]) {
        const pin = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6.5, 4), trimMat);
        pin.position.set(42 + px, 53, tz + pz);
        g.add(pin);
      }
    }
  }

  const roseWindow = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 1.2, 20), roseGlassMat);
  roseWindow.rotation.z = Math.PI / 2;
  roseWindow.position.set(47.6, 19.5, 0);
  g.add(roseWindow);

  const doorsOfParadise = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7.5, 6.8), goldMat);
  doorsOfParadise.position.set(47.6, 4.5, 0);
  g.add(doorsOfParadise);

  const fleche = new THREE.Mesh(new THREE.ConeGeometry(2.6, 24, 8), roofMat);
  fleche.position.set(-10, 38, 0);
  g.add(fleche);

  ctx.group.add(g);
}

function buildPaintedLadies(ctx: ModelContext): void {
  // Alamo Square's "Postcard Row" (710-722 Steiner Street) facing West toward Alamo Square Park
  const enu = latLonToENU(37.7763, -122.4328);
  const victorianPalettes = [
    { body: '#F0CFA0', trim: '#FFFDF8', accent: '#A85C48' }, // 710 Steiner
    { body: '#A6C8B8', trim: '#F8F6F0', accent: '#3F6A5E' }, // 712 Steiner
    { body: '#E59F8E', trim: '#FFF8F0', accent: '#7D3C34' }, // 714 Steiner
    { body: '#AFC4DC', trim: '#F8FAFC', accent: '#3A5472' }, // 716 Steiner
    { body: '#E4D69B', trim: '#FFFDF6', accent: '#6B6834' }, // 718 Steiner
    { body: '#CBB4D8', trim: '#FAF6FC', accent: '#5A3E6E' }, // 720 Steiner
    { body: '#98C4B4', trim: '#F6FAF8', accent: '#2E584E' }, // 722 Steiner
  ];

  const roofMat = ctx.mat('#4A4846', '#E8E4DD', 0.72, 0.08);
  const windowMat = ctx.mat('#1E2A36', '#8FA0B0', 0.12, 0.85);
  const stoopMat = ctx.mat('#DCD6CA', '#EAE6DE', 0.78, 0.05);

  const rotRad = (9 * Math.PI) / 180;
  for (let i = 0; i < 7; i++) {
    const offsetZ = (i - 3) * 6.8;
    const wx = enu.x - Math.sin(rotRad) * offsetZ;
    const wz = enu.z + Math.cos(rotRad) * offsetZ;
    const groundY = ctx.sampleGround(wx, wz);

    const house = new THREE.Group();
    house.position.set(wx, groundY, wz);
    house.rotation.y = rotRad;

    const pal = victorianPalettes[i];
    const bodyMat = ctx.mat(pal.body, '#FFFFFF', 0.62, 0.05);
    const trimMat = ctx.mat(pal.trim, '#FFFFFF', 0.55, 0.05);
    const accentMat = ctx.mat(pal.accent, '#E8E4DD', 0.58, 0.08);

    // Ground/garage plinth anchored into the Steiner St hillside grade
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(18.2, 5.5, 6.2), trimMat);
    plinth.position.y = 0.25;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    house.add(plinth);

    // 3-story Queen Anne Victorian main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(17.8, 11.4, 6.0), bodyMat);
    body.position.y = 8.7;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // Horizontal white gingerbread belt courses between stories
    for (const by of [3.2, 7.2, 11.0, 14.3]) {
      const belt = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.36, 6.3), trimMat);
      belt.position.y = by;
      house.add(belt);
    }

    // 3-sided projecting Victorian bay window stack on the front (-X) left side
    const bay = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 11.0, 6), bodyMat);
    bay.position.set(-9.0, 8.7, 1.25);
    bay.castShadow = true;
    house.add(bay);

    for (const wy of [5.2, 8.9, 12.4]) {
      const bayWin = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.02, 2.0, 6), windowMat);
      bayWin.position.set(-9.0, wy, 1.25);
      house.add(bayWin);

      const bayTrim = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.32, 6), accentMat);
      bayTrim.position.set(-9.0, wy + 1.1, 1.25);
      house.add(bayTrim);
    }

    // Entry porch hood & front stoop staircase on the front (-X) right side
    const porchHood = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.4), accentMat);
    porchHood.position.set(-9.6, 7.0, -1.5);
    house.add(porchHood);

    const stoop = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.4, 2.2), stoopMat);
    stoop.position.set(-10.8, 1.7, -1.5);
    house.add(stoop);

    // Steeply pitched Queen Anne gable roof + gingerbread bargeboard & finial
    const gable = new THREE.Mesh(new THREE.ConeGeometry(4.4, 4.5, 4), roofMat);
    gable.rotation.y = Math.PI / 4;
    gable.position.set(-5.0, 16.6, 0);
    gable.castShadow = true;
    house.add(gable);

    const bargeboard = new THREE.Mesh(new THREE.ConeGeometry(4.1, 4.3, 4), trimMat);
    bargeboard.rotation.y = Math.PI / 4;
    bargeboard.scale.set(0.18, 1.0, 1.02);
    bargeboard.position.set(-9.1, 16.5, 0);
    house.add(bargeboard);

    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 1.7, 6), accentMat);
    finial.position.set(-9.1, 19.2, 0);
    house.add(finial);

    ctx.group.add(house);
  }
}

function buildLombardCrookedBlock(ctx: ModelContext): void {
  const topENU = latLonToENU(37.8020, -122.4196);
  const botENU = latLonToENU(37.8022, -122.4179);

  const brickMat = ctx.mat('#C64E38', '#FFFFFF', 0.68, 0.05);
  const wallMat = ctx.mat('#E6E0D4', '#D9D5CE', 0.74, 0.05);
  const hedgeMat = ctx.mat('#387434', '#A5D29A', 0.84, 0.0);
  const hydrangeaBlueMat = ctx.mat('#5B84D6', '#B8CCF4', 0.72, 0.05);
  const hydrangeaPinkMat = ctx.mat('#DF6E98', '#F4BCD0', 0.72, 0.05);

  const pts: THREE.Vector3[] = [];
  const turns = 9;
  for (let i = 0; i <= turns; i++) {
    const t = i / turns;
    const bx = topENU.x + (botENU.x - topENU.x) * t;
    const bz = topENU.z + (botENU.z - topENU.z) * t;
    const swing = (i % 2 === 0 ? -1 : 1) * 8.6 * Math.sin(t * Math.PI);
    const wx = bx;
    const wz = bz + swing;
    const wy = ctx.sampleGround(wx, wz) + 0.62;
    pts.push(new THREE.Vector3(wx, wy, wz));

    if (i > 0 && i < turns) {
      const gx = bx;
      const gz = bz - swing * 0.36;
      const gy = ctx.sampleGround(gx, gz);

      const planter = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.0, 3.4, 12), wallMat);
      planter.position.set(gx, gy - 0.2, gz);
      ctx.group.add(planter);

      const hedge = new THREE.Mesh(new THREE.SphereGeometry(4.1, 10, 8), hedgeMat);
      hedge.scale.set(1.35, 0.62, 1.0);
      hedge.position.set(gx, wy + 0.35, gz);
      hedge.castShadow = true;
      ctx.group.add(hedge);

      const flowerMat = i % 2 === 0 ? hydrangeaBlueMat : hydrangeaPinkMat;
      for (let f = 0; f < 4; f++) {
        const fa = (f / 4) * Math.PI * 2;
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), flowerMat);
        bloom.position.set(gx + Math.cos(fa) * 2.4, wy + 1.0, gz + Math.sin(fa) * 1.8);
        ctx.group.add(bloom);
      }
    }
  }

  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.24);
  const tubeGeo = new THREE.TubeGeometry(curve, 76, 2.7, 6, false);
  tubeGeo.scale(1, 0.22, 1);
  const brickRoad = new THREE.Mesh(tubeGeo, brickMat);
  brickRoad.receiveShadow = true;
  ctx.group.add(brickRoad);

  const curbGeo = new THREE.TubeGeometry(curve, 76, 3.3, 6, false);
  curbGeo.scale(1, 0.19, 1);
  const curbMesh = new THREE.Mesh(curbGeo, wallMat);
  curbMesh.position.y = -0.08;
  ctx.group.add(curbMesh);
}

function buildPier39(ctx: ModelContext): void {
  const enu = latLonToENU(37.8087, -122.4098);
  const g = new THREE.Group();
  g.position.set(enu.x, 2.8, enu.z);
  g.rotation.y = (-30 * Math.PI) / 180;

  const deckMat = ctx.mat('#D4C4AA', '#E5E0D6', 0.82, 0.05);
  const woodMat = ctx.mat('#9E6442', '#FFFFFF', 0.70, 0.05);
  const trimMat = ctx.mat('#F4EFE6', '#FFFFFF', 0.58, 0.05);
  const roofMat = ctx.mat('#2F526E', '#E8E4DD', 0.60, 0.12);
  const carouselGoldMat = ctx.mat('#E8B648', '#F6D078', 0.30, 0.65);
  const seaLionMat = ctx.mat('#5C4332', '#9A8474', 0.75, 0.05);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(48, 3.6, 264), deckMat);
  deck.position.y = -0.8;
  deck.receiveShadow = true;
  g.add(deck);

  // Pier 39 entrance archway facing the Embarcadero (+Z)
  for (const ax of [-10, 10]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 13, 3.2), trimMat);
    pillar.position.set(ax, 6.5, 126);
    g.add(pillar);
  }
  const archSign = new THREE.Mesh(new THREE.BoxGeometry(24, 3.4, 2.4), roofMat);
  archSign.position.set(0, 12.2, 126);
  g.add(archSign);

  // Two-level Venetian Carousel pavilion in the central plaza
  const carouselBase = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.0, 6.5, 16), carouselGoldMat);
  carouselBase.position.set(0, 3.25, -18);
  carouselBase.castShadow = true;
  g.add(carouselBase);

  const carouselCanopy = new THREE.Mesh(new THREE.ConeGeometry(9.6, 5.2, 16), roofMat);
  carouselCanopy.position.set(0, 9.0, -18);
  g.add(carouselCanopy);

  for (let z = -102; z <= 94; z += 28) {
    for (const sideX of [-15, 15]) {
      const shop = new THREE.Mesh(new THREE.BoxGeometry(12.5, 9.8, 22), woodMat);
      shop.position.set(sideX, 4.9, z);
      shop.castShadow = true;
      shop.receiveShadow = true;
      g.add(shop);

      const balcony = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.6, 22.6), trimMat);
      balcony.position.set(sideX, 5.0, z);
      g.add(balcony);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(9.8, 4.6, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(sideX, 12.0, z);
      g.add(roof);
    }
  }

  // K-Dock floating timber rafts & basking California Sea Lions on the west side (-X)
  for (let z = -68; z <= 42; z += 22) {
    const floatDock = new THREE.Mesh(new THREE.BoxGeometry(11, 0.9, 16.5), deckMat);
    floatDock.position.set(-38, -2.1, z);
    floatDock.receiveShadow = true;
    g.add(floatDock);

    for (let s = 0; s < 3; s++) {
      const sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 1.4, 4, 8), seaLionMat);
      sl.rotation.z = Math.PI * 0.42;
      sl.rotation.y = (s * 1.9 + z) % 3.14;
      sl.position.set(-38 + (s - 1) * 2.6, -1.25, z + (s - 1) * 3.5);
      g.add(sl);
    }
  }

  ctx.addBeacon(g, 0, 11.5, -18, 0xffe49c, 1.6);
  ctx.group.add(g);
}

function buildTwinPeaksLookout(ctx: ModelContext): void {
  const enu = latLonToENU(37.7544, -122.4477);
  const baseY = Math.max(10, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);

  const stoneMat = ctx.mat('#D2CCC0', '#E8E4DD', 0.82, 0.05);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(28, 32, 6, 24), stoneMat);
  ring.position.y = 1;
  g.add(ring);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 38, 8),
    ctx.mat('#C2C6CC', '#FFFFFF', 0.4, 0.5)
  );
  mast.position.set(-14, 19, -12);
  g.add(mast);
  ctx.addBeacon(g, -14, 39, -12, 0xff2211, 1.6);

  ctx.group.add(g);
}
