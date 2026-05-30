/**
 * Curated retail data for all collectible cans in Stellar Blade.
 *
 * Total: 49 cans (Can_001 through Can_049).
 *
 * Source: Full-text scan + structural analysis of parsed .sav JSON
 * Confirmed across multiple saves; the complete retail set is always these 49 IDs.
 *
 * Ownership at runtime is determined by:
 *   - Presence in ItemOtaineSet, OR
 *   - Corresponding "Acquire_Item_Can_XXX" achievement having bCompleted === true.
 *
 * This module is the single source of truth for "what exists in the game".
 */

export type CanId = `Can_${string}`;

export interface CanMetadata {
  id: CanId;
  number: number;
  // Future (populated by manual curation, not the save file):
  // displayName?: string;
  // region?: import('../constants').Region;
  // internalZone?: string;
  // notes?: string;
}

export const CAN_TOTAL = 49;
// Build the complete set programmatically so the range (1 to CAN_TOTAL).
const CAN_NUMBERS = Array.from({ length: CAN_TOTAL }, (_, i) => i + 1);

export const CANS: Record<CanId, CanMetadata> = Object.fromEntries(
  CAN_NUMBERS.map((n) => {
    const id = `Can_${String(n).padStart(3, '0')}` as CanId;
    return [id, { id, number: n }];
  })
) as Record<CanId, CanMetadata>;

// Convenience exports
export const CAN_IDS = Object.keys(CANS) as CanId[];

/** Type guard / lookup helper */
export function getCan(id: string): CanMetadata | undefined {
  return CANS[id as CanId];
}

/** Returns true if the given string is a valid retail can ID */
export function isCanId(id: string): id is CanId {
  return id in CANS;
}

