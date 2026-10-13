// GoldenGateBridge.ts — Dedicated 3D Architectural & Engineering Model of the Golden Gate Bridge
// Features:
// - 227.4 m Art Deco Stepped Cellular Steel Towers (South Tower on elliptical concrete ocean fender + North Marin Tower)
// - 4 Upper Art Deco Horizontal Portal Struts with vertical architectural ribs + 2 Lower X-Braced Bays below deck
// - 3 Separate Parabolic Catenary Main Cable Spans per side (South Side Span, 1,280 m Main Span, North Side Span)
//   so cables meet tower saddles with crisp engineering accuracy and zero spline overshoot
// - Twin vertical suspender ropes & cast-steel cable bands every 22 m
// - 7.6 m-deep Open Warren Stiffening Side Trusses (top & bottom chords, vertical posts, diagonal struts, floorbeams)
// - 6-lane roadway deck with golden median, white lane stripes, raised sidewalks, handrails, and Art Deco lampposts
// - Monumental Art Deco concrete anchorages & pylons + terrain-clamped Presidio & Marin approach viaducts
// - Historic Fort Point brick casemate fortress & South Arch steel truss beneath the south side span

import * as THREE from 'three';
import { latLonToENU } from '../world/coords';
import type { BridgeCorridor, ModelContext } from './types';

export function buildGoldenGateBridge(ctx: ModelContext): void {
  // Exact real-world South & North suspension anchorage coordinates across the Golden Gate strait
  const southAnch = latLonToENU(37.8108, -122.4774);
  const northAnch = latLonToENU(37.8286, -122.4793);

  const ggb = new THREE.Group();
  const cx = (southAnch.x + northAnch.x) * 0.5;
  const cz = (southAnch.z + northAnch.z) * 0.5;
  ggb.position.set(cx, 0, cz);

  const angle = Math.atan2(northAnch.x - southAnch.x, northAnch.z - southAnch.z);
  ggb.rotation.y = angle;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Authentic International Orange (C = 0%, M = 69%, Y = 100%, K = 6% -> #F04A00 / #C0362C)
  const orangeMat = ctx.mat('#E04412', '#E04412', 0.42, 0.34);
  const darkOrangeMat = ctx.mat('#B8340B', '#C83B0E', 0.50, 0.30);
  const cableMat = ctx.mat('#EC4E1A', '#E04412', 0.36, 0.40);
  const roadDeckMat = ctx.mat('#34373D', '#4A4E54', 0.78, 0.08);
  const laneMarkMat = ctx.mat('#EAECEF', '#FFFFFF', 0.5, 0.05);
  const sidewalkMat = ctx.mat('#B8B3A8', '#E5E0D5', 0.75, 0.05);
  const medianMat = ctx.mat('#F6C84B', '#F6C84B', 0.5, 0.1);
  const concreteMat = ctx.mat('#D8D2C5', '#EAE6DC', 0.82, 0.05);
  const fortBrickMat = ctx.mat('#984532', '#C98A76', 0.82, 0.05);

  const mainSpan = 1280; // 4,200 ft main span
  const sideSpan = 343;  // 1,125 ft side spans
  const suspLen = mainSpan + sideSpan * 2; // 1,966 m total suspension structure
  const southApproachLen = 285; // Presidio approach viaduct to Toll Plaza bluff
  const northApproachLen = 245; // Marin Headlands approach viaduct to US-101 cut
  const zMin = -suspLen * 0.5 - southApproachLen;
  const zMax = suspLen * 0.5 + northApproachLen;
  const totalDeckLen = zMax - zMin;

  const towerH = 227.4; // 746 ft above water
  const deckY = 67.1;   // 220 ft clearance above MHHW
  const deckW = 27.4;   // 90 ft total width
  const cableOffsetX = 13.2;

  // Smooth parabolic camber across the suspension span, gently ramping down to meet Presidio & Marin ground
  const getDeckY = (z: number): number => {
    const halfSusp = suspLen * 0.5;
    if (Math.abs(z) <= halfSusp) {
      const u = z / halfSusp;
      return deckY + (1 - u * u) * 4.8;
    }
    if (z < -halfSusp) {
      const t = Math.min(1, (-halfSusp - z) / southApproachLen);
      const s = t * t * (3 - 2 * t);
      return deckY - s * 22.5; // Ramps smoothly to 44.6m at Presidio Toll Plaza
    }
    const t = Math.min(1, (z - halfSusp) / northApproachLen);
    const s = t * t * (3 - 2 * t);
    return deckY - s * 13.0; // Ramps smoothly to 54.1m at Marin US-101 highway cut
  };

  const bridgeCorridor: BridgeCorridor = {
    cx,
    cz,
    cosA,
    sinA,
    halfWidth: deckW * 0.5 + 2,
    halfLength: totalDeckLen * 0.48,
    deckY,
    camberM: 4.8,
    getDeckY,
  };
  ctx.bridgeCorridors.push(bridgeCorridor);

  // Convert local bridge (lx, lz) to world (wx, wz) for exact terrain clamping
  const toWorldXZ = (lx: number, lz: number): [number, number] => [
    cx + lx * cosA + lz * sinA,
    cz - lx * sinA + lz * cosA,
  ];

  // === A. SOUTH & NORTH ART DECO TOWERS (z = -640 m and z = +640 m) ===
  for (const [tIdx, tz] of [-mainSpan * 0.5, mainSpan * 0.5].entries()) {
    // Concrete elliptical pier & fender ring
    const fenderW = tIdx === 0 ? 25 : 19;
    const fenderL = tIdx === 0 ? 48 : 34;
    const fenderGeo = new THREE.CylinderGeometry(fenderW, fenderW + 2.5, 18, 32);
    fenderGeo.scale(1.55, 1, fenderL / (fenderW * 2));
    const fender = new THREE.Mesh(fenderGeo, concreteMat);
    fender.position.set(0, 1.5, tz);
    fender.receiveShadow = true;
    ggb.add(fender);

    // Concrete tower pedestals under each leg
    for (const lx of [-cableOffsetX, cableOffsetX]) {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(10.5, 14, 14.5), concreteMat);
      ped.position.set(lx, 7, tz);
      ggb.add(ped);
    }

    // Stepped Art Deco cellular tower legs (5 setback tiers + fluted vertical cells)
    const tiers = [
      { y0: 11, y1: 68, w: 7.8, d: 11.4 },
      { y0: 68, y1: 112, w: 6.8, d: 9.8 },
      { y0: 112, y1: 154, w: 5.8, d: 8.2 },
      { y0: 154, y1: 192, w: 4.8, d: 6.8 },
      { y0: 192, y1: 226, w: 3.9, d: 5.4 },
    ];

    for (const lx of [-cableOffsetX, cableOffsetX]) {
      for (const t of tiers) {
        const h = t.y1 - t.y0;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(t.w, h, t.d), orangeMat);
        shaft.position.set(lx, t.y0 + h * 0.5, tz);
        shaft.castShadow = true;
        shaft.receiveShadow = true;
        ggb.add(shaft);

        // Stepped cellular flanges on front/back & sides
        const flangeA = new THREE.Mesh(
          new THREE.BoxGeometry(t.w + 1.1, h - 0.6, t.d * 0.52),
          darkOrangeMat
        );
        flangeA.position.set(lx, t.y0 + h * 0.5, tz);
        ggb.add(flangeA);

        const flangeB = new THREE.Mesh(
          new THREE.BoxGeometry(t.w * 0.52, h - 0.6, t.d + 1.0),
          darkOrangeMat
        );
        flangeB.position.set(lx, t.y0 + h * 0.5, tz);
        ggb.add(flangeB);
      }

      // Cast-steel roller saddle housing at 227.4 m apex
      const saddleCap = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.6, 7.2), darkOrangeMat);
      saddleCap.position.set(lx, towerH - 1.2, tz);
      ggb.add(saddleCap);
    }

    // 4 Upper Art Deco Horizontal Portal Struts ABOVE roadway deck
    const upperPortals = [
      { y: 106, h: 8.6 },
      { y: 148, h: 7.8 },
      { y: 186, h: 7.0 },
      { y: 218, h: 6.6 },
    ];
    for (const p of upperPortals) {
      const portalBeam = new THREE.Mesh(
        new THREE.BoxGeometry(cableOffsetX * 2 - 2, p.h, 6.2),
        orangeMat
      );
      portalBeam.position.set(0, p.y, tz);
      portalBeam.castShadow = true;
      ggb.add(portalBeam);

      // Art Deco haunched corner brackets under each portal strut
      for (const sx of [-1, 1]) {
        const haunch = new THREE.Mesh(new THREE.BoxGeometry(4.2, p.h + 4.8, 5.6), darkOrangeMat);
        haunch.position.set(sx * (cableOffsetX - 3.6), p.y - 1.8, tz);
        ggb.add(haunch);
      }

      // Vertical Art Deco portal ribs
      for (const fx of [-7.6, -3.8, 0, 3.8, 7.6]) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, p.h + 2.0, 6.8),
          darkOrangeMat
        );
        fin.position.set(fx, p.y, tz);
        ggb.add(fin);
      }
    }

    // Roadway-level main cross girder at y = 66m
    const deckGirder = new THREE.Mesh(
      new THREE.BoxGeometry(cableOffsetX * 2 + 4, 3.6, 6.8),
      darkOrangeMat
    );
    deckGirder.position.set(0, 65.5, tz);
    ggb.add(deckGirder);

    // 2 Lower Diagonal X-Braced Bays BELOW the roadway deck
    const xBays = [
      [14, 39],
      [39, 64],
    ];
    for (const [by0, by1] of xBays) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(cableOffsetX * 2 - 2, 2.8, 4.2),
        orangeMat
      );
      bar.position.set(0, by0, tz);
      ggb.add(bar);

      ctx.addStrutBetween(
        ggb,
        new THREE.Vector3(-cableOffsetX + 2, by0, tz),
        new THREE.Vector3(cableOffsetX - 2, by1, tz),
        0.95,
        darkOrangeMat
      );
      ctx.addStrutBetween(
        ggb,
        new THREE.Vector3(cableOffsetX - 2, by0, tz),
        new THREE.Vector3(-cableOffsetX + 2, by1, tz),
        0.95,
        darkOrangeMat
      );
    }

    // Red aviation obstruction beacons atop both tower legs
    ctx.addBeacon(ggb, -cableOffsetX, towerH + 3.0, tz, 0xff2a10, 2.0, 3.0, tIdx);
    ctx.addBeacon(ggb, cableOffsetX, towerH + 3.0, tz, 0xff2a10, 2.0, 3.0, tIdx + 1.5);
  }

  // === B. ROADWAY DECK, OPEN WARREN STIFFENING TRUSS & SIDEWALKS ===
  const deckSegs = 88;
  const segLen = totalDeckLen / deckSegs;
  const trussDepth = 7.6; // 25 ft deep stiffening truss

  for (let i = 0; i < deckSegs; i++) {
    const z0 = zMin + (i / deckSegs) * totalDeckLen;
    const z1 = zMin + ((i + 1) / deckSegs) * totalDeckLen;
    const zMid = (z0 + z1) * 0.5;
    const y0 = getDeckY(z0);
    const y1 = getDeckY(z1);
    const yMid = (y0 + y1) * 0.5;
    const slopePitch = Math.atan2(y1 - y0, segLen);

    const segGroup = new THREE.Group();
    segGroup.position.set(0, yMid, zMid);
    segGroup.rotation.x = -slopePitch;

    // 6-lane asphalt roadway slab
    const roadSlab = new THREE.Mesh(
      new THREE.BoxGeometry(deckW - 4.4, 1.0, segLen + 0.25),
      roadDeckMat
    );
    roadSlab.receiveShadow = true;
    segGroup.add(roadSlab);

    // Golden median barrier
    const median = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.85, segLen + 0.2),
      medianMat
    );
    median.position.set(0, 0.55, 0);
    segGroup.add(median);

    // Dashed white lane dividers
    for (const lx of [-7.4, -3.7, 3.7, 7.4]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, segLen * 0.55),
        laneMarkMat
      );
      stripe.position.set(lx, 0.54, 0);
      segGroup.add(stripe);
    }

    // Raised East & West Pedestrian Sidewalks + International Orange Handrails
    for (const sx of [-(deckW * 0.5 - 1.2), deckW * 0.5 - 1.2]) {
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.35, segLen + 0.25),
        sidewalkMat
      );
      sw.position.set(sx, 0.2, 0);
      segGroup.add(sw);

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 1.55, segLen + 0.25),
        orangeMat
      );
      rail.position.set(sx + Math.sign(sx) * 1.05, 1.25, 0);
      segGroup.add(rail);
    }

    // Open Warren Stiffening Truss Chords, Verticals & Floorbeams
    for (const tx of [-cableOffsetX, cableOffsetX]) {
      const topChord = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 1.15, segLen + 0.25),
        orangeMat
      );
      topChord.position.set(tx, -0.4, 0);
      segGroup.add(topChord);

      const botChord = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 1.15, segLen + 0.25),
        darkOrangeMat
      );
      botChord.position.set(tx, -trussDepth, 0);
      segGroup.add(botChord);

      // Vertical truss posts at segment ends
      const vPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, trussDepth, 0.85),
        darkOrangeMat
      );
      vPost.position.set(tx, -trussDepth * 0.5, -segLen * 0.5);
      segGroup.add(vPost);
    }

    // Transverse floorbeam + bottom lateral bracing
    const crossBeam = new THREE.Mesh(
      new THREE.BoxGeometry(cableOffsetX * 2, 1.5, 1.1),
      darkOrangeMat
    );
    crossBeam.position.set(0, -trussDepth * 0.45, 0);
    segGroup.add(crossBeam);

    ggb.add(segGroup);

    // Diagonal Warren truss web members along both sides
    for (const tx of [-cableOffsetX, cableOffsetX]) {
      const pTopA = new THREE.Vector3(tx, y0 - 0.5, z0);
      const pBotM = new THREE.Vector3(tx, yMid - trussDepth, zMid);
      const pTopB = new THREE.Vector3(tx, y1 - 0.5, z1);
      ctx.addStrutBetween(ggb, pTopA, pBotM, 0.52, orangeMat);
      ctx.addStrutBetween(ggb, pBotM, pTopB, 0.52, orangeMat);
    }

    // Art Deco roadway lampposts every 2 segments
    if (i % 2 === 0 && Math.abs(zMid) < suspLen * 0.49) {
      for (const lx of [-cableOffsetX + 0.8, cableOffsetX - 0.8]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.24, 7.2, 6),
          orangeMat
        );
        pole.position.set(lx, yMid + 3.6, zMid);
        ggb.add(pole);
        ctx.addBeacon(ggb, lx, yMid + 7.4, zMid, 0xffd280, 0.72, 0);
      }
    }
  }

  // === C. 3-SPAN PARABOLIC CATENARY MAIN CABLES & TWIN VERTICAL SUSPENDERS ===
  // Building each span (South Side Span, Main Span, North Side Span) as its own exact catenary curve
  // guarantees a crisp saddle apex at each tower with zero spline overshoot!
  const halfMain = mainSpan * 0.5;
  const halfSusp = suspLen * 0.5;
  const sagMidY = getDeckY(0) + 4.0;
  const southAnchCableY = getDeckY(-halfSusp) - 2.0;
  const northAnchCableY = getDeckY(halfSusp) - 2.0;

  const cableCurve = (z: number): number => {
    if (Math.abs(z) <= halfMain) {
      const u = z / halfMain;
      return sagMidY + (towerH - sagMidY) * u * u;
    } else if (z < -halfMain) {
      // u = 0 at South Anchorage (-halfSusp), u = 1 at South Tower (-halfMain)
      const u = (z - -halfSusp) / sideSpan;
      // Catenary sag in side span
      return southAnchCableY + (towerH - southAnchCableY) * (0.82 * u + 0.18 * u * u);
    } else {
      // u = 0 at North Anchorage (+halfSusp), u = 1 at North Tower (+halfMain)
      const u = (halfSusp - z) / sideSpan;
      return northAnchCableY + (towerH - northAnchCableY) * (0.82 * u + 0.18 * u * u);
    }
  };

  const spanRanges: [number, number, number][] = [
    [-halfSusp, -halfMain, 28],
    [-halfMain, halfMain, 64],
    [halfMain, halfSusp, 28],
  ];

  for (const sideX of [-cableOffsetX, cableOffsetX]) {
    for (const [zStart, zEnd, steps] of spanRanges) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const z = zStart + (i / steps) * (zEnd - zStart);
        pts.push(new THREE.Vector3(sideX, cableCurve(z), z));
      }
      const path = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(path, steps, 0.94, 10, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, cableMat);
      tubeMesh.castShadow = true;
      ggb.add(tubeMesh);
    }

    // Vertical suspender rope pairs + cast-steel cable bands every 22.8 m (75 ft)
    for (let z = -halfSusp + 16; z <= halfSusp - 16; z += 22.8) {
      if (Math.abs(Math.abs(z) - halfMain) < 11) continue;
      const cY = cableCurve(z);
      const dY = getDeckY(z);
      const h = cY - dY;
      if (h > 1.8) {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(1.18, 1.18, 1.8, 8),
          darkOrangeMat
        );
        band.rotation.x = Math.PI / 2;
        band.position.set(sideX, cY, z);
        ggb.add(band);

        for (const dzRope of [-0.42, 0.42]) {
          const susp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, h, 5),
            darkOrangeMat
          );
          susp.position.set(sideX, dY + h * 0.5, z + dzRope);
          ggb.add(susp);
        }
      }
    }
  }

  // === D. MONUMENTAL ART DECO CONCRETE ANCHORAGES, PYLONS & TERRAIN-CLAMPED VIADUCT BENTS ===
  for (const sgn of [-1, 1]) {
    const anchZ = sgn * halfSusp;
    const [wxAnch, wzAnch] = toWorldXZ(0, anchZ);
    const groundAnch = Math.max(-4, ctx.sampleGround(wxAnch, wzAnch));
    const dY = getDeckY(anchZ);

    // Twin Art Deco concrete pylons flanking the roadway at the end of each side span
    const pylonTop = dY + 18;
    const pylonH = Math.max(30, pylonTop - groundAnch + 12);
    for (const px of [-15.2, 15.2]) {
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(7.6, pylonH, 16.5),
        concreteMat
      );
      pylon.position.set(px, pylonTop - pylonH * 0.5, anchZ);
      pylon.castShadow = true;
      pylon.receiveShadow = true;
      ggb.add(pylon);
    }

    // Massive concrete cable anchorage housing blocks where main cables splay into bedrock
    const housingTop = dY - 2;
    const housingH = Math.max(24, housingTop - groundAnch + 14);
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(36, housingH, 52),
      concreteMat
    );
    housing.position.set(0, housingTop - housingH * 0.5, anchZ + sgn * 24);
    housing.receiveShadow = true;
    ggb.add(housing);

    // Terrain-clamped steel approach viaduct bents + terminal concrete abutment into cliff/bluff
    const appLen = sgn < 0 ? southApproachLen : northApproachLen;
    const stepD = 46;
    for (let d = 55; d <= appLen; d += stepD) {
      const bz = anchZ + sgn * d;
      const [wx, wz] = toWorldXZ(0, bz);
      const gY = Math.max(-2, ctx.sampleGround(wx, wz));
      const topY = getDeckY(bz) - trussDepth;
      const bentH = topY - (gY - 8);
      if (bentH > 3) {
        for (const lx of [-11.5, 11.5]) {
          const bent = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, bentH, 3.4),
            orangeMat
          );
          bent.position.set(lx, gY - 8 + bentH * 0.5, bz);
          bent.castShadow = true;
          ggb.add(bent);
        }
        // Horizontal cross-strut on tall approach bents
        if (bentH > 22) {
          const cross = new THREE.Mesh(
            new THREE.BoxGeometry(25, 2.0, 2.6),
            darkOrangeMat
          );
          cross.position.set(0, gY - 4 + bentH * 0.55, bz);
          ggb.add(cross);
        }
      }
    }

    // Terminal concrete abutment retaining wall anchoring the end of the approach deck to the bluff
    const endZ = anchZ + sgn * appLen;
    const [wxEnd, wzEnd] = toWorldXZ(0, endZ);
    const gEnd = Math.max(0, ctx.sampleGround(wxEnd, wzEnd));
    const endTop = getDeckY(endZ);
    const abutH = Math.max(16, endTop - gEnd + 14);
    const abutment = new THREE.Mesh(
      new THREE.BoxGeometry(deckW + 6, abutH, 18),
      concreteMat
    );
    abutment.position.set(0, endTop - abutH * 0.5, endZ);
    ggb.add(abutment);

    // Terrain-conforming US-101 highway connector apron beyond the abutment (Presidio & Marin Headlands)
    const connSteps = 12;
    const connLen = 220;
    const connStepLen = connLen / connSteps;
    for (let s = 0; s < connSteps; s++) {
      const cz0 = endZ + sgn * (s * connStepLen);
      const cz1 = endZ + sgn * ((s + 1) * connStepLen);
      const czMid = (cz0 + cz1) * 0.5;
      const t0 = s / connSteps;
      const t1 = (s + 1) / connSteps;
      const [wx0, wz0] = toWorldXZ(0, cz0);
      const [wx1, wz1] = toWorldXZ(0, cz1);
      const g0 = Math.max(12, ctx.sampleGround(wx0, wz0)) + 0.65;
      const g1 = Math.max(12, ctx.sampleGround(wx1, wz1)) + 0.65;
      const y0 = endTop * (1 - t0) + g0 * t0;
      const y1 = endTop * (1 - t1) + g1 * t1;
      const yMid = (y0 + y1) * 0.5;
      const dzSigned = cz1 - cz0;
      const pitch = Math.atan2(y1 - y0, dzSigned);

      const hwGroup = new THREE.Group();
      hwGroup.position.set(0, yMid, czMid);
      hwGroup.rotation.x = -pitch;

      const hwSlab = new THREE.Mesh(
        new THREE.BoxGeometry(deckW - 3.0, 0.9, connStepLen + 0.4),
        roadDeckMat
      );
      hwSlab.receiveShadow = true;
      hwGroup.add(hwSlab);

      const hwMedian = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.75, connStepLen + 0.3),
        medianMat
      );
      hwMedian.position.set(0, 0.5, 0);
      hwGroup.add(hwMedian);

      for (const swX of [-(deckW * 0.5 - 0.8), deckW * 0.5 - 0.8]) {
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 1.1, connStepLen + 0.4),
          sidewalkMat
        );
        curb.position.set(swX, 0.15, 0);
        hwGroup.add(curb);
      }

      // Embankment support skirt down to ground
      const skirtH = Math.max(4, yMid - Math.min(g0, g1) + 6);
      const skirt = new THREE.Mesh(
        new THREE.BoxGeometry(deckW + 2.0, skirtH, connStepLen + 0.3),
        concreteMat
      );
      skirt.position.set(0, -skirtH * 0.5, 0);
      hwGroup.add(skirt);

      ggb.add(hwGroup);
    }
  }

  // Historic Art Deco Golden Gate Bridge Toll Plaza Canopy on the South (Presidio) approach
  const tollZ = zMin - 32;
  const [wxToll, wzToll] = toWorldXZ(0, tollZ);
  const tollY = Math.max(getDeckY(zMin) - 1.5, ctx.sampleGround(wxToll, wzToll) + 0.65);
  const tollGroup = new THREE.Group();
  tollGroup.position.set(0, tollY, tollZ);
  const tollCanopy = new THREE.Mesh(new THREE.BoxGeometry(36, 1.6, 8.5), concreteMat);
  tollCanopy.position.set(0, 6.4, 0);
  tollGroup.add(tollCanopy);
  const tollFascia = new THREE.Mesh(new THREE.BoxGeometry(36.4, 0.9, 8.8), orangeMat);
  tollFascia.position.set(0, 7.2, 0);
  tollGroup.add(tollFascia);
  for (let bx = -13.5; bx <= 13.5; bx += 5.4) {
    const booth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.8, 4.2), concreteMat);
    booth.position.set(bx, 2.9, 0);
    tollGroup.add(booth);
  }
  ggb.add(tollGroup);

  // === E. HISTORIC FORT POINT & SOUTH ARCH TRUSS BENEATH SOUTH SIDE SPAN ===
  const fortZ = -halfSusp + 148;
  const fortGroup = new THREE.Group();
  fortGroup.position.set(-5, 0, fortZ);
  const fortWalls = [
    { x: 0, z: -20, w: 48, d: 8 },
    { x: 0, z: 20, w: 48, d: 8 },
    { x: -20, z: 0, w: 8, d: 32 },
    { x: 20, z: 0, w: 8, d: 32 },
  ];
  for (const fw of fortWalls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(fw.w, 16, fw.d), fortBrickMat);
    m.position.set(fw.x, 8, fw.z);
    m.castShadow = true;
    fortGroup.add(m);
  }
  ggb.add(fortGroup);

  // Famous 97 m Steel Arch spanning over Fort Point
  const archSpan = 112;
  const archSteps = 20;
  for (const ax of [-cableOffsetX, cableOffsetX]) {
    const archPts: THREE.Vector3[] = [];
    for (let i = 0; i <= archSteps; i++) {
      const u = i / archSteps - 0.5;
      const az = fortZ + u * archSpan;
      const ay = 14 + (1 - 4 * u * u) * 44;
      archPts.push(new THREE.Vector3(ax, ay, az));
    }
    const archCurve = new THREE.CatmullRomCurve3(archPts);
    ggb.add(
      new THREE.Mesh(new THREE.TubeGeometry(archCurve, 20, 1.5, 6, false), orangeMat)
    );

    // Vertical spandrel columns from the Fort Point arch up to the stiffening truss
    for (let i = 2; i <= archSteps - 2; i += 2) {
      const u = i / archSteps - 0.5;
      const az = fortZ + u * archSpan;
      const ay = 14 + (1 - 4 * u * u) * 44;
      const topY = getDeckY(az) - trussDepth;
      if (topY > ay + 1) {
        const col = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, topY - ay, 1.1),
          darkOrangeMat
        );
        col.position.set(ax, (ay + topY) * 0.5, az);
        ggb.add(col);
      }
    }
  }

  // === F. LIVE MOVING TRAFFIC ACROSS THE GOLDEN GATE BRIDGE ===
  ctx.spawnBridgeTraffic(ggb, bridgeCorridor, 54);

  ctx.group.add(ggb);
}
