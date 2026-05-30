/**
 * Domain types for the Stellar Tracker feature.
 * These are separate from the raw save parser types.
 */

import type { Region } from './constants';

export type { Region }; // re-export for convenience

export type TopCategory =
  | 'overview'
  | 'collectibles'
  | 'progression'
  | 'appearance'
  | 'combat'
  | 'decoder';   // Special top-level entry for the dev decoder tool

export type SubCategory =
  | 'home'           // under overview
  | 'cans'
  | 'memory'
  | 'fish'
  | 'bosses'
  | 'outfits'
  | 'exospines'
  | 'hair'
  | 'accessories'
  | 'abilities'      // under progression (Skills tab)
  | 'developer';     // special power-user tab

export interface TrackerState {
  activeTopCategory: TopCategory;
  activeSubCategory: SubCategory;
  selectedRegions: Region[];
  showMissingOnly: boolean;
  searchTerm: string;
}

// Placeholder for when we connect real save data
export interface TrackerData {
  // Will be populated from saveAdapter later
  cans: any[];
  // ... other categories
}
