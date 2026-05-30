/**
 * Realistic mock data for Stellar Tracker prototype layouts.
 * Derived from analysis of real SBS00.sav structure + public Stellar Blade collectible patterns.
 * All values are illustrative for layout/UX review only.
 */

export interface CollectibleItem {
  id: string;
  name: string;
  category: Category;
  obtained: boolean;
  count?: number;
  total?: number;
  location?: string;
  notes?: string;
  variantOf?: string;
}

export type Category =
  | 'cans'
  | 'nanosuits'
  | 'exospines'
  | 'fish'
  | 'memory'
  | 'hair'
  | 'accessories'
  | 'abilities'
  | 'bosses'
  | 'quests'
  | 'other';

export interface FishEntry {
  id: string;
  alias: string;
  displayName: string;
  catchCount: number;
  maxWeight: number;
  obtained: boolean;
  zone?: string;
}

export interface AbilityEntry {
  id: string;
  alias: string;
  displayName: string;
  obtained: boolean;
  tier?: number;
  slot?: string | null;
}

export interface BossEntry {
  id: string;
  name: string;
  zone: string;
  defeated: boolean;
  difficulty?: 'Normal' | 'Hard' | 'Boss Rush';
}

export interface ZoneProgress {
  zone: string;
  recovered: number;
  total: number;
}

// === Master category definitions (sensible organization) ===
export const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'cans', label: 'Cans', icon: '🥫' },
  { key: 'nanosuits', label: 'Nanosuits & Outfits', icon: '🪖' },
  { key: 'exospines', label: 'Exospines & Gear', icon: '⚙️' },
  { key: 'fish', label: 'Fish Journal', icon: '🐟' },
  { key: 'memory', label: 'Memory Sticks & Records', icon: '📜' },
  { key: 'hair', label: 'Hairstyles', icon: '💇' },
  { key: 'accessories', label: 'Glasses & Accessories', icon: '👓' },
  { key: 'abilities', label: 'Ability Tree', icon: '🧬' },
  { key: 'bosses', label: 'Boss & Threat Log', icon: '☠️' },
  { key: 'quests', label: 'Quests & Progress', icon: '📍' },
  { key: 'other', label: 'Other Data', icon: '📦' },
];

// === Sample realistic data ===

// Canonical regions used for the three-level cans navigation (All → Region → Region Overview)
export const CAN_REGIONS = [
  'Xion',
  'Wasteland A',
  'Wasteland B',
  'Drowned Eidos District',
  'Matrix 11',
  'Great Desert',
  'Abyss Lab',
] as const;

export type CanRegion = typeof CAN_REGIONS[number];

export const MOCK_CANS: CollectibleItem[] = Array.from({ length: 52 }, (_, i) => {
  const num = String(i + 1).padStart(3, '0');
  const obtained = i < 41;
  const region = CAN_REGIONS[i % CAN_REGIONS.length];
  return {
    id: `Can_${num}`,
    name: `Can ${num}`,
    category: 'cans',
    obtained,
    count: obtained ? 1 : 0,
    total: 1,
    location: region,
    notes: i % 7 === 0 ? 'Near supply camp' : undefined,
  };
});

export const MOCK_NANOSUITS: CollectibleItem[] = [
  { id: 'BS_Green_Suit', name: 'Green Nanosuit', category: 'nanosuits', obtained: true, location: 'Starting' },
  { id: 'BS_Attacker', name: 'Attacker Nanosuit', category: 'nanosuits', obtained: true, location: 'Story' },
  { id: 'BS_09_2', name: 'BS-09-2 (Prototype)', category: 'nanosuits', obtained: true, variantOf: 'BS_09' },
  { id: 'BS_09_2_Var2', name: 'BS-09-2 Variant 2', category: 'nanosuits', obtained: false, variantOf: 'BS_09' },
  { id: 'BS_102', name: 'BS-102 (Raven)', category: 'nanosuits', obtained: true },
  { id: 'LilyCostume_001', name: 'Lily Classic', category: 'nanosuits', obtained: true },
  { id: 'LilyCostume_003_Var2', name: 'Lily Variant 2', category: 'nanosuits', obtained: true },
  { id: 'AdamCostume_001', name: 'Adam Classic', category: 'nanosuits', obtained: false },
  { id: 'BS_Nier_03', name: 'Nier Automata Collab', category: 'nanosuits', obtained: true, location: 'DLC' },
  { id: 'BS_OneMillion_01', name: '1 Million Special', category: 'nanosuits', obtained: false, location: 'Event' },
  { id: 'BS_Christmas_01', name: 'Holiday 01', category: 'nanosuits', obtained: true, location: 'Event' },
  { id: 'BS_EVE_04', name: 'EVE-04 Tactical', category: 'nanosuits', obtained: false },
  // ... more variants would be added in real data
];

export const MOCK_EXOSPINES: CollectibleItem[] = [
  { id: 'PT_Combo', name: 'Combo Exospine', category: 'exospines', obtained: true, count: 3, total: 3 },
  { id: 'PT_Combo_MK2', name: 'Combo Exospine MK2', category: 'exospines', obtained: true },
  { id: 'PT_Stab', name: 'Stab Exospine', category: 'exospines', obtained: true },
  { id: 'PT_Survive', name: 'Survive Exospine', category: 'exospines', obtained: false },
  { id: 'PT_Crowd', name: 'Crowd Control', category: 'exospines', obtained: true },
  { id: 'PT_Shoot', name: 'Shooting Exospine', category: 'exospines', obtained: true },
  { id: 'PT_Skill', name: 'Skill Exospine', category: 'exospines', obtained: true },
];

export const MOCK_FISH: FishEntry[] = [
  { id: 'f1', alias: 'Fish_Goby', displayName: 'Goby', catchCount: 4, maxWeight: 0.2, obtained: true, zone: 'Xion' },
  { id: 'f2', alias: 'Fish_Goldfish', displayName: 'Goldfish', catchCount: 1, maxWeight: 0.1, obtained: true, zone: 'Xion' },
  { id: 'f3', alias: 'Fish_PorcupineFish', displayName: 'Porcupine Fish', catchCount: 1, maxWeight: 0.5, obtained: true },
  { id: 'f4', alias: 'Fish_Box3', displayName: 'Boxfish', catchCount: 2, maxWeight: 0.5, obtained: true },
  { id: 'f5', alias: 'Fish_Tuna', displayName: 'Tuna', catchCount: 0, maxWeight: 0, obtained: false, zone: 'Great Desert' },
  { id: 'f6', alias: 'Fish_Marlin', displayName: 'Marlin', catchCount: 0, maxWeight: 0, obtained: false },
  { id: 'f7', alias: 'Fish_Clownfish', displayName: 'Clownfish', catchCount: 3, maxWeight: 0.15, obtained: true },
];

export const MOCK_MEMORY: CollectibleItem[] = [
  { id: 'Item_Records_Xion_Memory_01', name: 'Xion Memory 01', category: 'memory', obtained: true, location: 'Xion' },
  { id: 'Item_Records_Xion_Memory_04', name: 'Xion Memory 04', category: 'memory', obtained: true, location: 'Xion' },
  { id: 'Item_Records_Day1_Memory_03', name: 'Day 1 Memory 03', category: 'memory', obtained: false, location: 'Wasteland' },
  { id: 'Item_Records_ETC_Memory_08', name: 'ETC Memory 08', category: 'memory', obtained: true },
  { id: 'Item_Records_DED10_Memory_01', name: 'DED-10 Memory 01', category: 'memory', obtained: false, location: 'Drowned Eidos' },
];

export const MOCK_HAIR: CollectibleItem[] = [
  { id: 'Hair_000', name: 'Default Bob', category: 'hair', obtained: true },
  { id: 'Hair_Nier_001', name: 'Nier 2B Style', category: 'hair', obtained: true, location: 'DLC' },
  { id: 'Hair_005', name: 'Long Ponytail', category: 'hair', obtained: false },
  { id: 'Hair_012', name: 'Wavy Bob', category: 'hair', obtained: true },
];

export const MOCK_ACCESSORIES: CollectibleItem[] = [
  { id: 'FaceAccessory_012', name: 'Glasses Type 012', category: 'accessories', obtained: true },
  { id: 'FaceAccessory_026', name: 'Visor 026', category: 'accessories', obtained: false },
  { id: 'Earring_Christmas_01', name: 'Holiday Earrings', category: 'accessories', obtained: true, location: 'Event' },
];

export const MOCK_ABILITIES: AbilityEntry[] = Array.from({ length: 42 }, (_, i) => ({
  id: `P_EVE_PT_Skill_${String(i + 1).padStart(2, '0')}`,
  alias: `P_EVE_PT_Skill_${String(i + 1).padStart(2, '0')}`,
  displayName: `Skill ${i + 1}`,
  obtained: i < 31,
  tier: Math.floor(i / 10) + 1,
  slot: i < 8 ? `Slot ${((i % 4) + 1)}` : null,
}));

export const MOCK_BOSSES: BossEntry[] = [
  { id: 'b1', name: 'Raven', zone: 'RavenBossTest', defeated: true, difficulty: 'Boss Rush' },
  { id: 'b2', name: 'Gorilla (DED)', zone: 'Zone_DED_Boss_Gorilla', defeated: true },
  { id: 'b3', name: 'Grub Shooter', zone: 'Zone_DED_Boss_GrubShooter', defeated: false },
  { id: 'b4', name: 'Sawshark', zone: 'Zone_ME_Boss_Sawshark', defeated: true },
  { id: 'b5', name: 'Skull Juggernaut', zone: 'Zone_ME_Boss_SkullJuggernaut', defeated: false },
  { id: 'b6', name: 'Double Boss (DED-A)', zone: 'Zone_DEDA_Boss_DoubleBoss', defeated: true },
];

export const MOCK_ZONES: ZoneProgress[] = [
  { zone: 'Xion', recovered: 87, total: 100 },
  { zone: 'Wasteland A', recovered: 62, total: 100 },
  { zone: 'Drowned Eidos', recovered: 41, total: 100 },
  { zone: 'Matrix 11', recovered: 29, total: 80 },
  { zone: 'Great Desert', recovered: 55, total: 90 },
];

// Convenience bundles for proposals
export const ALL_MOCK_ITEMS: CollectibleItem[] = [
  ...MOCK_CANS,
  ...MOCK_NANOSUITS,
  ...MOCK_EXOSPINES,
  ...MOCK_MEMORY,
  ...MOCK_HAIR,
  ...MOCK_ACCESSORIES,
];

export const GLOBAL_RECOVERY = 74; // overall %
