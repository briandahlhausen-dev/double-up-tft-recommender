import type { ItemMath, TraitTierMath, UnitMath } from '../types';
import {
  MANA_PER_ATTACK,
  MAX_CASTS_PER_SEC,
  asFraction,
  evaluateUnit,
  resolveItem,
  resolveUnit,
  valueAtStar,
} from './combat-model';
import type { StatBlock } from './combat-model';

// ---------------------------------------------------------------------------
// STAGE 1.5 · 1v1 CARRY COMBAT SIMULATION (tick / discrete-event, Monte Carlo)
//
// The closed-form combat model (combat-model.ts) computes a STEADY-STATE
// average: `autoDps + abilityDps`, with ability cadence read from mana and
// CAPPED at one cast/second. That average is fine for bodies, but it is blind to
// three things the real game turns on, and which together decide whether a unit
// is a true carry or just a high-base-stat dummy:
//
//   1. RAMP. On-hit stacking items (Guinsoo's +7% AS per attack, Kraken's +3.5%
//      AD per attack) make an auto-attacker's DPS climb over the round. The
//      closed-form uses turn-1 stats, so it systematically UNDER-rates the
//      sustained auto/proc carries that actually define the meta.
//   2. FINITE ROUNDS + mana fill. A nuker must fill its bar from autos before
//      the first cast; in a real ~15s fight it gets far fewer casts than an
//      infinite steady-state implies. The closed-form smears one big burst into
//      a smooth per-second figure, OVER-rating AP nukes (the Sona problem).
//   3. ABILITY CRIT + mitigation. Infinity Edge / Jeweled Gauntlet let abilities
//      crit (the closed-form explicitly assumes they can't); armor/MR and Last
//      Whisper's sunder change what actually lands. None of that is in the
//      average.
//
// So this is a discrete-event simulation: step auto-by-auto, gain 10 mana per
// hit, cast when the bar is full, roll crits against a seeded PRNG, ramp the
// stacking procs, and mitigate against a training dummy — then Monte-Carlo it
// over N iterations and average. Deterministic (seeded) so it satisfies the
// project's "heavy compute offline, deterministic math" rule: it runs the same
// in CI and the browser, and is meant to RE-RANK the top boards the beam search
// proposes, not to replace the cheap closed-form pass.
//
// It deliberately reuses combat-model: `evaluateUnit` resolves the effective
// StatBlock (items + traits folded in) and the per-cast ability damage, so the
// sim and the average agree on every stat and diverge ONLY on the three axes
// above. What it adds on top is read straight from the raw item effect keys.
// ---------------------------------------------------------------------------

/** TFT hard cap on attack speed (Guinsoo can ramp past it; the game can't). */
export const ATTACK_SPEED_CAP = 5.0;
/** Minimum seconds between casts — the real-time twin of the closed-form's
 *  MAX_CASTS_PER_SEC. A cast animation locks the unit for ~a second, and this
 *  also neutralizes artifact-low mana values (e.g. a 5-mana ability) exactly
 *  as the average's cap does, so the two engines stay comparable. */
export const MIN_CAST_INTERVAL = 1 / MAX_CASTS_PER_SEC;
/** Default round length. TFT's timer is 30s but most fights resolve in 8-15s;
 *  15 is a fair window — long enough for ramp to matter, short enough that a
 *  slow nuker can't pretend it casts forever. */
export const DEFAULT_SECONDS = 15;
/** Monte-Carlo iterations. Crit is the only RNG today, so this converges fast;
 *  the headroom is for future proc-chance RNG (procs, dodge, CC). */
export const DEFAULT_ITERATIONS = 256;
/** Fixed default seed → reproducible results (static/deterministic rule). */
export const DEFAULT_SEED = 0x9e3779b9;
/** A generic mid-game target. Modest resists so mitigation is real (~23%) but
 *  doesn't swamp the comparison; both armor and MR equal so a magic nuke and a
 *  physical auto are mitigated alike (Last Whisper's sunder then tilts it). */
export const DEFAULT_DUMMY: SimDummy = { armor: 30, magicResist: 30 };

export interface SimDummy {
  armor: number;
  magicResist: number;
}

export interface SimOptions {
  star?: number;
  items?: ItemMath[];
  traits?: { name: string; tier: TraitTierMath }[];
  seconds?: number;
  iterations?: number;
  seed?: number;
  dummy?: Partial<SimDummy>;
}

export interface SimResult {
  /** Total damage / round length, averaged over the Monte-Carlo iterations. */
  dps: number;
  autoDps: number;
  abilityDps: number;
  totalDamage: number; // average damage dealt in the window
  autos: number; // average auto-attacks landed
  casts: number; // average ability casts
  seconds: number;
  iterations: number;
  // Diagnostics that expose the ramp the closed-form can't see:
  endAttackSpeed: number; // average AS at the end of the round (Guinsoo ramp)
  endAttackDamage: number; // average AD at the end of the round (Kraken ramp)
}

// ---- seeded PRNG (mulberry32) ----------------------------------------------
// Tiny, fast, well-distributed 32-bit generator. A fixed seed makes every run
// byte-identical, which is what lets this offline sim bake reproducible numbers.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// ---- item procs the closed-form can't fold ---------------------------------
//
// evaluateUnit already folds every clean self-stat (AD, AP, AS, crit, HP) into
// the effective StatBlock. What it leaves on the table — by design — are the
// time/stack/condition-gated effects. Those are exactly what separates carries,
// so the sim reads them straight off the raw effect keys here.

interface Procs {
  manaOnHit: number; // bonus mana per auto (Nashor BaseManaOnHit)
  manaOnCrit: number; // extra mana when an auto crits (Nashor ManaOnCrit)
  guinsooAS: number; // +AS fraction per auto, unbounded (Guinsoo AttackSpeedPerStack)
  krakenAD: number; // +AD fraction per auto (Kraken ADOnAttack)
  krakenMax: number; // Kraken stack cap (MaxStacks)
  krakenCapstoneAS: number; // one-off +AS fraction once Kraken is maxed (ASCapstone)
  bonusDamage: number; // additive outgoing damage amp not folded into damageAmp
  abilityCanCrit: boolean; // Infinity Edge / Jeweled Gauntlet let the ability crit
  armorShred: number; // fraction of the target's armor removed (Last Whisper)
}

const EMPTY_PROCS: Procs = {
  manaOnHit: 0,
  manaOnCrit: 0,
  guinsooAS: 0,
  krakenAD: 0,
  krakenMax: 0,
  krakenCapstoneAS: 0,
  bonusDamage: 0,
  abilityCanCrit: false,
  armorShred: 0,
};

/** Pull the proc-relevant fields out of a build's items. Keys match cdragon's
 *  raw effect names (see src/data/unit-math.ts); magnitudes are normalized with
 *  the same asFraction heuristic the combat model uses. */
function extractProcs(items: ItemMath[]): Procs {
  const p: Procs = { ...EMPTY_PROCS };
  for (const it of items) {
    const e = it.effects;
    if (Number.isFinite(e.AttackSpeedPerStack)) p.guinsooAS += asFraction(e.AttackSpeedPerStack);
    if (Number.isFinite(e.ADOnAttack)) {
      p.krakenAD += e.ADOnAttack; // already a fraction (0.035)
      p.krakenMax = Math.max(p.krakenMax, Number.isFinite(e.MaxStacks) ? e.MaxStacks : 15);
      if (Number.isFinite(e.ASCapstone)) p.krakenCapstoneAS += e.ASCapstone;
    }
    if (Number.isFinite(e.BaseManaOnHit)) p.manaOnHit += e.BaseManaOnHit;
    if (Number.isFinite(e.ManaOnCrit)) p.manaOnCrit += e.ManaOnCrit;
    if (Number.isFinite(e.BonusDamage)) p.bonusDamage += asFraction(e.BonusDamage);
    if (Number.isFinite(e.ArmorReductionPercent)) p.armorShred = Math.max(p.armorShred, asFraction(e.ArmorReductionPercent));
    // Infinity Edge & Jeweled Gauntlet are the two crit-converters in TFT.
    if (/InfinityEdge|JeweledGauntlet/i.test(it.apiName)) p.abilityCanCrit = true;
  }
  return p;
}

// ---- the round -------------------------------------------------------------

/** Outgoing damage multiplier from a resistance (TFT's standard armor/MR curve;
 *  negative resist would amplify, but shred only ever reduces toward 0 here). */
const mitigation = (resist: number): number => 100 / (100 + Math.max(0, resist));

interface RoundInputs {
  eff: StatBlock;
  perCast: number; // ability damage per cast (post AP scaling + damageAmp), pre crit
  abilityIsPhysical: boolean; // armor- vs MR-mitigated
  abilityIsTrue: boolean; // true damage ⇒ no mitigation at all (overrides physical/magic)
  manaCost: number; // eff.mana; 0 ⇒ proc-cast unit
  procChance: number; // per-auto cast chance for 0-mana units
  dotDuration: number; // >0 ⇒ perCast is a DoT total spread over this many seconds
  procs: Procs;
  seconds: number;
  dummy: SimDummy;
}

interface RoundResult {
  total: number;
  auto: number;
  abil: number;
  autos: number;
  casts: number;
  endAS: number;
  endAD: number;
}

/** One full combat round with one PRNG draw stream. */
function simulateRound(inp: RoundInputs, rng: () => number): RoundResult {
  const { eff, perCast, abilityIsPhysical, abilityIsTrue, manaCost, procChance, dotDuration, procs, seconds, dummy } = inp;

  // Mitigation is constant across the round, so fold it once. The DoT trickle
  // uses an expected-value crit (a continuous effect isn't a single gamble);
  // an instant nuke still rolls crit per cast below.
  const physMit = mitigation(dummy.armor * (1 - procs.armorShred));
  const abilMit = abilityIsTrue ? 1 : abilityIsPhysical ? physMit : mitigation(dummy.magicResist);
  const abilCritEV = procs.abilityCanCrit ? 1 + eff.critChance * (eff.critMultiplier - 1) : 1;

  let t = 0;
  let lastT = 0; // last event time, for accruing the DoT trickle between autos
  let mana = eff.initialMana;
  let lastCast = -Infinity;
  let guinsooStacks = 0;
  let krakenStacks = 0;

  let total = 0;
  let auto = 0;
  let abil = 0;
  let autos = 0;
  let casts = 0;
  let curAS = eff.attackSpeed;
  let curAD = eff.ad;
  let dotDps = 0; // active DoT damage/sec (0 ⇒ none); (re)set on a DoT cast
  let dotEnd = 0; // time the active DoT expires

  // Accrue the DoT trickle over [lastT, min(upto, dotEnd)], then advance lastT.
  const accrueDot = (upto: number): void => {
    if (dotDps > 0) {
      const end = Math.min(upto, dotEnd);
      if (end > lastT) {
        const d = dotDps * (end - lastT);
        abil += d;
        total += d;
      }
    }
    lastT = upto;
  };

  // Guard against a pathological zero-AS unit looping forever.
  for (let guard = 0; guard < 100_000; guard++) {
    const krakenMaxed = procs.krakenMax > 0 && krakenStacks >= procs.krakenMax;
    curAS = Math.min(
      ATTACK_SPEED_CAP,
      eff.attackSpeed * (1 + procs.guinsooAS * guinsooStacks + (krakenMaxed ? procs.krakenCapstoneAS : 0)),
    );
    if (curAS <= 0) break;
    const interval = 1 / curAS;
    if (t + interval > seconds) break; // no more full autos fit in the window
    t += interval;
    autos++;

    accrueDot(t); // bank the DoT trickle that elapsed since the last auto

    // --- auto-attack (physical → mitigated by the dummy's shred-reduced armor)
    curAD = eff.ad * (1 + procs.krakenAD * krakenStacks);
    const autoCrit = rng() < eff.critChance;
    let hit = curAD * (autoCrit ? eff.critMultiplier : 1) * eff.damageAmp * (1 + procs.bonusDamage);
    hit *= physMit;
    auto += hit;
    total += hit;

    // --- on-hit ramps + mana gain
    guinsooStacks++;
    if (krakenStacks < procs.krakenMax) krakenStacks++;
    mana += MANA_PER_ATTACK + procs.manaOnHit + (autoCrit ? procs.manaOnCrit : 0);

    // --- cast when the bar is full and the cast lockout has elapsed
    const ready = t - lastCast >= MIN_CAST_INTERVAL;
    const willCast = ready && (manaCost > 0 ? mana >= manaCost : procChance > 0 && rng() < procChance);
    if (willCast) {
      casts++;
      if (manaCost > 0) mana = 0; // overflow is lost (TFT resets to 0)
      lastCast = t;
      if (dotDuration > 0) {
        // DoT: perCast is the TOTAL over dotDuration, so (re)apply it as a
        // per-second trickle and refresh the expiry. It accrues over time (in
        // the loop and the tail below), never as a lump — so faster recasts
        // can't inflate it past total/duration, and slower ones decay toward
        // total/castInterval. This is the steady cap the closed-form also uses.
        dotDps = (perCast * (1 + procs.bonusDamage) * abilCritEV * abilMit) / dotDuration;
        dotEnd = t + dotDuration;
      } else {
        // Instant nuke — lands in full, rolling crit this cast if enabled.
        let dmg = perCast * (1 + procs.bonusDamage);
        if (procs.abilityCanCrit) dmg *= rng() < eff.critChance ? eff.critMultiplier : 1;
        dmg *= abilMit;
        abil += dmg;
        total += dmg;
      }
    }
  }

  accrueDot(seconds); // bank the DoT tail between the last auto and round end

  return { total, auto, abil, autos, casts, endAS: curAS, endAD: curAD };
}

// ---- public entry point ----------------------------------------------------

/** Simulate a carry against a training dummy and return Monte-Carlo-averaged
 *  DPS, with the auto/ability split and the end-of-round ramp. Reuses
 *  evaluateUnit to resolve the effective stat line + per-cast ability damage, so
 *  it agrees with the closed-form on every stat and differs only on cadence,
 *  ramp, ability-crit, and mitigation. */
export function simulateCarry(unit: UnitMath, opts: SimOptions = {}): SimResult {
  const star = opts.star ?? 2;
  const items = opts.items ?? [];
  const seconds = opts.seconds ?? DEFAULT_SECONDS;
  const iterations = Math.max(1, opts.iterations ?? DEFAULT_ITERATIONS);
  const dummy: SimDummy = { ...DEFAULT_DUMMY, ...opts.dummy };

  // One closed-form pass gives us the resolved StatBlock and the per-cast
  // ability damage (already AP/AD-scaled + damageAmp'd); the sim layers cadence,
  // ramp, crit RNG and mitigation on top.
  const e = evaluateUnit(unit, { star, items, traits: opts.traits });
  const eff = e.effective;
  const perCast = e.ability.perCast;
  const abilityIsPhysical = e.ability.scaling === 'AD';
  const abilityIsTrue = e.ability.trueDamage ?? false; // skips mitigation entirely
  const dotDuration = e.ability.dotDuration ?? 0; // >0 ⇒ perCast is a DoT total
  const procs = extractProcs(items);

  // 0-mana units cast on an attack-proc roll (e.g. Caitlyn's "Aim For The Head").
  let procChance = 0;
  if (eff.mana <= 0) {
    const proc = unit.ability.variables.find((v) => /proc|chance/i.test(v.name));
    if (proc) procChance = clamp(asFraction(valueAtStar(proc.value, star)), 0, 1);
  }

  const inp: RoundInputs = { eff, perCast, abilityIsPhysical, abilityIsTrue, manaCost: eff.mana, procChance, dotDuration, procs, seconds, dummy };
  const rng = mulberry32(opts.seed ?? DEFAULT_SEED);

  let total = 0;
  let auto = 0;
  let abil = 0;
  let autos = 0;
  let casts = 0;
  let endAS = 0;
  let endAD = 0;
  for (let i = 0; i < iterations; i++) {
    const r = simulateRound(inp, rng);
    total += r.total;
    auto += r.auto;
    abil += r.abil;
    autos += r.autos;
    casts += r.casts;
    endAS += r.endAS;
    endAD += r.endAD;
  }

  const inv = 1 / iterations;
  return {
    dps: (total * inv) / seconds,
    autoDps: (auto * inv) / seconds,
    abilityDps: (abil * inv) / seconds,
    totalDamage: total * inv,
    autos: autos * inv,
    casts: casts * inv,
    seconds,
    iterations,
    endAttackSpeed: endAS * inv,
    endAttackDamage: endAD * inv,
  };
}

/** Convenience: resolve a unit display name and simulate it. Returns null if
 *  the name isn't in the math data. Item names in opts.items still take ItemMath
 *  (resolve them with resolveItem first); this only resolves the unit. */
export function simulateCarryByName(name: string, opts: SimOptions = {}): SimResult | null {
  const u = resolveUnit(name);
  if (!u) return null;
  return simulateCarry(u, opts);
}

/** Resolve a list of item display names to ItemMath (dropping unknowns), so
 *  callers can pass the same display-name builds the theorycraft layer uses. */
export function resolveItems(names: string[]): ItemMath[] {
  return names.map((n) => resolveItem(n)).filter((x): x is ItemMath => Boolean(x));
}
