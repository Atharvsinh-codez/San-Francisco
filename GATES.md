# Acceptance Gates (`GATES.md` — Unlazy Verification Ledger)

| ID | Description | Verify Command | Status | Last Output / Summary |
|---|---|---|---|---|
| `G1` | **Zero API Keys / 100% Open Data**: No proprietary tokens or keys anywhere in `src/` or `tools/` | `node scripts/verify-no-keys.mjs` | `PASS` | `PASS G1: Scanned 22 source files — 0 API keys or proprietary tokens.` |
| `G2` | **Baked SF Data + Universities**: 176,777 SF buildings across 36 cells, 23 landmarks (including USF, UCSF Parnassus, UCSF Mission Bay, SFSU, UC Law SF), 513×513 DEM, 2048² ortho | `node scripts/verify-baked-data.mjs` | `PASS` | `PASS G2: 176,777 buildings across 36 cells, 23 hero landmarks (including 5 SF 3D Universities), DEM 513x513, Ortho 1593 KB.` |
| `G3` | **TypeScript + Vite Production Bundle**: `npm run build` (`tsc --noEmit && vite build`) compiles cleanly with 0 errors | `npm run build` | `PASS` | `✓ 17 modules transformed. dist/assets/index-BPDe6_MO.js 627.40 kB` |
| `G4` | **Visual & Runtime Verification (`jeantimex/tokyo` Sky, Shaders, Controls, Birds + `wheresryan22/anatomy` 3D Universities & Landmarks)**: Real browser screenshots verified across Downtown SF, USF Campus, UCSF Parnassus Campus, Vector Mode, and Night Mode | `node scripts/verify-visual-screenshots.mjs` | `PASS` | `PASS G4: All 5 browser screenshots verified with bright sky, high-contrast 3D buildings (3,144,927 tris across 36 cells), universities, vector mode, and night mode.` |
