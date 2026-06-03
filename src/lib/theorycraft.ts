import type { ItemMath, TraitTierMath, UnitMath } from '../types';
import { ALL_UNITS, TRAIT_MATH } from '../data/unit-math';
import { activeTraitTiers, evaluateUnit, resolveItem, resolveUnit } from './combat-model';
import type { ActiveTrait, UnitEvaluation } from './combat-model';

// ---------------------------------------------------------------------------
// STAGE 2 · THEORYCRAFT SEARCH
//
// Pure TypeScript on top of the Stage 1 combat model. It scores an arbitrary
// 8-unit board (trait breakpoints + damage ceiling + frontline wall) and runs a
// trait-anchored beam search to DISCOVER high-synergy boards — including combos
// that aren't in the hand-curated meta list. Same deterministic code in the
// browser and the offline pipeline.
//
// Per the project's "stay 100% static" rule, the expensive discovery search is
// meant to run OFFLINE (scripts/build-theorycraft.ts) and bake its results into
// src/data/theorycraft.ts. scoreBoard() is cheap enough to also run live for an
// interactive "score my board" surface.
//
// This ranks by the deterministic model only. It is a candidate generator —
// "theorycraft proposes, ladder data validates" — so discoveries should be
// cross-checked against the crawled Double Up performance, not trusted blindly.
// ---------------------------------------------------------------------------

const DEFAULT_BOARD_SIZE = 8;
const DEFAULT_STAR = 2;

// Score-blend weights. The three terms are tuned to land in the same order of
// magnitude (~10–20 each) so no single axis dominates — an early version let the
// trait term swamp the blend, which just produced degenerate "rainbow" boards
// splashing a dozen first-breakpoint traits. Ranking-only — absolute values are
// meaningless, so tune by eyeballing the discoveries, not by units.
const W_TRAIT = 1.0;
const CARRY_DIVISOR = 120; // top-2 itemized carry DPS
const FRONT_DIVISOR = 900; // top-3 unit EHP

// The carry metric trusts EXACT auto-attack DPS (AD × AS × crit — pure
// arithmetic) fully, but the ability-damage estimate only partially. The model
// reads more than a lone "Damage" variable: it multiplies fixed multi-hit
// abilities by their strike count (Jhin's 4 shots, Xayah's 6 feathers) and
// spreads Bleed/Burn/Poison DoT totals over their duration (Talon). And Stage 3
// now pins an EXACT per-cast base for units with a baked formula (read from the
// ability description offline) — repeat-count channels (Sona's NumCasts) and
// mis-scaled actives (Fiora's true-damage 6-vital strike) that the variable
// NAME alone can't reveal. What stays approximate are the units no formula
// covers yet, plus conditionals and %-max-HP. Burst is also simply less reliable
// than sustained auto DPS for ranking a carry. So we still discount the ability
// half: it stops a unit whose whole value is one big modeled nuke (a 5-cost
// caster the live meta doesn't play as a carry) from out-ranking real auto carries.
const ABILITY_DPS_CONFIDENCE = 0.5;

/** Carry-ranking DPS: full auto DPS + discounted ability DPS (see above). */
function carryDpsOf(e: UnitEvaluation): number {
  return e.autoDps + ABILITY_DPS_CONFIDENCE * e.ability.dps;
}

// ---- best-in-slot itemization ----------------------------------------------
//
// A carry's real DPS depends on its items, not its bare base stats — itemizing
// is what separates a true carry from a body. Rather than search the C(48,3)
// item space, we evaluate a handful of ARCHETYPAL completed-item sets and keep
// the one that maximizes a unit's DPS. The winning archetype implicitly answers
// "is this an AD carry, an AP caster, or an on-hit unit?" — the AD set only
// helps AD scalers, the AP set only AP scalers (the combat model scales each
// ability by its own AD/AP variable), so the best set lands on the right axis.
//
// The pick is a per-unit property (computed on the bare unit, cached), then the
// chosen set is re-evaluated WITH each board's active trait tiers. Decoupling
// the archetype choice from board context keeps it stable for the UI and cheap
// for the search; a trait almost never flips AD↔AP for a unit.

interface CarryItemSet {
  label: string;
  names: string[]; // display names that resolved in the math data
  items: ItemMath[];
}

const CARRY_ITEM_SETS: CarryItemSet[] = [
  { label: 'AD crit', names: ['Infinity Edge', 'Last Whisper', 'Giant Slayer'], items: [] },
  { label: 'AD on-hit', names: ["Kraken's Fury", "Guinsoo's Rageblade", 'Last Whisper'], items: [] },
  { label: 'AP burst', names: ["Rabadon's Deathcap", 'Jeweled Gauntlet', 'Giant Slayer'], items: [] },
  { label: 'AP caster', names: ["Rabadon's Deathcap", "Nashor's Tooth", 'Jeweled Gauntlet'], items: [] },
  { label: 'Attack speed', names: ["Guinsoo's Rageblade", "Nashor's Tooth", 'Red Buff'], items: [] },
].map((s) => {
  const resolved = s.names.map((n) => ({ n, im: resolveItem(n) }));
  return {
    label: s.label,
    names: resolved.filter((r) => r.im).map((r) => r.n),
    items: resolved.map((r) => r.im).filter(Boolean) as ItemMath[],
  };
});

export interface BestItemSet {
  label: string;
  items: string[]; // display names
  dps: number; // itemized totalDps on the bare unit (no board traits)
  bareDps: number; // unit's totalDps with no items, for an honest delta
}

const _bisCache = new Map<string, BestItemSet>();

/** The archetypal completed-item set that maximizes a unit's DPS, plus the
 *  bare-unit DPS for comparison. Cached per unit + star. */
export function bestItemSet(u: UnitMath, star: number = DEFAULT_STAR): BestItemSet {
  const key = `${u.apiName}@${star}`;
  const hit = _bisCache.get(key);
  if (hit) return hit;
  const bareDps = evaluateUnit(u, { star }).totalDps;
  let best: BestItemSet = { label: '', items: [], dps: -1, bareDps };
  for (const set of CARRY_ITEM_SETS) {
    if (!set.items.length) continue;
    const dps = evaluateUnit(u, { star, items: set.items }).totalDps;
    if (dps > best.dps) best = { label: set.label, items: set.names, dps, bareDps };
  }
  if (best.dps < 0) best = { label: 'none', items: [], dps: bareDps, bareDps };
  _bisCache.set(key, best);
  return best;
}

export interface ActiveTraitView {
  name: string;
  count: number;
  tierLevel: number; // 1 = first breakpoint, 2 = second, …
}

export interface BoardScore {
  units: string[];
  cost: number; // total unit cost — a proxy for board level / econ demand
  activeTraits: ActiveTraitView[];
  traitScore: number;
  carryPower: number; // sum of the two highest ITEMIZED unit DPS
  frontPower: number; // sum of the three highest unit EHP (bare + traits)
  score: number; // blended ranking score
  suggestedCarry: string;
  suggestedCarryItems: string[]; // best-in-slot build for the suggested carry
  suggestedCarryDps: number; // that carry's real itemized totalDps (board traits folded in)
  /** A trait sitting one unit short of its next breakpoint — an emblem target. */
  suggestedEmblem?: string;
}

// ---- trait tier depth ------------------------------------------------------

/** How many breakpoints a trait has reached at `count` (1 = first tier). */
function tierLevelFor(traitName: string, count: number): number {
  const tm = TRAIT_MATH[traitName];
  if (!tm) return 0;
  let level = 0;
  for (const t of tm.tiers) if (count >= t.minUnits) level++;
  return level;
}

/** The subset of a board's active trait tiers that apply to one unit, in the
 *  shape evaluateUnit() wants. Shared by scoreBoard and evaluateBoardUnits. */
function tiersForUnit(u: UnitMath, active: ActiveTrait[]): { name: string; tier: TraitTierMath }[] {
  const unitTraits = new Set(u.traits);
  return active.filter((t) => unitTraits.has(t.name)).map((t) => ({ name: t.name, tier: t.tier }));
}

// ---- board scoring ---------------------------------------------------------

/** Score a set of unit display names with the deterministic model. Unknown
 *  names are ignored. Trait breakpoints from the whole board are applied to
 *  each unit before measuring its DPS / EHP. */
export function scoreBoard(unitNames: string[], star: number = DEFAULT_STAR): BoardScore {
  const units: UnitMath[] = [];
  for (const n of unitNames) {
    const u = resolveUnit(n);
    if (u) units.push(u);
  }

  const active = activeTraitTiers(unitNames);
  const activeView: ActiveTraitView[] = active.map((a) => ({
    name: a.name,
    count: a.count,
    tierLevel: tierLevelFor(a.name, a.count),
  }));

  // Trait synergy: reward DEPTH (deep breakpoints) far more than breadth. tierLevel
  // is squared so a 6-unit vertical (tier 3 → 9) is worth far more than three
  // 2-unit splashes (3 × tier 1 → 3); a small linear count term keeps a wide-but-
  // shallow board from scoring zero. Sub-breakpoint traits (tierLevel 0) add nothing.
  let traitScore = 0;
  for (const a of activeView) {
    if (a.tierLevel <= 0) continue;
    traitScore += a.tierLevel * a.tierLevel + 0.2 * a.count;
  }

  // Per-unit ITEMIZED DPS (best-in-slot carry build) and bare-EHP, both with the
  // board's active trait tiers folded in. Carry rank is itemized — what the unit
  // does once you actually build it — so a true carry beats a high-base-stat body.
  // EHP stays bare (frontline holds tank items we don't model; this is a relative
  // wall proxy, and the user's concern is specifically carries).
  const dps: { name: string; blend: number; real: number; items: string[] }[] = [];
  const ehp: number[] = [];
  for (const u of units) {
    const traits = tiersForUnit(u, active);
    const bis = bestItemSet(u, star);
    const itemized = evaluateUnit(u, { star, items: bis.items.map(resolveItem).filter(Boolean) as ItemMath[], traits });
    dps.push({ name: u.name, blend: carryDpsOf(itemized), real: itemized.totalDps, items: bis.items });
    ehp.push(evaluateUnit(u, { star, traits }).ehp.mixed);
  }

  // Rank carries by the auto-weighted blend; display the real itemized total.
  const dpsSorted = [...dps].sort((a, b) => b.blend - a.blend);
  const carryPower = dpsSorted.slice(0, 2).reduce((s, d) => s + d.blend, 0);
  const frontPower = [...ehp].sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
  const cost = units.reduce((s, u) => s + u.cost, 0);

  const score = W_TRAIT * traitScore + carryPower / CARRY_DIVISOR + frontPower / FRONT_DIVISOR;

  // Emblem hint: a trait one unit short of crossing a breakpoint. Pick the one
  // whose emblem would unlock the highest tier (most valuable spatula target).
  let suggestedEmblem: string | undefined;
  let bestNextLevel = 0;
  const counts = new Map<string, number>();
  for (const u of units) for (const t of u.traits) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [name, count] of counts) {
    const next = tierLevelFor(name, count + 1);
    if (next > tierLevelFor(name, count) && next > bestNextLevel) {
      bestNextLevel = next;
      suggestedEmblem = name;
    }
  }

  const carry = dpsSorted[0];
  return {
    units: units.map((u) => u.name),
    cost,
    activeTraits: activeView.sort((a, b) => b.count - a.count || b.tierLevel - a.tierLevel),
    traitScore,
    carryPower,
    frontPower,
    score,
    suggestedCarry: carry?.name ?? units[0]?.name ?? '',
    suggestedCarryItems: carry?.items ?? [],
    suggestedCarryDps: carry?.real ?? 0,
    suggestedEmblem,
  };
}

// ---- per-unit breakdown (UI) -----------------------------------------------

export interface BoardUnitEval {
  name: string;
  cost: number;
  traits: string[];
  dps: number; // BARE totalDps (with board trait tiers) — what the body does
  itemizedDps: number; // totalDps with its best-in-slot carry build
  carryRank: number; // auto-weighted blend the carry pick is ranked on
  bestItems: string[]; // that build's item display names
  bestItemLabel: string; // archetype label (AD crit / AP burst / …)
  ehp: number; // mixed effective HP (bare + traits)
  evaluation: UnitEvaluation; // full auditable breakdown (bare + traits)
}

/** Evaluate every resolvable unit on a board with the board's active trait
 *  tiers applied, sorted by ITEMIZED DPS (carry-first). Powers the Lab's
 *  per-board math view — same numbers scoreBoard ranks on, plus each unit's
 *  best-in-slot ceiling so the suggested carry is obvious. */
export function evaluateBoardUnits(unitNames: string[], star: number = DEFAULT_STAR): BoardUnitEval[] {
  const active = activeTraitTiers(unitNames);
  const out: BoardUnitEval[] = [];
  for (const n of unitNames) {
    const u = resolveUnit(n);
    if (!u) continue;
    const traits = tiersForUnit(u, active);
    const e = evaluateUnit(u, { star, traits });
    const bis = bestItemSet(u, star);
    const itemized = evaluateUnit(u, { star, items: bis.items.map(resolveItem).filter(Boolean) as ItemMath[], traits });
    out.push({
      name: u.name,
      cost: u.cost,
      traits: u.traits,
      dps: e.totalDps,
      itemizedDps: itemized.totalDps,
      carryRank: carryDpsOf(itemized),
      bestItems: bis.items,
      bestItemLabel: bis.label,
      ehp: e.ehp.mixed,
      evaluation: e,
    });
  }
  // Carry-first: ranked by the same auto-weighted blend scoreBoard uses.
  return out.sort((a, b) => b.carryRank - a.carryRank);
}

// ---- discovery (trait-anchored beam search) --------------------------------

export interface DiscoverOptions {
  boardSize?: number;
  beamWidth?: number;
  topN?: number;
  star?: number;
  /** Max shared units before two boards count as the same comp (default size−3). */
  maxOverlap?: number;
  /** Max surfaced boards that may share the same suggested carry (default 3). */
  maxPerCarry?: number;
}

const boardKey = (names: string[]): string => [...names].sort().join('|');

/** Grow one board from a seed trait's units via beam search, keeping coherent
 *  boards by only adding units that share a trait already on the board. */
function searchFromSeed(seedPool: UnitMath[], boardSize: number, beamWidth: number, star: number): BoardScore[] {
  let beam: string[][] = [[]];

  for (let depth = 0; depth < boardSize; depth++) {
    const scored: { units: string[]; score: number }[] = [];
    const localSeen = new Set<string>();

    for (const partial of beam) {
      // depth 0 seeds from the trait pool; afterwards keep boards cohesive by
      // only adding units that share a trait with the current board.
      const onBoardTraits = new Set<string>();
      for (const n of partial) {
        const u = resolveUnit(n);
        if (u) for (const t of u.traits) onBoardTraits.add(t);
      }
      const candidates =
        depth === 0 ? seedPool : ALL_UNITS.filter((u) => u.traits.some((t) => onBoardTraits.has(t)));

      for (const u of candidates) {
        if (partial.includes(u.name)) continue;
        const units = [...partial, u.name];
        const key = boardKey(units);
        if (localSeen.has(key)) continue;
        localSeen.add(key);
        scored.push({ units, score: scoreBoard(units, star).score });
      }
    }

    if (!scored.length) break;
    scored.sort((a, b) => b.score - a.score);
    beam = scored.slice(0, beamWidth).map((s) => s.units);
  }

  return beam.map((b) => scoreBoard(b, star));
}

/** Count units shared between two boards (board sizes are equal in practice). */
function overlapCount(a: string[], b: string[]): number {
  const set = new Set(a);
  let n = 0;
  for (const name of b) if (set.has(name)) n++;
  return n;
}

/** Discover high-synergy boards across every trait seed. Collects candidates
 *  from every trait's beam search, then greedily accepts the highest-scoring
 *  boards that aren't near-duplicates of an already-accepted one — so the
 *  surfaced list shows DISTINCT ideas, not N variations of the same vertical. */
export function discoverBoards(opts: DiscoverOptions = {}): BoardScore[] {
  const boardSize = opts.boardSize ?? DEFAULT_BOARD_SIZE;
  // Wider beam keeps more distinct boards alive per seed, so the diversity +
  // per-carry filters downstream have varied raw material (a narrow beam
  // converges every seed onto the same few flex carries).
  const beamWidth = opts.beamWidth ?? 60;
  const topN = opts.topN ?? 24;
  const star = opts.star ?? DEFAULT_STAR;
  const maxPerCarry = opts.maxPerCarry ?? 3;
  // Two boards sharing more than this many units are "the same comp" for
  // surfacing. size−3 means an accepted board differs by at least 3 units from
  // every higher-scoring one — enough to suppress near-identical verticals that
  // only swap a unit or two (e.g. eight Rogue-5 boards sharing the same core).
  const maxOverlap = opts.maxOverlap ?? boardSize - 3;

  const seen = new Set<string>();
  const candidates: BoardScore[] = [];

  for (const traitName of Object.keys(TRAIT_MATH)) {
    const pool = ALL_UNITS.filter((u) => u.traits.includes(traitName));
    if (pool.length < 2) continue;

    for (const board of searchFromSeed(pool, boardSize, beamWidth, star)) {
      if (board.units.length < boardSize) continue;
      const key = boardKey(board.units);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(board);
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  // Greedy diversity filter: accept a board only if it differs from every
  // already-accepted (higher-scoring) board by more than `maxOverlap` units AND
  // its suggested carry isn't already over-represented. A discovery list's value
  // is VARIETY, so a couple of flex 5-cost carries (Sona, Fiora) shouldn't anchor
  // most of the slots — the per-carry cap forces distinct carry archetypes up.
  const results: BoardScore[] = [];
  const carryCount = new Map<string, number>();
  for (const board of candidates) {
    if ((carryCount.get(board.suggestedCarry) ?? 0) >= maxPerCarry) continue;
    if (results.some((r) => overlapCount(r.units, board.units) > maxOverlap)) continue;
    results.push(board);
    carryCount.set(board.suggestedCarry, (carryCount.get(board.suggestedCarry) ?? 0) + 1);
    if (results.length >= topN) break;
  }
  return results;
}
