# SF 3D — Offline Open-Data Bake Pipeline (`tools/`)

All geographic, elevation, building, road, vegetation, and orthoimagery data in **SF 3D** is baked offline from 100% free, public-domain / open-data sources into static files under `public/data/`. Zero API keys or paid map services are used at build time or runtime.

## Local ENU Coordinate System

All baked assets share a single right-handed East-North-Up (ENU) coordinate frame (`src/world/coords.ts`):
- **Origin `(0, 0, 0)`**: San Francisco City Hall (`37.7793° N, -122.4193° W`, NAVD88 sea level)
- **`+X`**: East (meters)
- **`+Y`**: Up (meters above sea level)
- **`-Z`**: North (`+Z` = South, meters)

## Data Sources

1. **Elevation & Bathymetry (`tools/terrain.ts`)**
   - USGS 3DEP / NOAA NCEI CUDEM / AWS Terrain Tiles (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`)
   - `z=14` core grid (`513×513` float32 `public/data/terrain/core_dem.bin`, range `-114.3 m` in the Golden Gate Strait to `+340.3 m` at Mount Davidson / Marin Headlands)
   - `z=11` far-field grid (`257×257` float32 `public/data/terrain/far_dem.bin` covering `80 km × 80 km`)

2. **Satellite Orthoimagery (`tools/imagery.ts`)**
   - USGS National Map / USDA NAIP / NOAA public-domain orthoimagery (`USGSImageryOnly` z14 tiles)
   - Atmospheric marine-haze removal, warm daylight white balance, and contrast normalization
   - Output: `public/data/imagery/sf_ortho_2048.jpg` + 16 quadtree tiles `public/data/imagery/tile_{x}_{z}.jpg`

3. **Building Footprints & Lidar Heights (`tools/buildings.ts`)**
   - **DataSF Building Footprints** (`ynuv-fyni`, `177,023` footprints with 2010 lidar median/max heights `hgt_mediancm` & `hgt_maxcm`) + OpenStreetMap buildings for Alcatraz Island, Marin Headlands, and post-2010 Financial District towers
   - Each building footprint is anchored to the baked DEM height at its centroid and assigned its true orthoimagery-sampled RGB rooftop color
   - Output: 36 spatial cell binaries `public/data/buildings/cell_{ix}_{iz}.bin` + `public/data/buildings/manifest.json` (`177,094` total buildings in `8.96 MB`)

4. **Road Network, Rail, Cable Cars & Street Lamps (`tools/roads.ts`)**
   - OpenStreetMap Overpass API (`highway=*`, `railway=*`) subdivided every `≤ 20 m` and draped onto the DEM so road ribbons follow steep SF hills without clipping
   - Output: `public/data/roads/roads.json` (`33,187` ways + 3 canonical Cable Car animation paths + `6,000` street lamps)

5. **Parks, Beaches, Piers, Lagoons & Street Trees (`tools/landuse_water.ts`)**
   - OpenStreetMap parks, beaches, piers (`man_made=pier`), and lagoons (`public/data/landuse/landuse.json`, `6,519` polygons)
   - **DataSF Street Tree Inventory** (`tkzw-k3nq`) + Golden Gate Park / Presidio canopy zones (`public/data/landuse/trees.bin`, `47,896` instanced trees across 5 species)

6. **Labels & Hero Landmarks (`tools/labels.ts`, `tools/landmarks.ts`)**
   - `public/data/labels.json`: 94 neighborhood labels + 1,200 road ribbon street labels with tangent angles
   - `public/data/landmarks.json`: 18 procedural Hero Landmarks aligned to DEM elevations

## Running the Bake Pipeline

 Raw downloads are cached in `.context/` (gitignored) so subsequent runs complete in seconds.

```bash
# Run the full offline bake pipeline:
npm run bake:all

# Or run individual stages:
npm run bake:terrain
npm run bake:imagery
npm run bake:buildings
npm run bake:roads
npm run bake:landuse
npm run bake:labels
npm run bake:landmarks
```
