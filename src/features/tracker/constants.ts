/**
 * Curated list of retail / final game locations in Stellar Blade.
 * These are used for the region filter in the tracker.
 *
 * Note: 'Nest' is the final end-game location. It only contains camps
 * and has no collectables, so it can be included in filters but will
 * usually show zero results for most categories.
 */
export const REGIONS = [
  'Eidos 7',
  'Xion',
  'Wasteland',
  'Altess Levoire',
  'Matrix 11',
  'Great Desert',
  'Abyss Levoire',
  'Eidos 9',
  'Spire 4',
  'Nest',
] as const;

export type Region = (typeof REGIONS)[number];

/**
 * Optional metadata for regions (for future use with background images, etc.)
 */
export const REGION_META: Record<Region, { hasCollectables: boolean }> = {
  'Eidos 7': { hasCollectables: true },
  'Xion': { hasCollectables: true },
  'Wasteland': { hasCollectables: true },
  'Altess Levoire': { hasCollectables: true },
  'Matrix 11': { hasCollectables: true },
  'Great Desert': { hasCollectables: true },
  'Abyss Levoire': { hasCollectables: true },
  'Eidos 9': { hasCollectables: true },
  'Spire 4': { hasCollectables: true },
  'Nest': { hasCollectables: false },
};
