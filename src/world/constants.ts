// Indices shared by the mesher and the shaders (from jeantimex/tokyo/src/world/constants.js)

// Surface kinds within the building mesh (aBldg.z).
export const KIND = { WALL: 0, FLAT_ROOF: 1, SOLID: 2, PITCHED_ROOF: 3, LATTICE: 4 } as const;
// Facade categories (aBldg.y % 8).
export const CAT = { HOUSE: 0, APARTMENT: 1, MIXED: 2, COMMERCIAL: 3, PUBLIC: 4, GLASS: 5 } as const;
// Texture array layers (see textures.ts).
export const WALL = { TILE: 0, CONCRETE: 1, PLASTER: 2, BRICK: 3, SIDING: 4, ROOF: 5 } as const;
export const GROUND = { ASPHALT: 0, PAVERS: 1, GRASS: 2, CONCRETE: 3, WATER: 4 } as const;
