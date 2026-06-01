import type { Comp, DamageType, Prefs } from '../types';
import { COMPS } from '../data/comps';

// ---------------------------------------------------------------------------
// Recommendation engine
//
// recommend(partner, prefs) scores every OTHER comp against the partner's comp
// and the user's prefs, then returns them sorted best-first. Every score is
// explainable: each component contributes human-readable reason lines, and the
// most impactful ones surface on the result card.
//
// All component sub-scores are normalised to 0–1 before weighting, so the math
// stays sane and the final "match %" maps cleanly onto 0–100.
// ---------------------------------------------------------------------------

/** Tune the engine here — every lever lives in one place. */
export const WEIGHTS = {
  itemComplement: 30,
  unitOverlap: 25,
  boardSynergy: 20,
  strength: 15,
  contestedFit: 10,
  preferenceMatch: 10, // split evenly across the playstyle + tempo prefs
} as const;

export type ReasonTone = 'positive' | 'negative' | 'neutral';

export interface ReasonLine {
  text: string;
  tone: ReasonTone;
  /** Signed salience used to rank which reasons surface (|impact| = strength). */
  impact: number;
}

export interface ScoreComponent {
  label: string;
  score01: number; // normalised 0–1
  weight: number;
  weighted: number;
}

export interface ScoredComp {
  comp: Comp;
  matchPct: number; // 0–100, for display
  rawScore: number; // weighted sum (numerator)
  maxScore: number; // active weight total (denominator)
  components: ScoreComponent[];
  /** All reasons, already sorted by descending salience. */
  reasons: ReasonLine[];
  sharedUnits: string[];
}

// ---- helpers ----
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const DMG_LABEL: Record<DamageType, string> = {
  AD: 'AD',
  AP: 'AP',
  hybrid: 'hybrid',
};

/** Component shards each damage type pulls — used in reason text + economy panel. */
export const SHARDS: Record<DamageType, string> = {
  AD: 'Swords & Bows',
  AP: 'Rods & Tears',
  hybrid: 'mixed shards',
};

const CONTESTED_LEVEL: Record<Comp['contested'], number> = {
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
};

function listUnits(units: string[], max = 3): string {
  if (units.length <= max) return joinNames(units);
  return `${units.slice(0, max).join(', ')} +${units.length - max} more`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * A comp's full roster for overlap detection: the deduped union of `units`,
 * `frontline`, and carry names. Some comps list a frontliner (e.g. Cho'Gath in
 * the Brawler reroll) in `frontline` but omit it from `units`; reading `units`
 * alone made the overlap check silently miss those, reporting "zero overlap" for
 * a champion both boards actually run.
 */
export function rosterOf(c: Comp): string[] {
  return [...new Set([...c.units, ...c.frontline, ...c.carries.map((x) => x.name)])];
}

// ---- 1. Item complement (weight 30) ----
function itemComplementScore(cand: Comp, partner: Comp, prefs: Prefs): number {
  const a = cand.primaryDamage;
  const b = partner.primaryDamage;
  let base: number;
  if (a === 'hybrid' || b === 'hybrid')
    base = 0.5; // hybrid flexes either way — partial credit
  else base = a === b ? 0 : 1; // opposite types = clean split, same = collision

  if (prefs.itemLean === 'flexible') return base;
  // Reward candidates that also match the user's stated item lean.
  const leanMatch = a === prefs.itemLean ? 1 : 0;
  return clamp01(0.7 * base + 0.3 * leanMatch);
}

// ---- 2. Unit overlap (weight 25) ----
function unitOverlapScore(shared: string[]): number {
  return clamp01(1 - shared.length * 0.3); // 0→1, 1→.7, 2→.4, 3→.1, 4+→0
}

// ---- 3. Board synergy (weight 20) ----
function boardSynergyScore(cand: Comp, partner: Comp): number {
  return cand.playstyle !== partner.playstyle ? 1 : 0.4;
}

// ---- 4. Standalone strength (weight 15) ----
function strengthScore(cand: Comp): number {
  const placeNorm = clamp01((8 - cand.avgPlace) / 7); // lower place is better
  return clamp01(0.6 * placeNorm + 0.4 * (cand.top4 / 100));
}

// ---- 5. Contested fit (weight 10, scaled by tolerance) ----
function contestedScore(cand: Comp, prefs: Prefs): number {
  const penalty = CONTESTED_LEVEL[cand.contested] / 3; // 0..1
  const factor = prefs.contested === 'avoid' ? 1.4 : prefs.contested === 'fight' ? 0.35 : 1;
  return clamp01(1 - penalty * factor);
}

// ---------------------------------------------------------------------------
function scoreComp(cand: Comp, partner: Comp, prefs: Prefs): ScoredComp {
  let rawScore = 0;
  let maxScore = 0;
  const components: ScoreComponent[] = [];
  const reasons: ReasonLine[] = [];

  const add = (label: string, score01: number, weight: number, reason?: Omit<ReasonLine, 'impact'>) => {
    const weighted = score01 * weight;
    rawScore += weighted;
    maxScore += weight;
    components.push({ label, score01, weight, weighted });
    if (reason) reasons.push({ ...reason, impact: weight * (score01 - 0.5) });
  };

  const partnerRoster = rosterOf(partner);
  const sharedUnits = rosterOf(cand).filter((u) => partnerRoster.includes(u));

  // 1. Item complement
  const item = itemComplementScore(cand, partner, prefs);
  add('Item complement', item, WEIGHTS.itemComplement, itemReason(cand, partner));

  // 2. Unit overlap
  const overlap = unitOverlapScore(sharedUnits);
  add('Unit overlap', overlap, WEIGHTS.unitOverlap, overlapReason(partner, sharedUnits));

  // 3. Board synergy
  const synergy = boardSynergyScore(cand, partner);
  add('Board synergy', synergy, WEIGHTS.boardSynergy, synergyReason(cand, partner, synergy));

  // 4. Strength
  const strength = strengthScore(cand);
  add('Standalone strength', strength, WEIGHTS.strength, strengthReason(cand, strength));

  // 5. Contested fit
  const contested = contestedScore(cand, prefs);
  add('Contested fit', contested, WEIGHTS.contestedFit, contestedReason(cand, prefs, contested));

  // 6. Preference matches — "no preference" contributes nothing (weight dropped
  //    from both numerator and denominator, so it neither rewards nor penalises).
  const half = WEIGHTS.preferenceMatch / 2;
  if (prefs.playstyle !== 'any') {
    const m = cand.playstyle === prefs.playstyle ? 1 : 0;
    add('Playstyle pref', m, half, {
      text: m
        ? `Matches your ${labelPlaystyle(cand.playstyle)} preference.`
        : `Runs ${labelPlaystyle(cand.playstyle)}, not the ${labelPlaystyle(prefs.playstyle)} you asked for.`,
      tone: m ? 'positive' : 'negative',
    });
  }
  if (prefs.tempo !== 'any') {
    const m = cand.tempo === prefs.tempo ? 1 : 0;
    add('Tempo pref', m, half, {
      text: m
        ? `Hits your ${labelTempo(cand.tempo)} tempo.`
        : `Plays ${labelTempo(cand.tempo)}, not your ${labelTempo(prefs.tempo)} preference.`,
      tone: m ? 'positive' : 'negative',
    });
  }

  reasons.sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact));

  const matchPct = Math.round(clamp01(rawScore / maxScore) * 100);

  return { comp: cand, matchPct, rawScore, maxScore, components, reasons, sharedUnits };
}

// ---- reason builders ----
function itemReason(cand: Comp, partner: Comp): Omit<ReasonLine, 'impact'> {
  const cd = cand.primaryDamage;
  const pd = partner.primaryDamage;
  if (cd !== 'hybrid' && pd !== 'hybrid' && cd !== pd) {
    return {
      text: `Items don't collide — your ${DMG_LABEL[cd]} board pulls ${SHARDS[cd]} while ${partner.name.split('—')[0].trim()}'s ${DMG_LABEL[pd]} build wants ${SHARDS[pd]}.`,
      tone: 'positive',
    };
  }
  if (cd === pd && cd !== 'hybrid') {
    return {
      text: `Heads up: both boards itemise ${DMG_LABEL[cd]} (${SHARDS[cd]}) — you'll split the same shards.`,
      tone: 'negative',
    };
  }
  return {
    text: `Hybrid shards flex — ${cd === 'hybrid' ? 'your' : "partner's"} build can bend around the other carry's components.`,
    tone: 'neutral',
  };
}

function overlapReason(partner: Comp, shared: string[]): Omit<ReasonLine, 'impact'> {
  if (shared.length === 0) {
    return {
      text: `Zero unit overlap with ${shortName(partner)} — you won't fight over the same shop.`,
      tone: 'positive',
    };
  }
  const plural = shared.length === 1 ? 'unit' : 'units';
  return {
    text: `You'd contest ${listUnits(shared)} (${shared.length} shared ${plural}) — that thins both your shops.`,
    tone: shared.length >= 2 ? 'negative' : 'neutral',
  };
}

function synergyReason(cand: Comp, partner: Comp, score: number): Omit<ReasonLine, 'impact'> {
  if (score >= 1) {
    const aggressive = cand.playstyle === 'aggressive' ? shortName(cand) : shortName(partner);
    const scaling = cand.playstyle === 'scaling' ? shortName(cand) : shortName(partner);
    return {
      text: `Classic Double Up split — ${aggressive} pressures early to defend shared HP while ${scaling} scales for the late game.`,
      tone: 'positive',
    };
  }
  return {
    text: `Both boards run a ${labelPlaystyle(cand.playstyle)} plan — no early/late division of labour, and you may bleak HP at the same time.`,
    tone: 'negative',
  };
}

function strengthReason(cand: Comp, score: number): Omit<ReasonLine, 'impact'> {
  return {
    text: `Standalone strength: ${cand.avgPlace.toFixed(2)} avg place, ${cand.top4}% top-4, ${cand.first}% first.`,
    tone: score >= 0.6 ? 'positive' : score <= 0.45 ? 'negative' : 'neutral',
  };
}

function contestedReason(cand: Comp, prefs: Prefs, score: number): Omit<ReasonLine, 'impact'> {
  if (cand.contested === 'low') {
    return { text: `Open comp — rarely contested, safe to force.`, tone: 'positive' };
  }
  if (score <= 0.34) {
    const tail =
      prefs.contested === 'avoid'
        ? ` — risky given your "avoid contested" setting`
        : prefs.contested === 'fight'
          ? ` — but you're willing to fight for it`
          : '';
    return { text: `${capitalise(cand.contested)} contested${tail}.`, tone: prefs.contested === 'fight' ? 'neutral' : 'negative' };
  }
  return { text: `${capitalise(cand.contested)} contested — manageable at your tolerance.`, tone: 'neutral' };
}

// ---- label helpers ----
function labelPlaystyle(p: Comp['playstyle'] | 'any'): string {
  return p === 'aggressive' ? 'aggressive / early-tempo' : p === 'scaling' ? 'econ & scaling' : 'either';
}
function labelTempo(t: Comp['tempo'] | 'any'): string {
  return t === 'reroll' ? 'reroll' : t === 'fast8' ? 'Fast 8' : t === 'tempo' ? 'level-tempo' : 'any';
}
function shortName(c: Comp): string {
  return c.name.split('—')[0].split('/')[0].trim();
}
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
/** Pure: score every comp except the partner's own and return best-first. */
export function recommend(partner: Comp, prefs: Prefs): ScoredComp[] {
  return COMPS.filter((c) => c.id !== partner.id)
    .map((c) => scoreComp(c, partner, prefs))
    .sort((a, b) => b.matchPct - a.matchPct || a.comp.avgPlace - b.comp.avgPlace);
}

// ===========================================================================
// Board-fit recommender — a DIFFERENT question from recommend(). Instead of
// "which comp best complements my partner", this answers "given the champions I
// already have, which comps am I closest to and should build toward". It ranks
// every comp by how much of its roster (and its payoff carries) you already own,
// tie-broken by the comp's standalone strength and the prefs you set.
// ===========================================================================

/** Levers for the board-fit score, mirroring WEIGHTS for the partner engine. */
export const FIT_WEIGHTS = {
  coverage: 50, // share of the comp's roster you already field
  carries: 30, // share of the comp's carries you own — the payoff units
  strength: 15, // the comp's standalone Double Up performance
  prefs: 5, // alignment with the prefs you set (dropped when 'any'/'flexible')
} as const;

export interface BoardFit {
  comp: Comp;
  fitPct: number; // 0–100, for display
  have: string[]; // comp roster units you already field
  missing: string[]; // comp roster units you still need
  haveCarries: string[]; // carry names you already own
  missingCarries: string[]; // carry names you still need
  reasons: ReasonLine[]; // sorted by descending salience, like ScoredComp
}

/** How well a comp lines up with the prefs the user set (skips 'any'/'flexible'). */
function prefAlignment(cand: Comp, prefs: Prefs): { score: number; slots: number } {
  let hits = 0;
  let slots = 0;
  if (prefs.playstyle !== 'any') {
    slots++;
    if (cand.playstyle === prefs.playstyle) hits++;
  }
  if (prefs.tempo !== 'any') {
    slots++;
    if (cand.tempo === prefs.tempo) hits++;
  }
  if (prefs.itemLean !== 'flexible') {
    slots++;
    if (cand.primaryDamage === prefs.itemLean) hits++;
  }
  return { score: slots ? hits / slots : 0, slots };
}

function fitComp(cand: Comp, owned: Set<string>, prefs: Prefs): BoardFit {
  const roster = rosterOf(cand);
  const have = roster.filter((u) => owned.has(u));
  const missing = roster.filter((u) => !owned.has(u));
  const coverage = roster.length ? have.length / roster.length : 0;

  const carryNames = cand.carries.map((c) => c.name);
  const haveCarries = carryNames.filter((n) => owned.has(n));
  const missingCarries = carryNames.filter((n) => !owned.has(n));
  const carryFit = carryNames.length ? haveCarries.length / carryNames.length : 0;

  const strength = strengthScore(cand);
  const pref = prefAlignment(cand, prefs);

  // Drop a component's weight from BOTH numerator and denominator when it can't
  // apply (a comp with no carries, or no prefs set) so it neither helps nor hurts
  // — the same neutral-weight trick the partner engine uses for "no preference".
  const wCov = FIT_WEIGHTS.coverage;
  const wCar = carryNames.length ? FIT_WEIGHTS.carries : 0;
  const wStr = FIT_WEIGHTS.strength;
  const wPref = pref.slots ? FIT_WEIGHTS.prefs : 0;
  const fit01 = clamp01(
    (wCov * coverage + wCar * carryFit + wStr * strength + wPref * pref.score) / (wCov + wCar + wStr + wPref),
  );

  const reasons: ReasonLine[] = [];

  // Coverage — the headline signal, always surfaced first.
  if (have.length === 0) {
    reasons.push({ text: `You don't own any of this comp's units yet — a full pivot from here.`, tone: 'negative', impact: 50 });
  } else {
    reasons.push({
      text: `You already field ${have.length} of ${roster.length} units — ${listUnits(have)}.`,
      tone: coverage >= 0.5 ? 'positive' : 'neutral',
      impact: 20 + 50 * coverage,
    });
  }

  // Carries — the payoff units count for more than a filler frontliner.
  if (carryNames.length) {
    if (missingCarries.length === 0) {
      reasons.push({
        text: `You've already hit ${haveCarries.length === 1 ? 'the carry' : 'both carries'} — ${joinNames(haveCarries)}.`,
        tone: 'positive',
        impact: 35,
      });
    } else if (haveCarries.length) {
      reasons.push({
        text: `You have ${joinNames(haveCarries)}, but still need ${joinNames(missingCarries)} to carry.`,
        tone: 'neutral',
        impact: 12,
      });
    } else {
      reasons.push({
        text: `You're missing the payoff ${missingCarries.length === 1 ? 'carry' : 'carries'} — ${joinNames(missingCarries)}.`,
        tone: 'negative',
        impact: 30,
      });
    }
  }

  // Standalone strength + contested fit reuse the partner engine's reason text.
  reasons.push({ ...strengthReason(cand, strength), impact: WEIGHTS.strength * (strength - 0.5) });
  const contested = contestedScore(cand, prefs);
  reasons.push({ ...contestedReason(cand, prefs, contested), impact: WEIGHTS.contestedFit * (contested - 0.5) });

  reasons.sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact));

  return { comp: cand, fitPct: Math.round(fit01 * 100), have, missing, haveCarries, missingCarries, reasons };
}

/** Pure: rank every comp by how well the units you already own fit it, best-first. */
export function recommendForBoard(myUnits: string[], prefs: Prefs): BoardFit[] {
  const owned = new Set(myUnits);
  return COMPS.map((c) => fitComp(c, owned, prefs)).sort(
    (a, b) => b.fitPct - a.fitPct || a.comp.avgPlace - b.comp.avgPlace,
  );
}
