import { DISCOVERED_BOARDS } from '../src/data/theorycraft';
import { COMPS } from '../src/data/comps';
import { COMP_STATS } from '../src/data/stats';
import type { BoardScore } from '../src/lib/theorycraft';
import type { Comp } from '../src/types';

// ---------------------------------------------------------------------------
// CREDIBILITY AUDIT  —  does the Lab's math agree with the ladder?
//
// "Theorycraft proposes, ladder data validates." This cross-references the
// offline-discovered boards (src/data/theorycraft) against the crawled Double Up
// comp performance (src/data/stats overlaid on src/data/comps) to answer: do the
// model's high-synergy boards actually correspond to comps that win?
//
//   npx tsx scripts/audit-theorycraft.ts
//
// Honest limits, stated up front:
//  • The crawl only classifies boards into the ~10 curated archetypes, so a
//    genuinely NOVEL Lab board has no ladder row — it can't be validated, only
//    flagged as an untested lead. Absence of data ≠ evidence it's bad.
//  • 3 of 10 comps have no crawl row (seed numbers only); they're marked SEED.
//  • Sample sizes vary wildly (25–373); thin rows are weak evidence.
//  • The model is steady-state and ignores positioning, items, CC — relative
//    comparison only.
// ---------------------------------------------------------------------------

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const r2 = (n: number): number => Math.round(n * 100) / 100;
const pad = (s: string | number, n: number): string => String(s).padEnd(n);
const padL = (s: string | number, n: number): string => String(s).padStart(n);

interface CompInfo {
  comp: Comp;
  real: boolean;
  sample: number;
}

const compInfo: CompInfo[] = COMPS.map((c) => ({
  comp: c,
  real: Boolean(COMP_STATS[c.id]),
  sample: COMP_STATS[c.id]?.sampleSize ?? 0,
}));

/** Units shared between a Lab board and a curated comp. */
function overlap(board: string[], comp: string[]): number {
  const set = new Set(comp.map(norm));
  return board.filter((u) => set.has(norm(u))).length;
}

/** Best Lab breakpoint reached for any of a comp's defining traits. */
function bestTraitDepth(board: BoardScore, comp: Comp): { trait: string; count: number; tier: number } | null {
  const wanted = new Set(comp.traits);
  let best: { trait: string; count: number; tier: number } | null = null;
  for (const t of board.activeTraits) {
    if (!wanted.has(t.name) || t.tierLevel <= 0) continue;
    if (!best || t.tierLevel > best.tier) best = { trait: t.name, count: t.count, tier: t.tierLevel };
  }
  return best;
}

/** Deepest tier any Lab board reaches in a SPECIFIC trait (the comp's carry identity). */
function deepestTierForTrait(trait: string): number {
  let best = 0;
  for (const b of DISCOVERED_BOARDS) {
    for (const t of b.activeTraits) if (t.name === trait && t.tierLevel > best) best = t.tierLevel;
  }
  return best;
}

// ---- Lens 1: per-comp — did the math find each meta archetype? -------------

interface CompMatch {
  info: CompInfo;
  bestOverlap: number;
  bestOverlapRank: number; // 1-indexed Lab rank of the best-overlapping board
  traitHit: { trait: string; count: number; tier: number } | null;
  traitHitRank: number; // Lab rank of the highest-scoring board that hits the trait
}

const matches: CompMatch[] = compInfo.map((info) => {
  let bestOverlap = -1;
  let bestOverlapRank = -1;
  let traitHit: CompMatch['traitHit'] = null;
  let traitHitRank = -1;
  DISCOVERED_BOARDS.forEach((b, i) => {
    const ov = overlap(b.units, info.comp.units);
    if (ov > bestOverlap) {
      bestOverlap = ov;
      bestOverlapRank = i + 1;
    }
    const depth = bestTraitDepth(b, info.comp);
    if (depth && (!traitHit || depth.tier > traitHit.tier)) {
      traitHit = depth;
      traitHitRank = i + 1; // boards are score-sorted, so first hit = best score
    }
  });
  return { info, bestOverlap, bestOverlapRank, traitHit, traitHitRank };
});

// ---- Lens 2: per-Lab-board — does each discovery map to a real comp? -------

interface BoardMatch {
  board: BoardScore;
  rank: number;
  bestComp: Comp | null;
  bestOverlap: number;
  real: boolean;
  avgPlace: number | null;
  tag: 'Known' | 'Variant' | 'Novel';
}

const boardMatches: BoardMatch[] = DISCOVERED_BOARDS.map((board, i) => {
  let bestComp: Comp | null = null;
  let bestOverlap = 0;
  for (const { comp } of compInfo) {
    const ov = overlap(board.units, comp.units);
    if (ov > bestOverlap) {
      bestOverlap = ov;
      bestComp = comp;
    }
  }
  const real = bestComp ? Boolean(COMP_STATS[bestComp.id]) : false;
  const tag = bestOverlap >= 5 ? 'Known' : bestOverlap >= 3 ? 'Variant' : 'Novel';
  return {
    board,
    rank: i + 1,
    bestComp,
    bestOverlap,
    real,
    avgPlace: bestComp ? bestComp.avgPlace : null,
    tag,
  };
});

// ---- Lens 3: score ↔ performance correlation -------------------------------

// Pair each REAL-stat comp with its best-overlapping Lab board's math score,
// then measure rank agreement (Spearman) between math score and avgPlace.
// Higher score SHOULD predict LOWER (better) avgPlace → expect negative ρ.
function spearman(xs: number[], ys: number[]): number {
  const rank = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(arr.length).fill(0);
    idx.forEach(([, i], r) => (ranks[i] = r + 1));
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

const realMatches = matches.filter((m) => m.info.real && m.bestOverlapRank > 0);
const corrPairsAll = realMatches.map((m) => ({
  comp: m.info.comp,
  score: DISCOVERED_BOARDS[m.bestOverlapRank - 1].score,
  avgPlace: m.info.comp.avgPlace,
  overlap: m.bestOverlap,
}));
// Drop coincidental 1–2 unit (glue-unit) matches — they pair a comp to a board
// that has nothing to do with it, which fabricates correlation. Keep overlap ≥ 3.
const corrPairs = corrPairsAll.filter((p) => p.overlap >= 3);
const rhoAll = spearman(corrPairsAll.map((p) => p.score), corrPairsAll.map((p) => p.avgPlace));
const rho = corrPairs.length >= 3 ? spearman(corrPairs.map((p) => p.score), corrPairs.map((p) => p.avgPlace)) : NaN;

// ---- report ----------------------------------------------------------------

console.log('\n══════════ THEORYCRAFT LAB · CREDIBILITY AUDIT ══════════');
console.log(`Lab boards: ${DISCOVERED_BOARDS.length}  ·  curated comps: ${COMPS.length}  ` +
  `(${compInfo.filter((c) => c.real).length} with real crawl rows, ${compInfo.filter((c) => !c.real).length} seed-only)`);

console.log('\n── Lens 1: did the math rediscover each meta comp? ──');
console.log('(REAL = crawled avgPlace · overlap = shared units of 8 · trait = deepest breakpoint the Lab hit)\n');
console.log(`${pad('comp', 30)} ${pad('src', 5)} ${pad('avgPl', 6)} ${pad('n', 5)} ${pad('overlap', 9)} trait found`);
const sorted = [...matches].sort((a, b) => a.info.comp.avgPlace - b.info.comp.avgPlace);
for (const m of sorted) {
  const c = m.info.comp;
  const src = m.info.real ? 'REAL' : 'seed';
  const trait = m.traitHit ? `${m.traitHit.trait} ${m.traitHit.count} (Lab #${m.traitHitRank})` : '—';
  const ov = m.bestOverlap >= 5 ? `${m.bestOverlap}/8 ✓✓` : m.bestOverlap >= 3 ? `${m.bestOverlap}/8 ✓` : `${m.bestOverlap}/8`;
  console.log(`${pad(c.name.slice(0, 29), 30)} ${pad(src, 5)} ${pad(r2(c.avgPlace), 6)} ${pad(m.info.sample || '—', 5)} ${pad(ov, 9)} ${trait}`);
}

console.log('\n── Lens 2: where does each Lab discovery land? ──\n');
console.log(`${pad('#', 3)} ${pad('top trait', 16)} ${pad('tag', 8)} ${pad('best comp match', 30)} ${pad('ov', 4)} avgPl`);
for (const bm of boardMatches) {
  const top = bm.board.activeTraits.find((t) => t.tierLevel > 0);
  const id = top ? `${top.name} ${top.count}` : '—';
  const matchName = bm.bestComp ? `${bm.bestComp.name.slice(0, 29)}${bm.real ? '' : ' (seed)'}` : '—';
  console.log(`${padL(bm.rank, 3)} ${pad(id, 16)} ${pad(bm.tag, 8)} ${pad(matchName, 30)} ${pad(bm.bestOverlap, 4)} ${bm.avgPlace != null ? r2(bm.avgPlace) : '—'}`);
}

const tagCount = (t: string): number => boardMatches.filter((b) => b.tag === t).length;
console.log(`\ntags:  Known ${tagCount('Known')}  ·  Variant ${tagCount('Variant')}  ·  Novel ${tagCount('Novel')}`);

console.log('\n── Lens 3: does math score predict ladder placement? ──');
console.log('(REAL comps only · pairing each with its best-overlap Lab board score)\n');
console.log(`${pad('comp', 30) } ${pad('avgPl', 6)} ${pad('overlap', 8)} labScore  used?`);
for (const p of [...corrPairsAll].sort((a, b) => a.avgPlace - b.avgPlace)) {
  const used = p.overlap >= 3 ? 'yes' : 'DROP (coincidental)';
  console.log(`${pad(p.comp.name.slice(0, 29), 30)} ${pad(r2(p.avgPlace), 6)} ${pad(p.overlap + '/8', 8)} ${pad(r2(p.score), 8)} ${used}`);
}
console.log(`\nSpearman ρ, ALL pairs (n=${corrPairsAll.length}, incl. coincidental) = ${r2(rhoAll)}`);
console.log(`Spearman ρ, overlap≥3 only (n=${corrPairs.length}) = ${Number.isNaN(rho) ? 'n too small' : r2(rho)}  (want NEGATIVE: higher score → better place)`);

// ---- synthesis: credibility rating -----------------------------------------

const realComps = compInfo.filter((c) => c.real);
const goodComps = realComps.filter((c) => c.comp.avgPlace <= 2.5); // ladder "winners"

// Three escalating bars for "did the math find this comp":
//  loose  — any of the comp's traits at a breakpoint (shares a trait shell)
//  carry  — the comp's PRIMARY (carry-identity) trait at tier ≥ 2
//  roster — ≥ 5 of the comp's 8 units (nearly the same board)
const looseHit = (c: CompInfo): boolean => matches.find((m) => m.info.comp.id === c.comp.id)!.traitHit !== null;
const carryHit = (c: CompInfo): boolean => deepestTierForTrait(c.comp.traits[0]) >= 2;
const rosterHit = (c: CompInfo): boolean => matches.find((m) => m.info.comp.id === c.comp.id)!.bestOverlap >= 5;

const pct = (n: number, d: number): string => `${n}/${d} → ${Math.round((n / Math.max(1, d)) * 100)}%`;

console.log('\n══════════ SYNTHESIS ══════════');
console.log(`Ground truth: ${realComps.length} comps with real crawl data; ${goodComps.length} are "winners" (avgPlace ≤ 2.5).\n`);

console.log('RECALL — did the math find the meta? (over the 7 REAL comps)');
console.log(`  loose  (shares a trait shell):          ${pct(realComps.filter(looseHit).length, realComps.length)}`);
console.log(`  carry  (primary trait at tier ≥ 2):     ${pct(realComps.filter(carryHit).length, realComps.length)}`);
console.log(`  roster (≥ 5/8 of the exact units):      ${pct(realComps.filter(rosterHit).length, realComps.length)}`);
console.log('  ↳ over the 4 WINNERS only:');
console.log(`     loose ${pct(goodComps.filter(looseHit).length, goodComps.length)}  ·  ` +
  `carry ${pct(goodComps.filter(carryHit).length, goodComps.length)}  ·  roster ${pct(goodComps.filter(rosterHit).length, goodComps.length)}`);
console.log(`  winners missed at carry level: ${goodComps.filter((c) => !carryHit(c)).map((c) => `${c.comp.name.split(' — ')[0]} (${r2(c.comp.avgPlace)})`).join(', ') || '(none)'}`);

console.log('\nPRECISION — where the math overlaps the meta, are those comps good?');
const variantPlus = boardMatches.filter((b) => b.bestOverlap >= 3 && b.avgPlace != null);
const avgMatched = variantPlus.reduce((s, b) => s + (b.avgPlace ?? 0), 0) / Math.max(1, variantPlus.length);
const avgAllReal = realComps.reduce((s, c) => s + c.comp.avgPlace, 0) / realComps.length;
console.log(`  mean avgPlace of comps the Lab overlaps (≥3 units): ${r2(avgMatched)}  vs  field mean ${r2(avgAllReal)}`);

console.log('\nRANK — does the math SCORE order match the ladder order?');
console.log(`  Spearman ρ (overlap≥3, n=${corrPairs.length}): ${Number.isNaN(rho) ? 'n too small' : r2(rho)}  ` +
  `[all-pairs ρ=${r2(rhoAll)} is inflated by 1-unit coincidences]`);

console.log('\n── VERDICT ──');
console.log('Trait-shell credibility (finds winning SYNERGY shells):  STRONG  (B+)');
console.log('Carry-comp credibility   (names the right CARRY comp):   WEAK    (D)');
console.log('Placement prediction     (score → win rate):            NONE/NOISE');
console.log('\nNet: a credible high-synergy SHELL generator, NOT yet a meta/placement predictor.');
console.log('Root cause (post item-aware update): each board now DOES designate a carry and score it');
console.log('on a best-in-slot 3-item build, so DPS is itemized — but the ability model still over-rates');
console.log('AP nukes (e.g. Sona) and under-rates true auto-attack ADCs, so the surfaced carries skew to');
console.log('reroll/AP holders, not the 4-/5-cost ADC carries (Karma/Vex/Yi) that DEFINE the winning comps.');
console.log('→ Remaining fix is Stage 3: precise per-ability formulas (multi-cast / channel / conditional).\n');
