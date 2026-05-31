import type { Contested } from '../src/types';
import { classifyBoard, type Board, type Signature } from './classify';
import type { CompStats } from './lib/write-stats';

// Play-rate -> contested bucket. Thresholds are a starting heuristic; tune them
// once you see real play-rate spreads for your region/elo.
function contestedFor(playRate: number): Contested {
  if (playRate >= 0.12) return 'severe';
  if (playRate >= 0.07) return 'high';
  if (playRate >= 0.03) return 'moderate';
  return 'low';
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AggregateResult {
  stats: Record<string, CompStats>;
  total: number; // boards considered
  classified: number; // boards matched to a comp
  skipped: { id: string; n: number }[]; // comps below minSample (kept seed numbers)
  placementMin: number;
  placementMax: number;
}

// Double Up reports DISTINCT player placements 1..8 (confirmed against live data),
// with partners in adjacent slots: team 1 = places 1&2, team 2 = 3&4, and so on.
// So team rank = ceil(placement/2) yields the 1..4 team scale the hand-authored seed
// numbers in comps.ts use, keeping refreshed and kept-seed comps on one scale.
//   • avgPlace : mean team rank (1..4)
//   • first    : won the game = on the 1st-place team = placement <= 2
//                (counts BOTH winning partners; placement === 1 would miss one)
//   • top4     : top half = top 2 of 4 teams = placement <= 4
// placementMin/Max below report the RAW 1..8 so a future Riot scale change surfaces
// as an unexpected range in the run summary.
export function aggregate(boards: Board[], signatures: Signature[], minSample: number): AggregateResult {
  const tally: Record<string, { n: number; place: number; top4: number; first: number }> = {};
  let classified = 0;
  let placementMin = Infinity;
  let placementMax = -Infinity;

  for (const board of boards) {
    if (board.placement < placementMin) placementMin = board.placement;
    if (board.placement > placementMax) placementMax = board.placement;

    const id = classifyBoard(board, signatures);
    if (!id) continue;
    classified++;

    const t = (tally[id] ??= { n: 0, place: 0, top4: 0, first: 0 });
    t.n++;
    t.place += Math.ceil(board.placement / 2); // player 1..8 -> team 1..4
    if (board.placement <= 4) t.top4++; // top half (top 2 teams)
    if (board.placement <= 2) t.first++; // won (either partner on the 1st team)
  }

  const stats: Record<string, CompStats> = {};
  const skipped: { id: string; n: number }[] = [];

  for (const [id, t] of Object.entries(tally)) {
    if (t.n < minSample) {
      skipped.push({ id, n: t.n });
      continue;
    }
    stats[id] = {
      avgPlace: round2(t.place / t.n),
      top4: round1((t.top4 / t.n) * 100),
      first: round1((t.first / t.n) * 100),
      contested: contestedFor(t.n / classified),
      sampleSize: t.n,
    };
  }

  return {
    stats,
    total: boards.length,
    classified,
    skipped,
    placementMin: Number.isFinite(placementMin) ? placementMin : 0,
    placementMax: Number.isFinite(placementMax) ? placementMax : 0,
  };
}
