import { CHAMPIONS, CHAMPIONS_SET } from '../data/champions';
import { CHAMPION_STATS, CHAMPION_STATS_UPDATED_AT, CHAMPION_STATS_SOURCE } from '../data/champion-stats';
import type { ChampionView } from '../types';

// Merge the hand-free catalog with the machine-written stats overlay, exactly
// like comps.ts overlays stats.ts. A champion with no overlay entry gets
// stats: null, which the UI renders as "no data yet".
export const CHAMPIONS_VIEW: ChampionView[] = CHAMPIONS.map((c) => ({
  ...c,
  stats: CHAMPION_STATS[c.id] ?? null,
}));

export const CHAMPION_BY_ID: Record<string, ChampionView> = Object.fromEntries(
  CHAMPIONS_VIEW.map((c) => [c.id, c]),
);

export function getChampion(id: string): ChampionView | undefined {
  return CHAMPION_BY_ID[id];
}

// Distinct trait list (sorted) for the overview's trait filter.
export const ALL_TRAITS: string[] = [...new Set(CHAMPIONS_VIEW.flatMap((c) => c.traits))].sort((a, b) =>
  a.localeCompare(b),
);

export const HAS_CHAMPION_STATS = Object.keys(CHAMPION_STATS).length > 0;

export { CHAMPIONS_SET, CHAMPION_STATS_UPDATED_AT, CHAMPION_STATS_SOURCE };
