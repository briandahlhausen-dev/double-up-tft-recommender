import { COMPS } from '../data/comps';
import { resolveUnit } from './combat-model';
import type { BoardScore } from './theorycraft';
import { bestItemSet } from './theorycraft';

// Shared filter + sort logic for the Theorycraft Lab, lifted out of the page so
// the filter bar and the board list stay in sync — mirrors lib/championFilters.

const normName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- novelty vs the curated meta (shared with the page's badge styling) -----

export interface Novelty {
  label: 'Novel' | 'Variant' | 'Known';
  similarTo?: string;
  overlap: number;
}

/** Tag a discovered board by its biggest unit-overlap with any curated comp. */
export function noveltyOf(units: string[]): Novelty {
  const set = new Set(units.map(normName));
  let best = 0;
  let bestName = '';
  for (const comp of COMPS) {
    let n = 0;
    for (const u of comp.units) if (set.has(normName(u))) n++;
    if (n > best) {
      best = n;
      bestName = comp.name;
    }
  }
  if (best >= 5) return { label: 'Known', similarTo: bestName, overlap: best };
  if (best >= 3) return { label: 'Variant', similarTo: bestName, overlap: best };
  return { label: 'Novel', overlap: best };
}

// ---- a board's damage type, from its suggested carry's best-in-slot build ----

export type DamageType = 'AD' | 'AP' | 'Hybrid';

const _dmgCache = new Map<string, DamageType>();

/** The damage profile a board fights on = the archetype its suggested carry
 *  itemizes into (the same best-in-slot pick the board card shows). */
export function boardDamageType(carryName: string): DamageType {
  const hit = _dmgCache.get(carryName);
  if (hit) return hit;
  let dt: DamageType = 'Hybrid';
  const u = resolveUnit(carryName);
  if (u) {
    const label = bestItemSet(u).label;
    if (label.startsWith('AD')) dt = 'AD';
    else if (label.startsWith('AP')) dt = 'AP';
    else dt = 'Hybrid'; // "Attack speed" hybrid set / fallback
  }
  _dmgCache.set(carryName, dt);
  return dt;
}

// ---- filters ----------------------------------------------------------------

export type LabSort = 'score' | 'carry' | 'front' | 'cost';
export type DamageFilter = 'all' | DamageType;
export type NoveltyFilter = 'all' | Novelty['label'];

export interface LabFilters {
  q: string;
  carry: string; // 'all' | suggested-carry name
  trait: string; // 'all' | active-trait name
  damage: DamageFilter;
  novelty: NoveltyFilter;
  sort: LabSort;
}

export const DEFAULT_LAB_FILTERS: LabFilters = {
  q: '',
  carry: 'all',
  trait: 'all',
  damage: 'all',
  novelty: 'all',
  sort: 'score',
};

export function filterBoards(boards: readonly BoardScore[], f: LabFilters): BoardScore[] {
  const needle = f.q.trim().toLowerCase();
  const out = boards.filter((b) => {
    if (f.carry !== 'all' && b.suggestedCarry !== f.carry) return false;
    if (f.trait !== 'all' && !b.activeTraits.some((t) => t.tierLevel > 0 && t.name === f.trait)) return false;
    if (f.damage !== 'all' && boardDamageType(b.suggestedCarry) !== f.damage) return false;
    if (f.novelty !== 'all' && noveltyOf(b.units).label !== f.novelty) return false;
    if (needle) {
      const inUnits = b.units.some((u) => u.toLowerCase().includes(needle));
      const inTraits = b.activeTraits.some((t) => t.name.toLowerCase().includes(needle));
      if (!inUnits && !inTraits) return false;
    }
    return true;
  });
  return sortBoards(out, f.sort);
}

function sortBoards(boards: BoardScore[], sort: LabSort): BoardScore[] {
  const arr = [...boards];
  switch (sort) {
    case 'carry':
      arr.sort((a, b) => b.suggestedCarryDps - a.suggestedCarryDps || b.score - a.score);
      break;
    case 'front':
      arr.sort((a, b) => b.frontPower - a.frontPower || b.score - a.score);
      break;
    case 'cost':
      arr.sort((a, b) => a.cost - b.cost || b.score - a.score);
      break;
    case 'score':
    default:
      arr.sort((a, b) => b.score - a.score);
      break;
  }
  return arr;
}

// ---- option lists derived from the baked boards -----------------------------

/** Distinct suggested carries across the boards, alphabetized. */
export function carryOptions(boards: readonly BoardScore[]): string[] {
  return [...new Set(boards.map((b) => b.suggestedCarry).filter(Boolean))].sort();
}

/** Distinct traits that are ACTIVE (tier ≥ 1) on at least one board. */
export function traitOptions(boards: readonly BoardScore[]): string[] {
  const s = new Set<string>();
  for (const b of boards) for (const t of b.activeTraits) if (t.tierLevel > 0) s.add(t.name);
  return [...s].sort();
}
