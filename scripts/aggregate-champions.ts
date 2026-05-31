import type { ChampionStats, ChampionItemStat, ChampionCompStat } from '../src/types';
import { classifyBoard, type Board, type Signature } from './classify';
import { assetUrl, type CdragonItem } from './lib/cdragon';

// ---------------------------------------------------------------------------
// Per-champion Double Up aggregation. Walks the same crawled boards the comp
// aggregator uses, but tallies by individual unit instead of by classified comp:
//   • placement folds 1..8 player ranks to the 1..4 team scale (ceil/2), exactly
//     like aggregate.ts, so champion and comp numbers share one scale.
//   • pickRate = boards containing the unit / total boards (a unit appears at
//     most once per board, so its tally count IS its board count).
//   • bestItems = the unit's most-held completed combat items (resolved to
//     display name + icon via CommunityDragon; components/emblems filtered out).
//   • bestComps = the comps the unit most often shows up in, by the comp
//     classifier — i.e. "where does this champion actually get played".
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Tally {
  n: number;
  place: number;
  top4: number;
  first: number;
  items: Map<string, number>; // item apiName -> boards held
  comps: Map<string, number>; // comp id -> boards appeared in
}

export interface ChampionAggregateResult {
  stats: Record<string, ChampionStats>;
  totalBoards: number;
  championsSeen: number;
  written: number;
  skipped: { id: string; n: number }[]; // seen but below minSample
}

export interface ChampionAggregateOptions {
  minSample: number;
  topItems: number;
  topComps: number;
}

export function aggregateChampions(
  boards: Board[],
  signatures: Signature[],
  items: Map<string, CdragonItem>,
  compNames: Map<string, string>,
  opts: ChampionAggregateOptions,
): ChampionAggregateResult {
  const tally = new Map<string, Tally>();
  const get = (key: string): Tally => {
    let t = tally.get(key);
    if (!t) {
      t = { n: 0, place: 0, top4: 0, first: 0, items: new Map(), comps: new Map() };
      tally.set(key, t);
    }
    return t;
  };

  for (const board of boards) {
    const teamRank = Math.ceil(board.placement / 2); // 1..8 player -> 1..4 team
    const compId = classifyBoard(board, signatures);

    for (const unit of board.units) {
      if (!unit.name) continue;
      const t = get(unit.name);
      t.n++;
      t.place += teamRank;
      if (board.placement <= 4) t.top4++; // top half (top 2 of 4 teams)
      if (board.placement <= 2) t.first++; // won = on the 1st-place team
      if (compId) t.comps.set(compId, (t.comps.get(compId) ?? 0) + 1);
      // A unit can stack duplicate copies of one item (2–3× Guinsoo's on a
      // hyper-carry), so count each distinct completed item AT MOST ONCE per
      // board. pct is the share of the unit's boards that held the item, which
      // must never exceed 100% — counting instances is what inflated it past it.
      const seenItems = new Set<string>();
      for (const item of unit.items) {
        if (seenItems.has(item) || !items.get(item)?.completed) continue;
        seenItems.add(item);
        t.items.set(item, (t.items.get(item) ?? 0) + 1);
      }
    }
  }

  const totalBoards = boards.length;
  const stats: Record<string, ChampionStats> = {};
  const skipped: { id: string; n: number }[] = [];

  for (const [id, t] of tally) {
    if (t.n < opts.minSample) {
      skipped.push({ id, n: t.n });
      continue;
    }
    stats[id] = {
      avgPlace: round2(t.place / t.n),
      top4: round1((t.top4 / t.n) * 100),
      first: round1((t.first / t.n) * 100),
      pickRate: round1((t.n / totalBoards) * 100),
      sampleSize: t.n,
      bestItems: topItems(t.items, t.n, items, opts.topItems),
      bestComps: topComps(t.comps, compNames, opts.topComps),
    };
  }

  return { stats, totalBoards, championsSeen: tally.size, written: Object.keys(stats).length, skipped };
}

function topItems(
  counts: Map<string, number>,
  champBoards: number,
  items: Map<string, CdragonItem>,
  k: number,
): ChampionItemStat[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([apiName, c]): ChampionItemStat => {
      const meta = items.get(apiName);
      return { name: meta?.name ?? apiName, icon: meta ? assetUrl(meta.icon) : '', pct: round1((c / champBoards) * 100) };
    });
}

function topComps(counts: Map<string, number>, names: Map<string, string>, k: number): ChampionCompStat[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, n]): ChampionCompStat => ({ id, name: names.get(id) ?? id, n }));
}
