import type { ChampionView } from '../types';
import { CHAMPIONS_VIEW } from './champions';
import { traitBreakdown } from './customComp';
import type { BuilderState } from './customComp';
import { tierForAvgPlace } from './tier';
import type { Tier } from './tier';

// ---------------------------------------------------------------------------
// Trait-bridge discovery — a stats-driven companion to the comp fit ranking.
//
// "Build my board" ranks the curated comps you're closest to. But a human looks
// at a board of Ezreal (Sniper) + Poppy (Meeple) and instantly thinks "Gnar
// bridges both traits" — a leap the comp matcher can't make, because it only
// knows unit-name overlap against a fixed list of comps. This engine makes that
// leap: for every active trait on your board, it surfaces the champions that
// SHARE that trait AND grade well on real Double Up stats, ranked by performance
// and how much of your board they tie together.
//
// STRICTLY DATA-DRIVEN: a champion with no crawled stats is skipped entirely —
// no guesses, no seeded numbers. Every suggestion is backed by a real placement.
// The flip side: a unit the snapshot never logged (e.g. Gnar this patch) won't
// appear until a data refresh captures him. That's by design, not a bug.
// ---------------------------------------------------------------------------

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export const BRIDGE_WEIGHTS = {
  performance: 60, // how the unit actually places (real stats) — the "decent win rate" gate
  connection: 40, // how strongly it ties into traits you already run
} as const;

/** Below this team-scale avg place (1 best … 4 worst) a unit isn't a "decent" pickup. */
const MAX_AVG_PLACE = 2.6;
/** Ignore ultra-thin samples so a fluke placement can't top the list. */
const MIN_SAMPLE = 30;
/** How many suggestions to surface before the "show more" fold. */
export const BRIDGE_PREVIEW = 6;

export interface TraitBridge {
  champion: ChampionView; // the suggested unit (stats guaranteed non-null)
  sharedTraits: string[]; // active board traits this unit also has, board-count desc
  connection: number; // Σ board counts of the shared traits (breakpoint-aware)
  perf: number; // 0–1 strength from real stats
  score: number; // 0–100 ranking blend, for ordering only (NOT a win-rate)
  tier: Tier; // graded from the unit's avg place
}

/** Map a champion's team-scale avg place (+ top-4 rate) to a 0–1 strength. */
function perfFromStats(avgPlace: number, top4: number): number {
  const place = clamp01((2.7 - avgPlace) / 0.5); // 2.2 → 1, 2.7 → 0
  const top = clamp01((top4 - 45) / 20); // 45% → 0, 65% → 1
  return clamp01(0.7 * place + 0.3 * top);
}

/**
 * Rank champions you don't already own that share a trait with your board and
 * grade out well on real stats. Best-first; empty when the board has no traits
 * or nothing data-backed bridges it.
 */
export function recommendBridges(state: BuilderState): TraitBridge[] {
  const counts = new Map(traitBreakdown(state).map((t) => [t.trait, t.count] as const));
  if (counts.size === 0) return [];

  const owned = new Set(state.unitIds);
  // Normalise connection against the strongest single trait you run so one giant
  // trait (e.g. 5 Bastions) can't swamp the blend — a double-bridge still wins.
  const maxCount = Math.max(...counts.values());

  const bridges: TraitBridge[] = [];
  for (const champ of CHAMPIONS_VIEW) {
    if (owned.has(champ.id)) continue; // already on your board
    const stats = champ.stats;
    if (!stats || stats.sampleSize < MIN_SAMPLE || stats.avgPlace > MAX_AVG_PLACE) continue; // data-gated

    const sharedTraits = champ.traits
      .filter((t) => counts.has(t))
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
    if (sharedTraits.length === 0) continue; // no trait bridge — not relevant to this board

    const connection = sharedTraits.reduce((sum, t) => sum + (counts.get(t) ?? 0), 0);
    const perf = perfFromStats(stats.avgPlace, stats.top4);
    // Reward both breadth (distinct traits bridged) and depth (their board counts).
    const connNorm = clamp01((connection + (sharedTraits.length - 1)) / (maxCount + 2));
    const score = BRIDGE_WEIGHTS.performance * perf + BRIDGE_WEIGHTS.connection * connNorm;

    bridges.push({
      champion: champ,
      sharedTraits,
      connection,
      perf,
      score,
      tier: tierForAvgPlace(stats.avgPlace),
    });
  }

  return bridges.sort(
    (a, b) => b.score - a.score || a.champion.stats!.avgPlace - b.champion.stats!.avgPlace,
  );
}
