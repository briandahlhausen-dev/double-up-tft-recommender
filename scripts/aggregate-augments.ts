import type { AugmentStat } from '../src/types';
import { classifyBoard, type Board, type Signature } from './classify';
import { assetUrl, type CdragonAugment } from './lib/cdragon';

// ---------------------------------------------------------------------------
// Per-comp augment aggregation. Walks the same crawled boards the comp
// aggregator uses; for every board that classifies into a curated comp, it
// tallies which augments that board ran and how the board placed:
//   • placement folds 1..8 player ranks to the 1..4 team scale (ceil/2), exactly
//     like aggregate.ts, so augment numbers share the comp/champion scale.
//   • pickRate = comp boards that ran the augment / all that comp's boards.
//   • avgPlace / top4 = how the comp placed WHEN it ran that augment — i.e. the
//     placement-weighted signal, not a global augment average.
// Each comp keeps its top augments by pick rate (above a min-sample floor), so
// the guide shows "what this comp actually runs, and how it did".
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Tally {
  n: number; // comp boards that ran this augment
  place: number; // summed team rank (1..4)
  top4: number; // boards that landed top half
}

export interface AugmentAggregateResult {
  byComp: Record<string, AugmentStat[]>;
  compBoards: Record<string, number>; // classified boards per comp (the pickRate denominator)
  compsWithData: number; // comps that cleared the floor for >=1 augment
  augmentsSeen: number; // distinct augment apiNames observed on classified boards
}

export interface AugmentAggregateOptions {
  minSample: number; // min boards running an augment before it's trusted
  top: number; // augments kept per comp
}

export function aggregateAugments(
  boards: Board[],
  signatures: Signature[],
  meta: Map<string, CdragonAugment>,
  opts: AugmentAggregateOptions,
): AugmentAggregateResult {
  // compId -> (augment apiName -> tally)
  const byComp = new Map<string, Map<string, Tally>>();
  const compBoards: Record<string, number> = {};
  const seen = new Set<string>();

  for (const board of boards) {
    const compId = classifyBoard(board, signatures);
    if (!compId) continue;
    compBoards[compId] = (compBoards[compId] ?? 0) + 1;

    let comp = byComp.get(compId);
    if (!comp) {
      comp = new Map();
      byComp.set(compId, comp);
    }

    const teamRank = Math.ceil(board.placement / 2); // 1..8 player -> 1..4 team
    // A player holds up to 3 DISTINCT augments; dedupe per board defensively so a
    // repeated apiName can't push pickRate past 100%.
    const boardAugs = new Set(board.augments);
    for (const apiName of boardAugs) {
      seen.add(apiName);
      let t = comp.get(apiName);
      if (!t) {
        t = { n: 0, place: 0, top4: 0 };
        comp.set(apiName, t);
      }
      t.n++;
      t.place += teamRank;
      if (board.placement <= 4) t.top4++;
    }
  }

  const out: Record<string, AugmentStat[]> = {};
  let compsWithData = 0;

  for (const [compId, augs] of byComp) {
    const denom = compBoards[compId];
    const rows = [...augs.entries()]
      .filter(([, t]) => t.n >= opts.minSample)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, opts.top)
      .map(([apiName, t]): AugmentStat => {
        const m = meta.get(apiName);
        return {
          id: apiName,
          name: m?.name ?? prettifyApiName(apiName),
          icon: m ? assetUrl(m.icon) : '',
          tier: m?.tier ?? null,
          pickRate: round1((t.n / denom) * 100),
          avgPlace: round2(t.place / t.n),
          top4: round1((t.top4 / t.n) * 100),
          n: t.n,
        };
      });
    if (rows.length) {
      out[compId] = rows;
      compsWithData++;
    }
  }

  return { byComp: out, compBoards, compsWithData, augmentsSeen: seen.size };
}

// Last-resort label when an augment apiName isn't in the cdragon catalog (rare,
// e.g. a brand-new or cross-set augment): "TFT17_Augment_DarkStarHeart" -> "Dark Star Heart".
function prettifyApiName(apiName: string): string {
  const tail = apiName.replace(/^tft\d*[a-z]?_augment_/i, '');
  return tail.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim() || apiName;
}
