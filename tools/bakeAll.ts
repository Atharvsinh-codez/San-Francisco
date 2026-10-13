import { bakeTerrain } from './terrain.ts';
import { bakeImagery } from './imagery.ts';
import { bakeBuildings } from './buildings.ts';
import { bakeRoads } from './roads.ts';
import { bakeLanduseWater } from './landuse_water.ts';
import { bakeLabels } from './labels.ts';
import { bakeLandmarks } from './landmarks.ts';

async function main() {
  console.log('=== SF 3D Offline Public-Domain Data Bake Pipeline ===');
  await bakeTerrain();
  await bakeImagery();
  await bakeBuildings();
  await bakeRoads();
  await bakeLanduseWater();
  await bakeLabels();
  await bakeLandmarks();
  console.log('=== All SF 3D static assets baked into public/data/ ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
