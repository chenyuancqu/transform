/**
 * G1 verified asset manifest. Keep source and license metadata next to the
 * loader so later campus stages can reuse the same normalization contract.
 */
export const CAMPUS_ASSETS = {
  mainBuilding: {
    url: '/models/buildings/modern-tower-office.glb',
    sourceUrl: 'https://sketchfab.com/3d-models/modern-tower-office-apartment-house-home-a057bf3379b24c23a18a82ec884e4f04',
    author: 'zigurat architecture studio',
    license: 'CC BY 4.0',
    expectedUnits: 'meters',
    normalizeHeightMeters: 26,
    productionHeightMeters: 42,
    measuredSourceBounds: [9.3571195602417, 9.32877192273736, 5.808939456939697],
    purpose: 'G1 single-building preview and G2-G5 campus production scene'
  }
};
