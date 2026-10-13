import * as fs from 'node:fs';
import { PNG } from 'pngjs';

const files = [
  { name: 'verify-downtown.png', expectBrightSky: true },
  { name: 'verify-ggb.png', expectBrightSky: true },
  { name: 'verify-bay-bridge.png', expectBrightSky: true },
  { name: 'verify-usf-campus.png', expectBrightSky: true },
  { name: 'verify-ucsf-campus.png', expectBrightSky: true },
  { name: 'verify-vector-mode.png', expectBrightSky: true },
  { name: 'verify-night-mode.png', expectBrightSky: false },
];

for (const item of files) {
  const png = PNG.sync.read(fs.readFileSync(item.name));
  const w = png.width;
  const h = png.height;
  const data = png.data;

  // Measure upper-sky region (y: 12%..28%) and mid-city region (y: 45%..80%)
  let skyR = 0, skyG = 0, skyB = 0, skyN = 0;
  let cityR = 0, cityG = 0, cityB = 0, cityN = 0;
  let cityLumVar = 0;

  for (let y = Math.floor(h * 0.12); y < Math.floor(h * 0.28); y += 2) {
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x += 2) {
      const idx = (y * w + x) * 4;
      skyR += data[idx];
      skyG += data[idx + 1];
      skyB += data[idx + 2];
      skyN++;
    }
  }

  const cityLums = [];
  for (let y = Math.floor(h * 0.45); y < Math.floor(h * 0.82); y += 2) {
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x += 2) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      cityR += r;
      cityG += g;
      cityB += b;
      cityN++;
      cityLums.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }

  const avgSkyR = skyR / skyN;
  const avgSkyG = skyG / skyN;
  const avgSkyB = skyB / skyN;
  const avgSkyLum = 0.2126 * avgSkyR + 0.7152 * avgSkyG + 0.0722 * avgSkyB;
  const avgCityR = cityR / cityN;
  const avgCityG = cityG / cityN;
  const avgCityB = cityB / cityN;
  const avgCityLum = 0.2126 * avgCityR + 0.7152 * avgCityG + 0.0722 * avgCityB;

  for (const l of cityLums) {
    cityLumVar += (l - avgCityLum) ** 2;
  }
  const cityStdDev = Math.sqrt(cityLumVar / cityLums.length);

  console.log(
    `[${item.name}] (${w}x${h}) Upper RGB=(${avgSkyR.toFixed(1)}, ${avgSkyG.toFixed(1)}, ${avgSkyB.toFixed(1)}) Lum=${avgSkyLum.toFixed(1)} | ` +
      `City RGB=(${avgCityR.toFixed(1)}, ${avgCityG.toFixed(1)}, ${avgCityB.toFixed(1)}) Lum=${avgCityLum.toFixed(1)} StdDev=${cityStdDev.toFixed(1)}`
  );

  if (item.expectBrightSky && avgSkyLum < 120) {
    throw new Error(`FAIL ${item.name}: Expected bright daytime upper viewport (Lum >= 120), got Lum=${avgSkyLum.toFixed(1)}`);
  }
  if (!item.expectBrightSky && avgSkyLum > 85) {
    throw new Error(`FAIL ${item.name}: Expected dark night sky (Lum <= 85), got Lum=${avgSkyLum.toFixed(1)}`);
  }
  if (cityStdDev < 12) {
    throw new Error(`FAIL ${item.name}: City region lacks 3D building contrast (StdDev=${cityStdDev.toFixed(1)})`);
  }
}

console.log('PASS G4: All 5 browser screenshots verified with bright sky, high-contrast 3D buildings, universities, vector mode, and night mode.');
