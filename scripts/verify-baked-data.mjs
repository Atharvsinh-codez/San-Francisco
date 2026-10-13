import * as fs from 'node:fs';

const bldgManifest = JSON.parse(fs.readFileSync('public/data/buildings/manifest.json', 'utf8'));
const landmarks = JSON.parse(fs.readFileSync('public/data/landmarks.json', 'utf8'));
const terrainMeta = JSON.parse(fs.readFileSync('public/data/terrain/manifest.json', 'utf8'));
const orthoStat = fs.statSync('public/data/imagery/sf_ortho_2048.jpg');

if (bldgManifest.totalBuildings < 150000) {
  throw new Error(`Expected >= 150,000 buildings, got ${bldgManifest.totalBuildings}`);
}
if (bldgManifest.cells.length !== 36) {
  throw new Error(`Expected 36 building cells, got ${bldgManifest.cells.length}`);
}

const uniIds = ['usf-campus', 'ucsf-parnassus', 'ucsf-mission-bay', 'sfsu-campus', 'uc-law-sf'];
for (const id of uniIds) {
  if (!landmarks.landmarks.some((l) => l.id === id)) {
    throw new Error(`Missing 3D university landmark in landmarks.json: ${id}`);
  }
}

console.log(
  `PASS G2: ${bldgManifest.totalBuildings.toLocaleString()} buildings across ${bldgManifest.cells.length} cells, ` +
    `${landmarks.landmarks.length} hero landmarks (including ${uniIds.length} SF 3D Universities), ` +
    `DEM ${terrainMeta.core.gridSize}x${terrainMeta.core.gridSize}, Ortho ${(orthoStat.size / 1024).toFixed(0)} KB.`
);
