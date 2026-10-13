// BayBridge.ts — Dedicated 3D Architectural & Engineering Model of the San Francisco–Oakland Bay Bridge
// Includes:
// 1. West Span Double-Deck Tandem Suspension Bridge (Rincon Hill SF to Yerba Buena Island):
//    - 4 Diamond/X-Braced 160 m Steel Suspension Towers (W2, W3, W5, W6)
//    - Monumental Center Concrete Anchorage Pier W4 mid-bay + Pier W1 & YBI portal
//    - Open Double-Deck Warren Truss (top & bottom chords, vertical posts, diagonal struts, upper & lower 5-lane roadways)
//    - 6 Separate Catenary Main Cable Spans per side with crisp tower saddles, vertical suspenders & "The Bay Lights" LEDs
// 2. East Span Self-Anchored Suspension (SAS) & Skyway Bridge (Yerba Buena Island to Oakland):
//    - Iconic 160 m Single White 4-Shaft Tapering SAS Tower with shear-link diaphragms
//    - Twin parallel aerodynamic white box-girder decks with crossbeams and concrete Y-piers
//    - Asymmetrical 3D Loop Suspension Cable + inclined suspender cables fanning to the deck edges

import * as THREE from 'three';
import { latLonToENU } from '../world/coords';
import type { BridgeCorridor, ModelContext } from './types';

export function buildBayBridge(ctx: ModelContext): void {
  const sfAnch = latLonToENU(37.7862, -122.3905); // Rincon Hill SF Anchorage
  const ybiWest = latLonToENU(37.8085, -122.3665); // Yerba Buena Island West Tunnel Portal

  const westGroup = new THREE.Group();
  const cx = (sfAnch.x + ybiWest.x) * 0.5;
  const cz = (sfAnch.z + ybiWest.z) * 0.5;
  westGroup.position.set(cx, 0, cz);

  const spanLen = Math.hypot(ybiWest.x - sfAnch.x, ybiWest.z - sfAnch.z);
  const angle = Math.atan2(ybiWest.x - sfAnch.x, ybiWest.z - sfAnch.z);
  westGroup.rotation.y = angle;

  const steelMat = ctx.mat('#A8B2BC', '#C4C9CF', 0.42, 0.48);
  const darkSteelMat = ctx.mat('#7E8892', '#9FA6B0', 0.50, 0.42);
  const roadMat = ctx.mat('#363A40', '#4E525A', 0.80, 0.08);
  const sasWhiteMat = ctx.mat('#F2F5F8', '#FFFFFF', 0.32, 0.28);
  const concreteMat = ctx.mat('#CFCABE', '#E2DED6', 0.82, 0.05);

  const deckY = 58.0;
  const lowerDeckY = deckY - 8.8;
  const deckW = 22.6;
  const trussX = 11.4;

  const westCorridor: BridgeCorridor = {
    cx,
    cz,
    cosA: Math.cos(angle),
    sinA: Math.sin(angle),
    halfWidth: deckW * 0.5 + 2,
    halfLength: spanLen * 0.5,
    deckY,
    camberM: 3.5,
  };
  ctx.bridgeCorridors.push(westCorridor);

  // === A. OPEN DOUBLE-DECK WARREN TRUSS & UPPER/LOWER ROADWAYS ===
  const upperDeck = new THREE.Mesh(
    new THREE.BoxGeometry(deckW, 1.1, spanLen),
    roadMat
  );
  upperDeck.position.set(0, deckY, 0);
  upperDeck.receiveShadow = true;
  westGroup.add(upperDeck);

  const lowerDeck = new THREE.Mesh(
    new THREE.BoxGeometry(deckW, 1.1, spanLen),
    roadMat
  );
  lowerDeck.position.set(0, lowerDeckY, 0);
  lowerDeck.receiveShadow = true;
  westGroup.add(lowerDeck);

  // Top & bottom continuous steel truss chords along both sides (open between upper & lower decks!)
  for (const tx of [-trussX, trussX]) {
    const topChord = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.3, spanLen),
      steelMat
    );
    topChord.position.set(tx, deckY + 0.6, 0);
    westGroup.add(topChord);

    const botChord = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.3, spanLen),
      darkSteelMat
    );
    botChord.position.set(tx, lowerDeckY - 0.5, 0);
    westGroup.add(botChord);
  }

  // Open Warren Truss vertical posts, diagonals & floorbeams along the entire West Span
  const baySegs = 92;
  const segLen = spanLen / baySegs;
  for (let i = 0; i < baySegs; i++) {
    const z0 = (i / baySegs - 0.5) * spanLen;
    const z1 = ((i + 1) / baySegs - 0.5) * spanLen;
    const zMid = (z0 + z1) * 0.5;

    // Cross floorbeam under upper deck
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(trussX * 2, 1.1, 0.9),
      darkSteelMat
    );
    beam.position.set(0, deckY - 0.9, z0);
    westGroup.add(beam);

    for (const tx of [-trussX, trussX]) {
      // Vertical post connecting lower and upper chords
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, deckY - lowerDeckY + 1.2, 0.85),
        steelMat
      );
      post.position.set(tx, (deckY + lowerDeckY) * 0.5, z0);
      westGroup.add(post);

      // Warren truss diagonals
      ctx.addStrutBetween(
        westGroup,
        new THREE.Vector3(tx, deckY + 0.4, z0),
        new THREE.Vector3(tx, lowerDeckY - 0.3, zMid),
        0.46,
        steelMat
      );
      ctx.addStrutBetween(
        westGroup,
        new THREE.Vector3(tx, lowerDeckY - 0.3, zMid),
        new THREE.Vector3(tx, deckY + 0.4, z1),
        0.46,
        steelMat
      );
    }
  }

  // === B. MONUMENTAL CENTER CONCRETE ANCHORAGE PIER W4 & END ANCHORAGES ===
  const centerPierH = deckY + 26;
  const centerPier = new THREE.Mesh(
    new THREE.BoxGeometry(34, centerPierH, 56),
    concreteMat
  );
  centerPier.position.set(0, centerPierH * 0.5 - 6, 0);
  centerPier.castShadow = true;
  centerPier.receiveShadow = true;
  westGroup.add(centerPier);

  // Rincon Hill West Anchorage & YBI East Anchorage Pylons
  for (const sgn of [-1, 1]) {
    const endAnch = new THREE.Mesh(
      new THREE.BoxGeometry(30, deckY + 16, 40),
      concreteMat
    );
    endAnch.position.set(0, (deckY + 16) * 0.5 - 8, sgn * spanLen * 0.5);
    westGroup.add(endAnch);
  }

  // === C. 4 DIAMOND/X-BRACED STEEL SUSPENSION TOWERS (W2, W3, W5, W6) ===
  const tOuter = 0.35 * spanLen;
  const tInner = 0.14 * spanLen;
  const towerZPositions = [-tOuter, -tInner, tInner, tOuter];
  const towerHeights = [152.0, 160.3, 160.3, 152.0];

  for (const [idx, tz] of towerZPositions.entries()) {
    const tH = towerHeights[idx];
    const pier = new THREE.Mesh(
      new THREE.CylinderGeometry(17, 19.5, 16, 20),
      concreteMat
    );
    pier.scale.set(1.35, 1, 0.72);
    pier.position.set(0, 2.5, tz);
    westGroup.add(pier);

    for (const lx of [-trussX, trussX]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, tH, 5.8),
        steelMat
      );
      leg.position.set(lx, tH * 0.5, tz);
      leg.castShadow = true;
      westGroup.add(leg);

      // Cable saddle at top of each leg
      const saddle = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 3.2, 6.8),
        darkSteelMat
      );
      saddle.position.set(lx, tH + 1.0, tz);
      westGroup.add(saddle);
    }

    // Characteristic Bay Bridge Diamond/X-Bracing between tower legs
    const xIntervals = [
      [12, 46],
      [62, 96],
      [96, 126],
      [126, tH - 3],
    ];
    for (const [y0, y1] of xIntervals) {
      ctx.addStrutBetween(
        westGroup,
        new THREE.Vector3(-trussX, y0, tz),
        new THREE.Vector3(trussX, y1, tz),
        0.9,
        darkSteelMat
      );
      ctx.addStrutBetween(
        westGroup,
        new THREE.Vector3(trussX, y0, tz),
        new THREE.Vector3(-trussX, y1, tz),
        0.9,
        darkSteelMat
      );
    }
    for (const sy of [48, 60, 128, tH - 2]) {
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(trussX * 2 + 3, 3.4, 4.2),
        steelMat
      );
      cross.position.set(0, sy, tz);
      westGroup.add(cross);
    }

    ctx.addBeacon(westGroup, -trussX, tH + 3.0, tz, 0xffffff, 1.7, 2.4, idx);
    ctx.addBeacon(westGroup, trussX, tH + 3.0, tz, 0xffffff, 1.7, 2.4, idx + 1);
  }

  // === D. 6 SEPARATE CATENARY MAIN CABLE SPANS PER SIDE & SUSPENDERS ===
  // Keypoints: (-0.5L, anchY) -> (-tOuter, 152) -> (-tInner, 160.3) -> (0, centerAnchY) -> (+tInner, 160.3) -> (+tOuter, 152) -> (+0.5L, anchY)
  const centerAnchY = deckY + 18;
  const endAnchY = deckY + 4;
  const mainSpanSagY = deckY + 5.5;

  const cableSpans: { z0: number; y0: number; z1: number; y1: number; sagY: number | null; steps: number }[] = [
    { z0: -0.5 * spanLen, y0: endAnchY, z1: -tOuter, y1: 152.0, sagY: null, steps: 20 },
    { z0: -tOuter, y0: 152.0, z1: -tInner, y1: 160.3, sagY: mainSpanSagY, steps: 32 },
    { z0: -tInner, y0: 160.3, z1: 0, y1: centerAnchY, sagY: null, steps: 20 },
    { z0: 0, y0: centerAnchY, z1: tInner, y1: 160.3, sagY: null, steps: 20 },
    { z0: tInner, y0: 160.3, z1: tOuter, y1: 152.0, sagY: mainSpanSagY, steps: 32 },
    { z0: tOuter, y0: 152.0, z1: 0.5 * spanLen, y1: endAnchY, sagY: null, steps: 20 },
  ];

  const evalSpanY = (s: (typeof cableSpans)[0], u: number): number => {
    if (s.sagY !== null) {
      // Parabolic main suspension span with lowest point at u = 0.5
      const v = 2 * u - 1; // -1..+1
      const endY = u < 0.5 ? s.y0 : s.y1;
      return s.sagY + (endY - s.sagY) * v * v;
    }
    // Side span catenary dip
    const linY = s.y0 + (s.y1 - s.y0) * u;
    const dip = 4 * u * (1 - u) * 9.5;
    return linY - dip;
  };

  for (const sideX of [-trussX, trussX]) {
    for (const s of cableSpans) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= s.steps; i++) {
        const u = i / s.steps;
        const z = s.z0 + u * (s.z1 - s.z0);
        pts.push(new THREE.Vector3(sideX, evalSpanY(s, u), z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const cableMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, s.steps, 0.78, 8, false),
        steelMat
      );
      cableMesh.castShadow = true;
      westGroup.add(cableMesh);

      // Vertical suspender ropes along this span
      const suspCount = Math.floor(Math.abs(s.z1 - s.z0) / 28);
      for (let k = 1; k < suspCount; k++) {
        const u = k / suspCount;
        const z = s.z0 + u * (s.z1 - s.z0);
        const cy = evalSpanY(s, u);
        const h = cy - deckY;
        if (h > 2.5) {
          const susp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, h, 4),
            darkSteelMat
          );
          susp.position.set(sideX, deckY + h * 0.5, z);
          westGroup.add(susp);

          // Shimmering "The Bay Lights" LED nodes on North-West side
          if (sideX < 0 && k % 2 === 0) {
            ctx.addBeacon(
              westGroup,
              sideX,
              deckY + h * 0.55,
              z,
              0xe8f4ff,
              0.85,
              3.2,
              z * 0.015
            );
          }
        }
      }
    }
  }

  ctx.spawnBridgeTraffic(westGroup, westCorridor, 26);
  ctx.group.add(westGroup);

  // === E. EAST SPAN SELF-ANCHORED SUSPENSION (SAS) BRIDGE (Yerba Buena Island to Oakland) ===
  const ybiEast = latLonToENU(37.8122, -122.3622);
  const oaklandDir = latLonToENU(37.8215, -122.3320);
  const eastGroup = new THREE.Group();
  const ecx = (ybiEast.x + oaklandDir.x) * 0.5;
  const ecz = (ybiEast.z + oaklandDir.z) * 0.5;
  eastGroup.position.set(ecx, 0, ecz);
  const eLen = Math.hypot(oaklandDir.x - ybiEast.x, oaklandDir.z - ybiEast.z);
  const eAngle = Math.atan2(oaklandDir.x - ybiEast.x, oaklandDir.z - ybiEast.z);
  eastGroup.rotation.y = eAngle;

  // Twin parallel aerodynamic white box-girder roadways + transverse crossbeams
  for (const dx of [-16.5, 16.5]) {
    const boxDeck = new THREE.Mesh(new THREE.BoxGeometry(20.5, 4.4, eLen), sasWhiteMat);
    boxDeck.position.set(dx, 48, 0);
    boxDeck.castShadow = true;
    boxDeck.receiveShadow = true;
    eastGroup.add(boxDeck);

    const asphalt = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.6, eLen), roadMat);
    asphalt.position.set(dx, 50.4, 0);
    eastGroup.add(asphalt);
  }

  // Transverse steel cross-box beams connecting the Eastbound & Westbound decks
  for (let z = -eLen * 0.46; z <= eLen * 0.46; z += 72) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(34, 3.2, 3.6), sasWhiteMat);
    cross.position.set(0, 47.8, z);
    eastGroup.add(cross);
  }

  // Support piers along the East Span skyway
  for (let z = -eLen * 0.44; z <= eLen * 0.44; z += 155) {
    if (Math.abs(z - -eLen * 0.25) < 60) continue;
    for (const px of [-16.5, 16.5]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(6.2, 54, 8.2), concreteMat);
      pier.position.set(px, 21, z);
      eastGroup.add(pier);
    }
  }

  // Iconic Single 160 m White Four-Shaft Tapering SAS Tower
  const sasZ = -eLen * 0.25;
  const sasTowerH = 160.0;
  const towerFender = new THREE.Mesh(new THREE.BoxGeometry(28, 12, 28), concreteMat);
  towerFender.position.set(0, 2, sasZ);
  eastGroup.add(towerFender);

  for (const sx of [-3.6, 3.6]) {
    for (const sz of [-3.6, 3.6]) {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(1.85, 3.4, sasTowerH, 8),
        sasWhiteMat
      );
      shaft.position.set(sx, sasTowerH * 0.5, sasZ + sz);
      shaft.castShadow = true;
      eastGroup.add(shaft);
    }
  }
  for (const sy of [35, 65, 95, 125, 152]) {
    const link = new THREE.Mesh(new THREE.BoxGeometry(10.5, 3.5, 10.5), sasWhiteMat);
    link.position.set(0, sy, sasZ);
    eastGroup.add(link);
  }
  ctx.addBeacon(eastGroup, 0, sasTowerH + 3, sasZ, 0xffffff, 2.2);

  // Separate West & East SAS Main Cable curves meeting cleanly at the single tower saddle (0, 158, sasZ)
  const sasWestZ = -eLen * 0.39;
  const sasEastZ = eLen * 0.06;
  for (const sideX of [-25, 25]) {
    // West backstay span: (sideX, 50, sasWestZ) -> (sideX*0.14, 158, sasZ)
    const westPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18;
      const z = sasWestZ + u * (sasZ - sasWestZ);
      const y = 50 + (158 - 50) * Math.pow(u, 1.12);
      const x = sideX * (1 - u * 0.86);
      westPts.push(new THREE.Vector3(x, y, z));
    }
    eastGroup.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(westPts), 18, 0.78, 8, false),
        sasWhiteMat
      )
    );

    // East main SAS span: (sideX*0.14, 158, sasZ) -> (sideX, 50, sasEastZ)
    const eastPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      const z = sasZ + u * (sasEastZ - sasZ);
      const y = 50 + (158 - 50) * Math.pow(1 - u, 1.38);
      const x = sideX * (0.14 + u * 0.86);
      eastPts.push(new THREE.Vector3(x, y, z));

      // Inclined fan suspender cables from main cable down to outer deck edge
      if (i > 1 && i < 27 && i % 2 === 0) {
        ctx.addStrutBetween(
          eastGroup,
          new THREE.Vector3(x, y, z),
          new THREE.Vector3(sideX, 50, z),
          0.14,
          steelMat
        );
      }
    }
    eastGroup.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(eastPts), 28, 0.78, 8, false),
        sasWhiteMat
      )
    );
  }

  ctx.group.add(eastGroup);
}
