// Universities.ts — Dedicated 3D Architectural Models of San Francisco's 5 Major University Campuses:
// 1. University of San Francisco (USF) — St. Ignatius Church, Lone Mountain, Kalmanovitz Hall, Gleeson Library
// 2. UCSF Parnassus Heights Medical Center — Health Sciences West & East 16-story towers, Moffitt/Long Hospital, Helipad, Kalmanovitz Library
// 3. UCSF Mission Bay Campus — Genentech Hall sandstone rotunda dome, Helen Diller Cancer Building, Byers Hall, Koret Quad
// 4. San Francisco State University (SFSU) — J. Paul Leonard Library, Cesar Chavez Student Center pyramids, Thornton & Hensill Science Halls
// 5. UC Law San Francisco (formerly UC Hastings) — Cotchett Law Center, 200 McAllister, 198 McAllister Academic Village

import * as THREE from 'three';
import { latLonToENU } from '../world/coords';
import type { ModelContext } from './types';

export function buildUniversityCampuses(ctx: ModelContext): void {
  buildUSFCampus(ctx);
  buildUCSFParnassus(ctx);
  buildUCSFMissionBay(ctx);
  buildSFSUCampus(ctx);
  buildUCLawSF(ctx);
}

function buildUSFCampus(ctx: ModelContext): void {
  const enu = latLonToENU(37.7766, -122.4507);
  const baseY = Math.max(10, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (9 * Math.PI) / 180;

  const stoneMat = ctx.mat('#E8DFD1', '#F5F2EB', 0.68, 0.06);
  const trimMat = ctx.mat('#C9BFA8', '#E2DDD2', 0.72, 0.08);
  const copperMat = ctx.mat('#4A8B7A', '#5E9E8D', 0.42, 0.45);
  const tileRoofMat = ctx.mat('#B84B32', '#C45A40', 0.65, 0.08);
  const glassMat = ctx.mat('#2A5C84', '#5B87AD', 0.14, 0.85);
  const turfMat = ctx.mat('#4C7C44', '#72A868', 0.88, 0.0);

  const quadLawn = new THREE.Mesh(new THREE.BoxGeometry(160, 1.4, 110), turfMat);
  quadLawn.position.set(35, 0.7, -15);
  quadLawn.receiveShadow = true;
  g.add(quadLawn);

  const churchPlinth = new THREE.Mesh(new THREE.BoxGeometry(42, 3.2, 86), trimMat);
  churchPlinth.position.set(-32, 1.6, 0);
  g.add(churchPlinth);

  const nave = new THREE.Mesh(new THREE.BoxGeometry(26, 24, 72), stoneMat);
  nave.position.set(-32, 14, -2);
  nave.castShadow = true;
  nave.receiveShadow = true;
  g.add(nave);

  const pitchedNaveRoof = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 72, 3), tileRoofMat);
  pitchedNaveRoof.rotation.x = Math.PI / 2;
  pitchedNaveRoof.rotation.z = Math.PI;
  pitchedNaveRoof.scale.set(1.0, 0.45, 1.0);
  pitchedNaveRoof.position.set(-32, 27.5, -2);
  g.add(pitchedNaveRoof);

  const transept = new THREE.Mesh(new THREE.BoxGeometry(46, 22, 22), stoneMat);
  transept.position.set(-32, 13, -14);
  transept.castShadow = true;
  g.add(transept);

  const crossingDrum = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.2, 11, 16), stoneMat);
  crossingDrum.position.set(-32, 29, -14);
  g.add(crossingDrum);

  const mainDome = new THREE.Mesh(
    new THREE.SphereGeometry(10.4, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
    copperMat
  );
  mainDome.position.set(-32, 34.5, -14);
  mainDome.castShadow = true;
  g.add(mainDome);

  const domeLantern = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 7, 10), stoneMat);
  domeLantern.position.set(-32, 46, -14);
  g.add(domeLantern);

  for (const sx of [-11.5, 11.5]) {
    const tx = -32 + sx;
    const tz = 31;
    const baseShaft = new THREE.Mesh(new THREE.BoxGeometry(8.5, 36, 8.5), stoneMat);
    baseShaft.position.set(tx, 18, tz);
    baseShaft.castShadow = true;
    g.add(baseShaft);

    const belfryStage = new THREE.Mesh(new THREE.BoxGeometry(6.8, 12, 6.8), trimMat);
    belfryStage.position.set(tx, 42, tz);
    belfryStage.castShadow = true;
    g.add(belfryStage);

    const octagonDrum = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 7.5, 8), stoneMat);
    octagonDrum.position.set(tx, 51.5, tz);
    g.add(octagonDrum);

    const cupola = new THREE.Mesh(new THREE.ConeGeometry(3.5, 9.5, 8), copperMat);
    cupola.position.set(tx, 60, tz);
    cupola.castShadow = true;
    g.add(cupola);

    ctx.addBeacon(g, tx, 65.5, tz, 0xffe4a0, 1.3, 0);
  }

  for (let i = -3; i <= 3; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 13, 8), trimMat);
    col.position.set(-32 + i * 2.4, 8.5, 35.6);
    g.add(col);
  }
  const roseWin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.8, 16), glassMat);
  roseWin.rotation.x = Math.PI / 2;
  roseWin.position.set(-32, 19.5, 34.2);
  g.add(roseWin);

  const gleeson = new THREE.Mesh(new THREE.BoxGeometry(44, 20, 36), stoneMat);
  gleeson.position.set(32, 10, 18);
  gleeson.castShadow = true;
  gleeson.receiveShadow = true;
  g.add(gleeson);

  const gleesonAtrium = new THREE.Mesh(new THREE.BoxGeometry(18, 22, 14), glassMat);
  gleesonAtrium.position.set(32, 11, -1);
  g.add(gleesonAtrium);

  const kalmanovitz = new THREE.Mesh(new THREE.BoxGeometry(56, 22, 20), stoneMat);
  kalmanovitz.position.set(42, 11, -48);
  kalmanovitz.castShadow = true;
  g.add(kalmanovitz);

  const loSchiavo = new THREE.Mesh(new THREE.BoxGeometry(34, 18, 28), glassMat);
  loSchiavo.position.set(-2, 9, -46);
  loSchiavo.castShadow = true;
  g.add(loSchiavo);

  const loneMtnHill = new THREE.Mesh(new THREE.CylinderGeometry(48, 66, 22, 16), turfMat);
  loneMtnHill.position.set(20, 11, -135);
  g.add(loneMtnHill);

  const loneMtnHall = new THREE.Mesh(new THREE.BoxGeometry(68, 21, 24), stoneMat);
  loneMtnHall.position.set(20, 32, -135);
  loneMtnHall.castShadow = true;
  g.add(loneMtnHall);

  const loneMtnRoof = new THREE.Mesh(new THREE.BoxGeometry(70, 3.2, 26), tileRoofMat);
  loneMtnRoof.position.set(20, 44, -135);
  g.add(loneMtnRoof);

  for (const sx of [-24, 24]) {
    const spanishTower = new THREE.Mesh(new THREE.BoxGeometry(12, 30, 12), stoneMat);
    spanishTower.position.set(20 + sx, 36.5, -126);
    spanishTower.castShadow = true;
    g.add(spanishTower);

    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(9.2, 6.5, 4), tileRoofMat);
    towerRoof.rotation.y = Math.PI / 4;
    towerRoof.position.set(20 + sx, 54.5, -126);
    g.add(towerRoof);
  }

  ctx.group.add(g);
}

function buildUCSFParnassus(ctx: ModelContext): void {
  const enu = latLonToENU(37.7631, -122.4582);
  const baseY = Math.max(20, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (-8 * Math.PI) / 180;

  const concreteMat = ctx.mat('#D8D3C8', '#ECE9E2', 0.72, 0.08);
  const shaftMat = ctx.mat('#C2BCB0', '#DCD7CE', 0.78, 0.06);
  const glassMat = ctx.mat('#244E6E', '#4F7BA1', 0.12, 0.88);
  const hospitalMat = ctx.mat('#EAE6DF', '#F7F5F0', 0.62, 0.1);
  const helipadMat = ctx.mat('#3A4048', '#4A525C', 0.8, 0.1);

  for (const tx of [-42, 8]) {
    const labCore = new THREE.Mesh(new THREE.BoxGeometry(32, 68, 32), glassMat);
    labCore.position.set(tx, 34, 18);
    labCore.castShadow = true;
    labCore.receiveShadow = true;
    g.add(labCore);

    for (let fl = 1; fl <= 15; fl++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(33.2, 1.1, 33.2), concreteMat);
      slab.position.set(tx, fl * 4.3, 18);
      g.add(slab);
    }

    for (const [ox, oz] of [
      [-19, 0],
      [19, 0],
      [0, -19],
      [0, 19],
    ]) {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(6.5, 76, 6.5), shaftMat);
      shaft.position.set(tx + ox, 38, 18 + oz);
      shaft.castShadow = true;
      g.add(shaft);
    }
  }

  const skybridge = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 7), glassMat);
  skybridge.position.set(-17, 42, 18);
  skybridge.castShadow = true;
  g.add(skybridge);

  const hospitalPodium = new THREE.Mesh(new THREE.BoxGeometry(130, 18, 52), hospitalMat);
  hospitalPodium.position.set(28, 9, -24);
  hospitalPodium.castShadow = true;
  hospitalPodium.receiveShadow = true;
  g.add(hospitalPodium);

  const longTower = new THREE.Mesh(new THREE.BoxGeometry(58, 58, 30), hospitalMat);
  longTower.position.set(48, 29, -24);
  longTower.castShadow = true;
  g.add(longTower);

  const moffittTower = new THREE.Mesh(new THREE.BoxGeometry(44, 54, 28), concreteMat);
  moffittTower.position.set(-12, 27, -24);
  moffittTower.castShadow = true;
  g.add(moffittTower);

  const padDeck = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 1.6, 20), helipadMat);
  padDeck.position.set(48, 59, -24);
  g.add(padDeck);
  ctx.addBeacon(g, 48, 60.5, -24, 0x38bdf8, 1.5, 2.2);

  for (let t = 0; t < 5; t++) {
    const w = 52 - t * 5;
    const d = 34 - t * 4;
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(w, 5.2, d), concreteMat);
    terrace.position.set(-68, 4 + t * 5.2, -22 + t * 2.5);
    terrace.castShadow = true;
    g.add(terrace);

    const ribbonGlass = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 2.6, d + 0.4), glassMat);
    ribbonGlass.position.set(-68, 4.8 + t * 5.2, -22 + t * 2.5);
    g.add(ribbonGlass);
  }

  ctx.group.add(g);
}

function buildUCSFMissionBay(ctx: ModelContext): void {
  const enu = latLonToENU(37.7678, -122.3918);
  const baseY = Math.max(2.5, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);

  const sandstoneMat = ctx.mat('#DFC5A4', '#EDE0CE', 0.65, 0.06);
  const terracottaMat = ctx.mat('#C86D51', '#D68268', 0.6, 0.1);
  const glassMat = ctx.mat('#26587A', '#5684A6', 0.14, 0.86);
  const metalMat = ctx.mat('#D4DBE2', '#EEF2F6', 0.35, 0.55);
  const lawnMat = ctx.mat('#4E8246', '#74A86C', 0.88, 0.0);

  const quad = new THREE.Mesh(new THREE.BoxGeometry(150, 1.0, 95), lawnMat);
  quad.position.set(0, 0.5, 0);
  quad.receiveShadow = true;
  g.add(quad);

  const genentechWing = new THREE.Mesh(new THREE.BoxGeometry(96, 26, 32), sandstoneMat);
  genentechWing.position.set(0, 13, -64);
  genentechWing.castShadow = true;
  genentechWing.receiveShadow = true;
  g.add(genentechWing);

  const rotunda = new THREE.Mesh(new THREE.CylinderGeometry(16, 17, 34, 20), sandstoneMat);
  rotunda.position.set(0, 17, -46);
  rotunda.castShadow = true;
  g.add(rotunda);

  const rotundaDome = new THREE.Mesh(
    new THREE.SphereGeometry(15.8, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
    metalMat
  );
  rotundaDome.position.set(0, 34, -46);
  g.add(rotundaDome);

  const dillerBase = new THREE.Mesh(new THREE.BoxGeometry(38, 28, 68), glassMat);
  dillerBase.position.set(-92, 14, -10);
  dillerBase.castShadow = true;
  g.add(dillerBase);

  for (let z = -38; z <= 18; z += 8) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(40, 26, 1.4), terracottaMat);
    fin.position.set(-92, 14, z);
    g.add(fin);
  }

  const byersHall = new THREE.Mesh(new THREE.BoxGeometry(42, 30, 64), metalMat);
  byersHall.position.set(92, 15, -12);
  byersHall.castShadow = true;
  g.add(byersHall);

  const byersGlass = new THREE.Mesh(new THREE.BoxGeometry(43, 22, 48), glassMat);
  byersGlass.position.set(92, 16, -12);
  g.add(byersGlass);

  const rutter = new THREE.Mesh(new THREE.BoxGeometry(74, 22, 34), terracottaMat);
  rutter.position.set(0, 11, 66);
  rutter.castShadow = true;
  g.add(rutter);

  ctx.group.add(g);
}

function buildSFSUCampus(ctx: ModelContext): void {
  const enu = latLonToENU(37.7228, -122.4782);
  const baseY = Math.max(8, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);

  const stoneMat = ctx.mat('#EAE4D8', '#F5F2EC', 0.66, 0.08);
  const concreteMat = ctx.mat('#CFC9BD', '#E2DDD4', 0.74, 0.06);
  const glassMat = ctx.mat('#235478', '#5280A4', 0.14, 0.86);
  const pyramidMat = ctx.mat('#3B7398', '#6899BC', 0.2, 0.75);
  const lawnMat = ctx.mat('#4B7E42', '#70A466', 0.88, 0.0);

  const quad = new THREE.Mesh(new THREE.BoxGeometry(170, 1.2, 120), lawnMat);
  quad.position.set(0, 0.6, 0);
  quad.receiveShadow = true;
  g.add(quad);

  const libMain = new THREE.Mesh(new THREE.BoxGeometry(88, 28, 56), stoneMat);
  libMain.position.set(0, 14, 72);
  libMain.castShadow = true;
  libMain.receiveShadow = true;
  g.add(libMain);

  const libAtrium = new THREE.Mesh(new THREE.BoxGeometry(46, 31, 60), glassMat);
  libAtrium.position.set(0, 15.5, 72);
  g.add(libAtrium);

  const chavezBase = new THREE.Mesh(new THREE.BoxGeometry(58, 14, 52), concreteMat);
  chavezBase.position.set(-76, 7, -8);
  chavezBase.castShadow = true;
  g.add(chavezBase);

  for (const [px, pz, r] of [
    [-84, -18, 16],
    [-66, 6, 13],
  ]) {
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(r, 15, 4), pyramidMat);
    pyr.rotation.y = Math.PI / 4;
    pyr.position.set(px, 21.5, pz);
    pyr.castShadow = true;
    g.add(pyr);
  }

  const chavezTower = new THREE.Mesh(new THREE.BoxGeometry(9, 28, 9), concreteMat);
  chavezTower.position.set(-54, 14, -26);
  chavezTower.castShadow = true;
  g.add(chavezTower);

  const thornton = new THREE.Mesh(new THREE.BoxGeometry(44, 34, 76), stoneMat);
  thornton.position.set(86, 17, -14);
  thornton.castShadow = true;
  g.add(thornton);

  const hensill = new THREE.Mesh(new THREE.BoxGeometry(84, 24, 34), concreteMat);
  hensill.position.set(12, 12, -74);
  hensill.castShadow = true;
  g.add(hensill);

  ctx.group.add(g);
}

function buildUCLawSF(ctx: ModelContext): void {
  const enu = latLonToENU(37.7812, -122.4158);
  const baseY = Math.max(4, ctx.sampleGround(enu.x, enu.z));
  const g = new THREE.Group();
  g.position.set(enu.x, baseY, enu.z);
  g.rotation.y = (9 * Math.PI) / 180;

  const stoneMat = ctx.mat('#E5DFD3', '#F3F0E8', 0.65, 0.08);
  const glassMat = ctx.mat('#275478', '#5682A6', 0.14, 0.86);
  const terracottaMat = ctx.mat('#C46E52', '#D48268', 0.58, 0.1);

  const villageTower = new THREE.Mesh(new THREE.BoxGeometry(36, 52, 28), stoneMat);
  villageTower.position.set(24, 26, 14);
  villageTower.castShadow = true;
  villageTower.receiveShadow = true;
  g.add(villageTower);

  const villageGlass = new THREE.Mesh(new THREE.BoxGeometry(37, 44, 20), glassMat);
  villageGlass.position.set(24, 27, 14);
  g.add(villageGlass);

  const cotchett = new THREE.Mesh(new THREE.BoxGeometry(42, 28, 30), glassMat);
  cotchett.position.set(-22, 14, -18);
  cotchett.castShadow = true;
  g.add(cotchett);

  const cotchettFrame = new THREE.Mesh(new THREE.BoxGeometry(44, 4, 32), terracottaMat);
  cotchettFrame.position.set(-22, 27, -18);
  g.add(cotchettFrame);

  const mcallister200 = new THREE.Mesh(new THREE.BoxGeometry(32, 56, 26), stoneMat);
  mcallister200.position.set(-24, 28, 18);
  mcallister200.castShadow = true;
  g.add(mcallister200);

  ctx.group.add(g);
}
