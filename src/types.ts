// ---- Core domain types ----
export type DamageType = 'AD' | 'AP' | 'hybrid';
export type Playstyle = 'aggressive' | 'scaling'; // aggressive = early tempo, scaling = econ/late
export type Tempo = 'reroll' | 'fast8' | 'tempo';
export type Contested = 'low' | 'moderate' | 'high' | 'severe';

export interface Carry {
  name: string;
  damageType: DamageType;
  items: string[];
}

export interface Comp {
  id: string;
  name: string;
  traits: string[];
  carries: Carry[];
  frontline: string[];
  units: string[]; // ALL units in the comp — used for overlap detection
  primaryDamage: DamageType; // dominant item component type for this comp
  playstyle: Playstyle;
  tempo: Tempo;
  levelStrategy: string; // human-readable, e.g. "Lvl 6 reroll", "Fast 8"
  contested: Contested;
  avgPlace: number;
  top4: number; // %
  first: number; // %
  augments: string[]; // archetype guidance, not exact names
}

// ---- User preferences ----
export type PlaystylePref = Playstyle | 'any';
export type TempoPref = 'reroll' | 'fast8' | 'any';
export type ItemLean = 'AD' | 'AP' | 'flexible';
export type ContestedTolerance = 'avoid' | 'balanced' | 'fight';

export interface Prefs {
  playstyle: PlaystylePref;
  tempo: TempoPref;
  itemLean: ItemLean;
  contested: ContestedTolerance;
}

export const DEFAULT_PREFS: Prefs = {
  playstyle: 'any',
  tempo: 'any',
  itemLean: 'flexible',
  contested: 'balanced',
};

// ---- Champion catalog (generated from CommunityDragon) ----
export interface Champion {
  id: string; // normalized key, joins to ChampionStats — e.g. "missfortune"
  apiName: string; // Riot apiName, e.g. "TFT17_MissFortune"
  name: string;
  cost: number; // 1..5
  traits: string[]; // display names
  portrait: string; // square HUD icon URL (grid tiles)
  splash: string; // splash-tile URL (detail hero)
}

// ---- Per-champion Double Up performance (machine overlay) ----
export interface ChampionItemStat {
  name: string;
  icon: string;
  pct: number; // % of this champion's itemized boards carrying the item
}
export interface ChampionCompStat {
  id: string; // comp id from comps.ts
  name: string;
  n: number; // boards of this champion that classified into the comp
}
export interface ChampionStats {
  avgPlace: number; // team scale 1..4
  top4: number; // % top half (top 2 of 4 teams)
  first: number; // % won (on the 1st-place team)
  pickRate: number; // % of Double Up boards that field this unit
  sampleSize: number; // boards observed with this unit
  bestItems: ChampionItemStat[];
  bestComps: ChampionCompStat[];
}

// Catalog entry merged with its optional stats (null = no data yet).
export interface ChampionView extends Champion {
  stats: ChampionStats | null;
}
