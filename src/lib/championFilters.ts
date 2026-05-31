import type { ChampionView } from '../types';
import { tierForStats } from './tier';
import type { Tier } from './tier';

// Shared filter + sort logic for the Champions page, lifted out of the page so
// the grid, the stats table, and the tier list all rank identically.

export type CostFilter = 'all' | 1 | 2 | 3 | 4 | 5;
export type TierFilter = 'all' | Tier;
export type Sort = 'cost' | 'name' | 'avgPlace' | 'top4' | 'first' | 'pickRate';
export type View = 'grid' | 'table' | 'tiers';

export interface ChampionFilters {
  q: string;
  cost: CostFilter;
  trait: string;
  tier: TierFilter;
  sort: Sort;
}

export function filterAndSort(list: readonly ChampionView[], f: ChampionFilters): ChampionView[] {
  const needle = f.q.trim().toLowerCase();
  const out = list.filter((c) => {
    if (f.cost !== 'all' && c.cost !== f.cost) return false;
    if (f.trait !== 'all' && !c.traits.includes(f.trait)) return false;
    if (f.tier !== 'all' && tierForStats(c.stats) !== f.tier) return false;
    if (needle && !c.name.toLowerCase().includes(needle) && !c.traits.some((t) => t.toLowerCase().includes(needle)))
      return false;
    return true;
  });
  out.sort((a, b) => compareBy(a, b, f.sort));
  return out;
}

function compareBy(a: ChampionView, b: ChampionView, sort: Sort): number {
  switch (sort) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'avgPlace':
      return num(a.stats?.avgPlace, Infinity) - num(b.stats?.avgPlace, Infinity) || a.name.localeCompare(b.name);
    case 'top4':
      return num(b.stats?.top4, -1) - num(a.stats?.top4, -1) || a.name.localeCompare(b.name);
    case 'first':
      return num(b.stats?.first, -1) - num(a.stats?.first, -1) || a.name.localeCompare(b.name);
    case 'pickRate':
      return num(b.stats?.pickRate, -1) - num(a.stats?.pickRate, -1) || a.name.localeCompare(b.name);
    case 'cost':
    default:
      return a.cost - b.cost || a.name.localeCompare(b.name);
  }
}

const num = (v: number | undefined, fallback: number): number => v ?? fallback;
