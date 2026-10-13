import * as fs from 'node:fs';
import * as path from 'node:path';

const FORBIDDEN = [
  'MAPBOX_ACCESS_TOKEN',
  'GOOGLE_MAPS_API_KEY',
  'CESIUM_ION_TOKEN',
  'MAPTILER_KEY',
  'ARCGIS_API_KEY',
  'HERE_API_KEY',
];

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|js|html|css)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const files = [...walk('src'), ...walk('tools'), 'index.html'];
let violations = 0;
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const key of FORBIDDEN) {
    if (txt.includes(key)) {
      console.error(`Forbidden key token ${key} found in ${f}`);
      violations++;
    }
  }
}

if (violations > 0) process.exit(1);
console.log(`PASS G1: Scanned ${files.length} source files — 0 API keys or proprietary tokens.`);
