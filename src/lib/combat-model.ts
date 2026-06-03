import type { Carry, Comp } from '../types';
import type { AbilityFormula, AbilityScaling, AbilityVariable, ItemMath, TraitTierMath, UnitMath } from '../types';
import { ALL_ITEMS, ALL_UNITS, TRAIT_MATH } from '../data/unit-math';
import { abilityFormula } from '../data/ability-formulas';

// ---------------------------------------------------------------------------
// STAGE 1 · TRANSPARENT DETERMINISTIC COMBAT MODEL
//
// Pure TypeScript. No I/O, no key, no randomness — the SAME code runs in the
// browser and in the offline pipeline. It turns the raw numbers in
// src/data/unit-math.ts (extracted from CommunityDragon) into readable,
// auditable per-unit estimates: sustained DPS, ability cadence + burst,
// effective HP, and how each item / trait breakpoint moves those numbers.
//
// This is an APPROXIMATION engine for RELATIVE comparison and discovery, not a
// placement-predicting battle simulator. A faithful TFT sim would need
// positioning, target selection, cast timing, mana-lock, crowd control, and
// shred/sunder — none of which are modeled here. Every shortcut is listed in
// ASSUMPTIONS and surfaced in the UI so nothing is hidden behind a number.
//
// Division of labour (by design):
//   • deterministic code (this file) owns ALL arithmetic — LLMs are unreliable
//     at math, so they never touch a sum here.
//   • the offline AI layer (Stage 3) will parse ability `desc` templates into
//     exact formulas (conditional, multi-hit, %-max-HP, shred) and feed better
//     `perCast` figures back in. Until then we read the headline damage
//     variable with the documented heuristic below.
// ---------------------------------------------------------------------------

// ---- tuning constants (TFT-wide, documented) ------------------------------

/** HP and Attack Damage multiply by this per star level (1★→2★→3★). Other
 *  stats (AS, armor, MR, crit, mana, range) do not scale with stars. */
export const STAR_MULTIPLIER = 1.8;
/** Mana gained per auto-attack (TFT standard). Damage-taken mana is ignored. */
export const MANA_PER_ATTACK = 10;
/** Steady-state cast-rate ceiling. Cast animation + mana fill mean no unit
 *  actually casts faster than ~once a second; this also neutralizes data
 *  artifacts (e.g. a 5-mana ability that would otherwise cast 1.5×/s). */
export const MAX_CASTS_PER_SEC = 1.0;

/** The load-bearing simplifications, shown verbatim in the UI. */
export const ASSUMPTIONS: readonly string[] = [
  'Star scaling: HP and Attack Damage ×1.8 per star; all other stats are flat across stars.',
  'Crit: expected auto-attack multiplier = 1 + critChance × (critMultiplier − 1). Abilities are assumed NOT to crit (no Infinity Edge / Jeweled Gauntlet modeling).',
  'Mana: 10 per auto-attack, mana from taking damage ignored; steady-state casts assume an empty bar (starting mana only speeds the first cast). Cast rate is capped at one per second (animation + fill), which also neutralizes low / artifact mana values.',
  'Ability damage (formula-backed): a unit with a baked Stage-3 formula (src/data/ability-formulas, derived from its ability description offline) uses an EXACT per-cast base — multi-cast cycles averaged (Sona’s big nuke every 5th cast), per-hit × the real hit count (Fiora’s 6 vital strikes, not her 2-attack passive cadence) — with AP/AD scaling, true damage, and DoT-over-duration read from the description instead of guessed from a variable name.',
  'Ability damage (heuristic fallback): without a formula, damage reads the largest matching “Damage” variable at this star, multiplied by the strike count when the ability empowers a fixed number of attacks. Conditionals, %-max-HP, and projectile splits stay approximate until a formula covers that unit.',
  'Ability scaling follows the chosen damage variable’s name: a “…AD…” variable scales as a percent of Attack Damage, a “…AP…” one with ability power (1 + AP⁄100); a neutral name falls back to the unit’s scaling hint. So AD items can’t inflate an AP nuke, nor AP items an AD ability.',
  'Item & trait values come straight from CommunityDragon, where a percent may be stored as a fraction (0.10) or whole points (10); the model normalizes by magnitude. Only clean self-stats — AD, AP, AS, crit, HP, armor, MR — are folded in.',
  'Conditional, stacking, teamwide, shield, healing, and ability-parameter values are listed in the breakdown but NOT folded into the numbers.',
  'No positioning, target selection, cast timing, crowd control, or armor/MR shred is simulated. Treat every figure as a steady-state average for comparison only.',
];

// ---- model output types ---------------------------------------------------

/** A fully-resolved combat stat line (after items + traits are applied). */
export interface StatBlock {
  hp: number;
  armor: number;
  magicResist: number;
  ad: number;
  attackSpeed: number;
  critChance: number;
  critMultiplier: number;
  ap: number; // ability-power POINTS (base 0); ability multiplier = 1 + ap/100
  initialMana: number;
  mana: number; // mana required to cast (the cap)
  range: number;
  damageAmp: number; // outgoing damage multiplier (base 1.0)
}

export type ModifierTarget =
  | 'hp'
  | 'armor'
  | 'magicResist'
  | 'ad'
  | 'attackSpeed'
  | 'critChance'
  | 'critMultiplier'
  | 'ap'
  | 'initialMana'
  | 'damageAmp'
  | 'unmodeled';

/** One item/trait effect and exactly what the model did with it. Every input
 *  effect produces one of these — applied or not — so the math is auditable. */
export interface AppliedModifier {
  source: string; // item or trait display name
  key: string; // raw cdragon effect / variable key
  value: number; // raw value
  target: ModifierTarget;
  applied: string; // human description ("+150 HP", "×1.10 AS", "not modeled")
}

export interface AbilityEstimate {
  name: string;
  scaling: AbilityScaling;
  basisVar: string | null; // which variable the damage was read from
  basisValue: number; // its value at this star
  perCast: number; // estimated damage per cast (after AP/AD scaling + amp)
  dps: number; // perCast × casts per second (or DoT rate, see dotDuration)
  interpretation: string; // how basisValue was turned into perCast
  dotDuration?: number; // set when perCast is a damage-OVER-TIME total spread
  // across this many seconds (a re-applied DoT caps at total/duration), not an
  // instant hit. The caller converts it to a sustained rate instead of × cadence.
  trueDamage?: boolean; // ability deals TRUE damage (ignores resists) — the sim
  // skips mitigation. Set only by a Stage-3 formula; the heuristic never infers it.
}

export interface UnitEvaluation {
  apiName: string;
  name: string;
  cost: number;
  star: number;
  traits: string[];
  base: StatBlock; // intrinsic at this star (no items/traits)
  effective: StatBlock; // after items + traits
  modifiers: AppliedModifier[];
  critFactor: number;
  autoDps: number;
  ability: AbilityEstimate;
  cast: { attacksPerCast: number; secondsPerCast: number; castsPer10s: number };
  totalDps: number;
  ehp: { vsPhysical: number; vsMagic: number; mixed: number };
  assumptions: readonly string[];
}

export interface EvalOptions {
  star?: number;
  items?: ItemMath[];
  traits?: { name: string; tier: TraitTierMath }[];
}

// ---- name joins (comps reference DISPLAY names; math is keyed by apiName) --

const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let _unitByName: Map<string, UnitMath> | null = null;
let _itemByName: Map<string, ItemMath> | null = null;

/** Resolve a unit display name (e.g. "Kai'Sa", "Nunu & Willump") to its math. */
export function resolveUnit(name: string): UnitMath | undefined {
  if (!_unitByName) {
    _unitByName = new Map();
    for (const u of ALL_UNITS) _unitByName.set(normKey(u.name), u);
  }
  return _unitByName.get(normKey(name));
}

/** Resolve an item display name (e.g. "Rabadon's Deathcap") to its math. */
export function resolveItem(name: string): ItemMath | undefined {
  if (!_itemByName) {
    _itemByName = new Map();
    for (const i of ALL_ITEMS) _itemByName.set(normKey(i.name), i);
  }
  return _itemByName.get(normKey(name));
}

// ---- core math ------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const pctLabel = (v: number): string => `${Math.round(v * 100)}%`;
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Intrinsic stats for a unit at a given star, before any items or traits. */
export function baseStatsAtStar(u: UnitMath, star: number): StatBlock {
  const mult = Math.pow(STAR_MULTIPLIER, Math.max(0, star - 1));
  const s = u.stats;
  return {
    hp: s.hp * mult,
    armor: s.armor,
    magicResist: s.magicResist,
    ad: s.damage * mult,
    attackSpeed: s.attackSpeed,
    critChance: s.critChance,
    critMultiplier: s.critMultiplier,
    ap: 0,
    initialMana: s.initialMana,
    mana: s.mana,
    range: s.range,
    damageAmp: 1,
  };
}

// Keys that aren't a clean, unconditional self-stat: stacking, time/condition
// gated, teamwide, shields, healing, or raw ability parameters. We surface them
// in the breakdown but never fold them into the numbers.
const NOISE_RE =
  /per ?stack|per ?cast|per ?attack|per ?second|per ?combat|per ?kill|per ?loss|per ?death|per ?round|per ?enemy|per ?interval|teamwide|enhanced|threshold|duration|interval|regen|restore|tospend|breakpoint|instances|numattacks|numseconds|tickrate|maxheal|missing|lifesteal|omnivamp|shield|sizeincrease|backline|frontline|statmultiplier|notstatbar|healtick|manaperc|percentmaxhp|maxhp|percenthealthdamage|aoedamage|icd/i;

/** Map a raw cdragon effect/variable key to the stat it moves (or 'unmodeled'). */
function targetForKey(raw: string): ModifierTarget {
  if (NOISE_RE.test(raw)) return 'unmodeled';
  const k = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (k.includes('critchance') || k === 'crit') return 'critChance';
  if (k.includes('critdamage') || k.includes('critmult')) return 'critMultiplier';
  if (k.includes('attackspeed') || k === 'as') return 'attackSpeed';
  if (k.includes('attackdamage') || k === 'ad' || k.includes('bonusad') || k.includes('percentad')) return 'ad';
  if (k.includes('abilitypower') || k === 'ap' || k.includes('bonusap')) return 'ap';
  if (k.includes('magicresist') || k === 'mr' || k.endsWith('mr') || k.includes('spellblock')) return 'magicResist';
  if (k.includes('armor')) return 'armor';
  if (k.includes('health') || k === 'hp' || k.endsWith('hp')) return 'hp';
  if (k.includes('damageamp') || k.includes('damageamplification')) return 'damageAmp';
  if (k === 'mana' || k.includes('startingmana') || k.includes('bonusmana')) return 'initialMana';
  return 'unmodeled';
}

/** Normalize a percent that cdragon may store as a fraction (0.10) or whole
 *  points (10) into a fraction. Exported so the Stage-1.5 simulation reuses the
 *  exact same magnitude heuristic (e.g. AttackSpeedPerStack 7 ⇒ +7%). */
export const asFraction = (v: number): number => (Math.abs(v) >= 1 ? v / 100 : v);

/** Fold one effect bag (an item's effects, or a trait tier's variables) into
 *  `eff`, pushing an auditable AppliedModifier for every key. Flat-vs-percent
 *  is disambiguated by magnitude (documented in ASSUMPTIONS). */
function applyEffects(source: string, effects: Record<string, number>, eff: StatBlock, out: AppliedModifier[]): void {
  for (const [key, value] of Object.entries(effects)) {
    if (!Number.isFinite(value)) continue;
    let target = targetForKey(key);
    let applied = 'not modeled';
    switch (target) {
      case 'hp':
        // Items grant flat HP (100..500); traits grant a fraction (0.25 = +25%).
        if (Math.abs(value) >= 5) {
          eff.hp += value;
          applied = `+${r1(value)} HP`;
        } else {
          eff.hp *= 1 + value;
          applied = `+${pctLabel(value)} HP`;
        }
        break;
      case 'armor':
        if (value < 1) {
          eff.armor *= 1 + value;
          applied = `+${pctLabel(value)} Armor`;
        } else {
          eff.armor += value;
          applied = `+${r1(value)} Armor`;
        }
        break;
      case 'magicResist':
        if (value < 1) {
          eff.magicResist *= 1 + value;
          applied = `+${pctLabel(value)} MR`;
        } else {
          eff.magicResist += value;
          applied = `+${r1(value)} MR`;
        }
        break;
      case 'ad':
        // AD bonuses are a percent (0.15..0.7); large values are flat points.
        if (value < 3) {
          eff.ad *= 1 + value;
          applied = `+${pctLabel(value)} AD`;
        } else {
          eff.ad += value;
          applied = `+${r1(value)} AD`;
        }
        break;
      case 'attackSpeed': {
        const f = asFraction(value); // 10 ⇒ +10%, 0.1 ⇒ +10%
        eff.attackSpeed *= 1 + f;
        applied = `+${pctLabel(f)} AS`;
        break;
      }
      case 'critChance': {
        const f = asFraction(value); // 35 ⇒ +35%
        eff.critChance = clamp(eff.critChance + f, 0, 1);
        applied = `+${pctLabel(f)} crit`;
        break;
      }
      case 'critMultiplier': {
        const f = asFraction(value);
        eff.critMultiplier += f;
        applied = `+${pctLabel(f)} crit dmg`;
        break;
      }
      case 'ap':
        if (value < 1) {
          target = 'unmodeled'; // a sub-1 "AP" is a ratio, not flat ability power
          break;
        }
        eff.ap += value;
        applied = `+${r1(value)} AP`;
        break;
      case 'initialMana':
        if (value < 1) {
          target = 'unmodeled';
          break;
        }
        eff.initialMana += value;
        applied = `+${r1(value)} starting mana`;
        break;
      case 'damageAmp': {
        const f = asFraction(value);
        eff.damageAmp *= 1 + f;
        applied = `+${pctLabel(f)} damage`;
        break;
      }
      default:
        applied = 'not modeled';
    }
    out.push({ source, key, value, target, applied });
  }
}

const lastFinite = (arr: number[]): number => {
  for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i];
  return 0;
};

/** Read a variable's value at a star, guarding cdragon's ragged arrays.
 *  Exported for the simulation's proc-cast (0-mana) cadence read. */
export function valueAtStar(value: number[], star: number): number {
  if (Number.isFinite(value[star])) return value[star];
  if (Number.isFinite(value[2])) return value[2];
  return lastFinite(value);
}

const isDamageVar = (n: string): boolean =>
  /damage|dmg/i.test(n) && !/percent|reduc|shred|sunder|taken|heal|shield|per ?stack|per ?second/i.test(n);

// An empowered-attack multiplier. Abilities like Jhin's Curtain Call (4 shots),
// Xayah's feathers (6), Diana's cleaves (3) or Fiora's vitals (2) store the
// PER-HIT damage plus a separate strike count; the headline-damage heuristic
// reads a single hit, so without this it badly under-rates every multi-hit
// attack carry — the exact carries that get buried under one-big-nuke casters.
// Restricted to count variables that unambiguously mean "the unit strikes this
// many times" — NOT channel ticks, projectiles that split across enemies, or
// utility counters like "casts to expand". Clamped to a sane range so a data
// artifact can't explode a unit.
const HIT_COUNT_RE = /^num(attacks|strikes|activestrikes)$/i;
function hitCount(vars: AbilityVariable[], star: number): { n: number; name: string } | null {
  for (const v of vars) {
    if (!HIT_COUNT_RE.test(v.name)) continue;
    const n = Math.round(valueAtStar(v.value, star));
    if (n >= 2 && n <= 12) return { n, name: v.name };
  }
  return null;
}

/** Scale a per-cast BASE value by AP/AD into raw per-cast damage. Shared by the
 *  name-only heuristic and the Stage-3 formula path so both apply scaling
 *  identically; the caller multiplies in damageAmp afterward. */
function scaleBasis(basisValue: number, mode: AbilityScaling, eff: StatBlock): { perCast: number; how: string } {
  const apMult = 1 + eff.ap / 100;
  switch (mode) {
    case 'AD': {
      const perCast = (basisValue / 100) * eff.ad;
      return { perCast, how: `${basisValue}% of AD (${Math.round(eff.ad)}) = ${Math.round(perCast)}` };
    }
    case 'none':
      return { perCast: basisValue, how: `${basisValue} flat (no AP/AD scaling)` };
    case 'mixed':
      return {
        perCast: basisValue * apMult,
        how: `${basisValue} × ability power ${apMult.toFixed(2)} = ${Math.round(basisValue * apMult)} (mixed; AD portion not separated)`,
      };
    default: // 'AP'
      return { perCast: basisValue * apMult, how: `${basisValue} × ability power ${apMult.toFixed(2)} = ${Math.round(basisValue * apMult)}` };
  }
}

/** Stage-3 path: a baked formula supplies the exact per-cast base, its scaling,
 *  and any DoT/true-damage flags. We just scale + amp it; the multi-cast cycle,
 *  hit count, and over-time spread are already folded into perCastBase offline. */
function abilityFromFormula(u: UnitMath, star: number, eff: StatBlock, f: AbilityFormula): AbilityEstimate {
  const basisValue = valueAtStar(f.perCastBase, star);
  const { perCast: scaled, how } = scaleBasis(basisValue, f.scaling, eff);
  const perCast = scaled * eff.damageAmp;
  let interpretation = `formula ${f.expression} = ${Math.round(basisValue)} base; ${how}`;
  if (f.dotDuration) interpretation += `, spread over ${f.dotDuration}s (DoT)`;
  if (f.trueDamage) interpretation += ', true damage';
  interpretation += ` — ${f.rationale}`;
  return {
    name: u.ability.name,
    scaling: f.scaling,
    basisVar: f.expression,
    basisValue,
    perCast,
    dps: 0,
    interpretation,
    dotDuration: f.dotDuration,
    trueDamage: f.trueDamage,
  };
}

/** Estimate ability damage per cast from the raw variables. Heuristic — see
 *  ASSUMPTIONS. Returns 0 (utility) when no damage variable is found. */
function estimateAbility(u: UnitMath, star: number, eff: StatBlock): AbilityEstimate {
  const vars = u.ability.variables;

  // Stage 3: a baked formula pins the exact per-cast base (multi-cast cycles
  // averaged, per-hit × hit count, true damage flagged) the name-only heuristic
  // below can't infer. Prefer it; it reuses the same AP/AD scaling + damageAmp
  // so items and traits still flow through unchanged.
  const formula = abilityFormula(u.apiName);
  if (formula) return abilityFromFormula(u, star, eff, formula);

  let cands = vars.filter((v) => isDamageVar(v.name));
  if (!cands.length) {
    const re = u.ability.scaling === 'AD' ? /ad$|physical/i : /ap$|magic/i;
    cands = vars.filter((v) => re.test(v.name));
  }
  const scaling = u.ability.scaling;
  const blank: AbilityEstimate = {
    name: u.ability.name,
    scaling,
    basisVar: null,
    basisValue: 0,
    perCast: 0,
    dps: 0,
    interpretation: 'no damage variable found — treated as utility / non-damaging',
  };
  if (!cands.length) return blank;

  // Headline damage = the largest candidate at this star.
  const chosen = cands.reduce((a, b) => (valueAtStar(b.value, star) > valueAtStar(a.value, star) ? b : a));
  const basisValue = valueAtStar(chosen.value, star);

  // Resolve scaling from the CHOSEN variable's name first (a "…AD…" damage var
  // scales with AD, a "…AP…" one with AP), falling back to the unit's coarse
  // scaling hint when the name is neutral (e.g. "SlamDamage"). This stops an AD
  // ability from being inflated by AP items (and vice-versa).
  const nm = chosen.name.toLowerCase();
  const adHit = /(^|damage)ad|ad(damage|$)|physical/.test(nm);
  const apHit = /(^|damage)ap|ap(damage|$)|magic/.test(nm);
  let mode: AbilityScaling = scaling;
  if (adHit && !apHit) mode = 'AD';
  else if (apHit && !adHit) mode = 'AP';

  // Same AP/AD scaling the Stage-3 formula path uses, so the two never drift.
  const scaled = scaleBasis(basisValue, mode, eff);
  let perCast = scaled.perCast;
  let interpretation = scaled.how;
  perCast *= eff.damageAmp;

  // Multi-hit: if the ability empowers a fixed number of strikes, the value we
  // just scaled is ONE hit — multiply by the strike count for the real per-cast.
  const hits = hitCount(vars, star);
  if (hits) {
    perCast *= hits.n;
    interpretation += ` × ${hits.n} hits (${hits.name})`;
  }

  // Damage-over-time: a "…Bleed/Burn/Poison…" total paired with a long duration
  // (Talon's 18s bleed) is spread across that window, not dealt instantly. Flag
  // the duration so the caller turns it into a sustained rate; otherwise the
  // largest-variable heuristic reads a multi-second total as one nuke.
  let dotDuration: number | undefined;
  if (/bleed|burn|poison/i.test(chosen.name)) {
    const durVar =
      vars.find((v) => /duration/i.test(v.name) && /bleed|burn|poison/i.test(v.name)) ??
      vars.find((v) => /duration/i.test(v.name));
    const d = durVar ? valueAtStar(durVar.value, star) : 0;
    if (d >= 3) {
      dotDuration = d;
      interpretation += `, spread over ${d}s (DoT)`;
    }
  }

  return { name: u.ability.name, scaling, basisVar: chosen.name, basisValue, perCast, dps: 0, interpretation, dotDuration };
}

/** How often the ability goes off. Mana-cast units fill their bar from autos
 *  (10 mana/attack). The handful of 0-mana units cast on an attack-proc roll
 *  (e.g. Caitlyn's 15% "Aim For The Head"), so cadence = attack speed × proc. */
function castCadence(
  unit: UnitMath,
  eff: StatBlock,
  star: number,
): { attacksPerCast: number; secondsPerCast: number; castsPerSecond: number } {
  let attacksPerCast = 0;
  let secondsPerCast = 0;
  let castsPerSecond = 0;
  if (eff.mana > 0) {
    attacksPerCast = eff.mana / MANA_PER_ATTACK;
    secondsPerCast = eff.attackSpeed > 0 ? attacksPerCast / eff.attackSpeed : 0;
    castsPerSecond = secondsPerCast > 0 ? 1 / secondsPerCast : 0;
  } else {
    const proc = unit.ability.variables.find((v) => /proc|chance/i.test(v.name));
    if (proc) {
      const pf = clamp(asFraction(valueAtStar(proc.value, star)), 0, 1); // 15 ⇒ 0.15
      castsPerSecond = eff.attackSpeed * pf;
      attacksPerCast = pf > 0 ? 1 / pf : 0;
      secondsPerCast = castsPerSecond > 0 ? 1 / castsPerSecond : 0;
    }
  }
  // Cast-time lockout: clamp to a realistic ceiling so a low / artifact mana
  // value can't imply many casts per second (see MAX_CASTS_PER_SEC).
  if (castsPerSecond > MAX_CASTS_PER_SEC) {
    castsPerSecond = MAX_CASTS_PER_SEC;
    secondsPerCast = 1 / MAX_CASTS_PER_SEC;
    attacksPerCast = secondsPerCast * eff.attackSpeed;
  }
  return { attacksPerCast, secondsPerCast, castsPerSecond };
}

/** Evaluate one unit: base → effective (items + traits) → DPS / EHP / cadence. */
export function evaluateUnit(unit: UnitMath, opts: EvalOptions = {}): UnitEvaluation {
  const star = opts.star ?? 2;
  const base = baseStatsAtStar(unit, star);
  const eff: StatBlock = { ...base };
  const modifiers: AppliedModifier[] = [];

  for (const item of opts.items ?? []) applyEffects(item.name, item.effects, eff, modifiers);
  for (const t of opts.traits ?? []) applyEffects(t.name, t.tier.variables, eff, modifiers);

  const critFactor = 1 + clamp(eff.critChance, 0, 1) * (eff.critMultiplier - 1);
  const autoDps = eff.ad * eff.attackSpeed * critFactor * eff.damageAmp;

  const { attacksPerCast, secondsPerCast, castsPerSecond } = castCadence(unit, eff, star);

  const ability = estimateAbility(unit, star, eff);
  if (castsPerSecond <= 0) {
    ability.dps = 0;
  } else if (ability.dotDuration) {
    // A re-applied DoT is always running; its DPS caps at total/duration, and if
    // you cast slower than it expires, at total/castInterval. Either way it's
    // total / max(duration, secondsPerCast) — independent of how the average
    // would otherwise multiply a per-cast nuke by cadence.
    ability.dps = ability.perCast / Math.max(ability.dotDuration, secondsPerCast);
  } else {
    ability.dps = ability.perCast * castsPerSecond;
  }

  return {
    apiName: unit.apiName,
    name: unit.name,
    cost: unit.cost,
    star,
    traits: unit.traits,
    base,
    effective: eff,
    modifiers,
    critFactor,
    autoDps,
    ability,
    cast: { attacksPerCast, secondsPerCast, castsPer10s: castsPerSecond * 10 },
    totalDps: autoDps + ability.dps,
    ehp: {
      vsPhysical: eff.hp * (1 + eff.armor / 100),
      vsMagic: eff.hp * (1 + eff.magicResist / 100),
      mixed: eff.hp * (1 + (eff.armor + eff.magicResist) / 200),
    },
    assumptions: ASSUMPTIONS,
  };
}

// ---- comp-aware helpers (trait breakpoints from the comp's roster) ---------

/** Highest trait tier whose minUnits ≤ count, or null if none reached. */
function bestTier(tiers: TraitTierMath[], count: number): TraitTierMath | null {
  let best: TraitTierMath | null = null;
  for (const t of tiers) if (count >= t.minUnits && (!best || t.minUnits > best.minUnits)) best = t;
  return best;
}

export interface ActiveTrait {
  name: string;
  count: number;
  tier: TraitTierMath;
}

/** Count traits across a comp's roster and return the active breakpoint tiers. */
export function activeTraitTiers(unitNames: string[]): ActiveTrait[] {
  const counts = new Map<string, number>();
  for (const n of unitNames) {
    const u = resolveUnit(n);
    if (!u) continue;
    for (const t of u.traits) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const out: ActiveTrait[] = [];
  for (const [name, count] of counts) {
    const tm = TRAIT_MATH[name];
    if (!tm) continue;
    const tier = bestTier(tm.tiers, count);
    if (tier) out.push({ name, count, tier });
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface CarryEvaluation {
  evaluation: UnitEvaluation;
  matchedItems: string[]; // carry items found in the math data + applied
  unmatchedItems: string[]; // carry items with no math entry (not applied)
  activeTraits: { name: string; count: number }[]; // this carry's active traits
}

/** Evaluate a comp's carry with its recommended items and the comp's active
 *  trait breakpoints folded in. Returns null if the unit isn't in the math
 *  data (e.g. a summoned / non-playable token). */
export function evaluateCompCarry(comp: Comp, carry: Carry, star?: number): CarryEvaluation | null {
  const unit = resolveUnit(carry.name);
  if (!unit) return null;

  const matchedItems: string[] = [];
  const unmatchedItems: string[] = [];
  const items: ItemMath[] = [];
  for (const name of carry.items) {
    const im = resolveItem(name);
    if (im) {
      items.push(im);
      matchedItems.push(name);
    } else {
      unmatchedItems.push(name);
    }
  }

  const unitTraits = new Set(unit.traits);
  const active = activeTraitTiers(comp.units).filter((t) => unitTraits.has(t.name));
  const traits = active.map((t) => ({ name: t.name, tier: t.tier }));

  // Reroll comps 3-star their carries; everything else evaluates at 2★.
  const resolvedStar = star ?? (comp.tempo === 'reroll' ? 3 : 2);
  const evaluation = evaluateUnit(unit, { star: resolvedStar, items, traits });

  return { evaluation, matchedItems, unmatchedItems, activeTraits: active.map((t) => ({ name: t.name, count: t.count })) };
}
