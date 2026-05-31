import type { ChampionStats } from '../types';

// ---------------------------------------------------------------------------
// Tier list — the staple of every TFT meta site. We grade each unit S→D from
// its Double Up *team* average placement (1 best … 4 worst, so LOWER is better).
// Cutoffs are tuned to the current Diamond+ sample so the buckets spread like a
// real tier list instead of dumping everyone into one grade. Re-tune these if a
// future crawl shifts the distribution materially.
//
// Colour ramp is a performance heat-map (emerald = strongest → rose = weakest),
// which reads as good→bad at a glance and stays distinct from the cost palette.
// ---------------------------------------------------------------------------

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export const TIER_ORDER: readonly Tier[] = ['S', 'A', 'B', 'C', 'D'];

export interface TierStyle {
  text: string;
  bg: string;
  ring: string;
  border: string;
  rail: string; // left-rail accent for the tier-list rows
}

const STYLE: Record<Tier, TierStyle> = {
  S: { text: 'text-emerald-300', bg: 'bg-emerald-400/10', ring: 'ring-emerald-400/50', border: 'border-emerald-400/40', rail: 'bg-emerald-400/80' },
  A: { text: 'text-lime-300', bg: 'bg-lime-400/10', ring: 'ring-lime-400/50', border: 'border-lime-400/40', rail: 'bg-lime-400/80' },
  B: { text: 'text-amber-300', bg: 'bg-amber-400/10', ring: 'ring-amber-400/50', border: 'border-amber-400/40', rail: 'bg-amber-400/80' },
  C: { text: 'text-orange-300', bg: 'bg-orange-400/10', ring: 'ring-orange-400/50', border: 'border-orange-400/40', rail: 'bg-orange-400/80' },
  D: { text: 'text-rose-300', bg: 'bg-rose-400/10', ring: 'ring-rose-400/50', border: 'border-rose-400/40', rail: 'bg-rose-400/80' },
};

export function tierStyle(tier: Tier): TierStyle {
  return STYLE[tier];
}

/** Grade a team-scale average placement (1 best … 4 worst). */
export function tierForAvgPlace(avgPlace: number): Tier {
  if (avgPlace <= 2.34) return 'S';
  if (avgPlace <= 2.43) return 'A';
  if (avgPlace <= 2.5) return 'B';
  if (avgPlace <= 2.62) return 'C';
  return 'D';
}

/** Grade a champion's stats, or null when it has no Double Up data yet. */
export function tierForStats(stats: ChampionStats | null | undefined): Tier | null {
  return stats ? tierForAvgPlace(stats.avgPlace) : null;
}

export const TIER_BLURB: Record<Tier, string> = {
  S: 'Top of the meta — among the strongest Double Up units this patch.',
  A: 'Strong — a reliable, above-average pick.',
  B: 'Solid — the middle of the meta; great in the right board.',
  C: 'Niche — needs the right comp or items to carry.',
  D: 'Struggling — currently underperforms on the Double Up ladder.',
};
