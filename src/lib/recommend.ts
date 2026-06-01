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
function rosterOf(c: Comp): string[] {
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
