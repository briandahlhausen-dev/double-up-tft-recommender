import { spawn } from 'node:child_process';
import { ALL_UNITS } from '../src/data/unit-math';
import type { AbilityFormula, AbilityScaling, UnitMath } from '../src/types';
import { evaluatePerStar, validateFormula } from './lib/formula-eval';
import { writeAbilityFormulasFile } from './lib/write-ability-formulas';

// ---------------------------------------------------------------------------
// Stage 3 of the theorycraft engine: turn each unit's raw ability DESCRIPTION
// into an exact per-cast base-damage formula, baked into src/data so the
// runtime stays 100% static. The name-only heuristic in combat-model can't tell
// a "big nuke every 5th cast" (Sona) from a single hit, or a 6-strike active
// (Fiora) from its 2-attack passive cadence — the description can.
//
// Three sources, all OFFLINE — the runtime only ever reads the baked numbers:
//   • MANUAL_FORMULAS    — hand-verified seed, read straight from the tooltip.
//   • AUTHORED_FORMULAS  — authored in-session by Claude reading the desc, then
//     committed. Together with the seed these are KEYLESS (local + CI), so the
//     high-confidence coverage needs no auth at all.
//   • Claude pass        — fills in every unit NOT already covered, reading the
//     description and returning the STRUCTURE (an arithmetic expression over the
//     variable names); this script does the ARITHMETIC (evaluates per star). It
//     never overwrites the seed/authored set. Two ways to authenticate it, both
//     offline and never shipped to the client:
//       – Claude subscription via the Claude Code CLI (`claude -p … --output-format
//         json`), authed by CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`). $0
//         against API credits — preferred when that token is present.
//       – Anthropic API via @anthropic-ai/sdk, authed by ANTHROPIC_API_KEY (metered).
//
//   npm run build:formulas                          # manual + authored seed only
//   CLAUDE_CODE_OAUTH_TOKEN=… npm run build:formulas # + Claude (subscription, free)
//   ANTHROPIC_API_KEY=…       npm run build:formulas # + Claude (metered API)
//   USE_CLAUDE_CLI=1          npm run build:formulas # force the CLI (local `claude` login)
// ---------------------------------------------------------------------------

interface Seed {
  ability: string; // expected ability display name (sanity check vs cdragon)
  expression: string; // arithmetic over this ability's variable names
  scaling: AbilityScaling; // which stat the DAMAGE portion scales with
  dotDuration?: number; // >0 ⇒ expression is a total spread over this many seconds
  trueDamage?: boolean; // damage ignores resists
  rationale: string; // one line, grounded in the description
}

// Hand-verified from the cdragon `desc`. Keep this list SMALL and CERTAIN —
// only abilities whose structure the heuristic provably mis-reads and whose
// correct form is unambiguous from the tooltip. Everything else is left to the
// Claude pass (CI) or the heuristic fallback.
const MANUAL_FORMULAS: Record<string, Seed> = {
  // Psionic Crush — "Every @NumCasts@ casts, instead rip off all debris
  // (DebrisRipDamage) … then crush all the debris onto the target (SlamDamage)";
  // the other 4 casts each deal DebrisDamage. Average over the NumCasts cycle.
  // All three damage numbers carry %i:scaleAP%. The heuristic picks SlamDamage
  // (1100 @2★) as one flat nuke — a ~1.8× over-read of the true ~616 average.
  TFT17_Sona: {
    ability: 'Psionic Crush',
    expression: '(4 * DebrisDamage + DebrisRipDamage + SlamDamage) / NumCasts',
    scaling: 'AP',
    rationale:
      'Rip+slam every 5th cast (DebrisRipDamage+SlamDamage); the other 4 deal DebrisDamage — averaged over NumCasts.',
  },
  // Perfect Bladework (Active) — "Reveal @NumVitals@ Vitals on the target and
  // quickly attack them all", each strike dealing VitalDamage true damage with
  // %i:scaleAD%. The unit's coarse scaling reads "mixed" only because the aura
  // HEAL scales AP; the damage is pure AD true. The heuristic multiplies one
  // VitalDamage by the passive's NumAttacks=2 instead of the active's 6 hits.
  TFT17_Fiora: {
    ability: 'Perfect Bladework',
    expression: 'NumVitals * VitalDamage',
    scaling: 'AD',
    trueDamage: true,
    rationale: 'Active strikes all NumVitals vitals, each for VitalDamage true damage (AD); the AP half is only the heal.',
  },
};

// Authored in-session by Claude reading the cdragon `desc` — the same job the
// (key-gated) Claude pass does, but committed so coverage is keyless. Tagged
// source 'claude' (Claude wrote them) with AUTHORED_BY as the model. main() adds
// these to `covered`, so a later keyed run only TOPS UP units not listed here and
// overwrites none of them. Each entry fixes a structure the largest-variable
// heuristic provably mis-reads: a multi-second channel/bleed read as one nuke, a
// multi-hit volley counted as a single hit, or a second on-target component dropped.
const AUTHORED_BY = 'claude-opus-4.7';

const AUTHORED_FORMULAS: Record<string, Seed> = {
  // Deathbeam channels magic damage each second for Duration seconds. Total over
  // the channel = DamagePerSecond × Duration; the heuristic reads the per-second
  // number as a single instant hit.
  TFT17_AurelionSol: {
    ability: 'Deathbeam',
    expression: 'DamagePerSecond * Duration',
    scaling: 'AP',
    dotDuration: 3,
    rationale: 'Channel: DamagePerSecond magic damage each second over Duration(3)s — the total spread across the beam.',
  },
  // Throws NumShurikens piercing kunai, each DamageAD to the FIRST enemy hit; vs a
  // single target all of them land on it. The heuristic counts one kunai (~5× low).
  TFT17_Akali: {
    ability: 'Star Strike',
    expression: 'NumShurikens * DamageAD',
    scaling: 'AD',
    rationale: 'NumShurikens kunai, each DamageAD to the first target hit — all land on a lone target.',
  },
  // Saucer deals DamagePerSecond to the target each second for Duration seconds.
  // (The split-between-enemies portion is AoE; ignored for single-target DPS.)
  TFT17_Bard: {
    ability: 'Ultra Friendly Object',
    expression: 'DamagePerSecond * Duration',
    scaling: 'AP',
    dotDuration: 4,
    rationale: 'Saucer hits the target for DamagePerSecond each second over Duration(4)s — the total spread across its lifetime.',
  },
  // BaseMissiles missiles split across the target + nearby enemies (all land on a
  // lone target), each MissileAD, with a ProcChance% mega missile for ProcDamageMult×.
  // Folds the proc in as expected value. Heuristic picks the conditional astronaut
  // MeepDamage (the largest variable).
  TFT17_Corki: {
    ability: 'Asteroid Blaster',
    expression: 'BaseMissiles * MissileAD * (1 + ProcChance / 100 * (ProcDamageMult - 1))',
    scaling: 'AD',
    rationale: 'BaseMissiles missiles at MissileAD each (all land on a lone target), with the ProcChance mega-missile (ProcDamageMult×) folded in as expected value.',
  },
  // Fires a cone of rockets — base BaseBullets, more with Attack Speed — each
  // ADDamage to the first target hit. Uses the base count (AS extras are a bonus);
  // the heuristic counts a single rocket.
  TFT17_Jinx: {
    ability: 'Explosive Attitude',
    expression: 'BaseBullets * ADDamage',
    scaling: 'AD',
    rationale: 'BaseBullets rockets (base count; grows with AS), each ADDamage to the first target — all land on a lone target.',
  },
  // Singularity's Damage is split among the target + closest enemies (a lone target
  // takes it in full), and the target additionally takes SecondaryDamage. Heuristic
  // takes only Damage, dropping the on-target SecondaryDamage.
  TFT17_Karma: {
    ability: 'Singularity',
    expression: 'Damage + SecondaryDamage',
    scaling: 'AP',
    rationale: 'Vs a lone target the full split Damage lands, plus the target-only SecondaryDamage.',
  },
  // Active Psi-State fires a DamageAD projection twice a second for Duration
  // seconds. Total = 2 × Duration × DamageAD. (The every-3rd-attack passive is
  // separate on-hit damage, left to the auto model.)
  TFT17_MasterYi: {
    ability: 'Psi Strikes',
    expression: '2 * Duration * DamageAD',
    scaling: 'AD',
    dotDuration: 5,
    rationale: 'Active Psi-State fires a DamageAD projection twice a second over Duration(5)s — the total spread across the channel.',
  },
  // Stab applies a bleed dealing ADBleedDamage physical over BleedDuration seconds.
  // The ability name has no bleed/burn/poison keyword, so the heuristic reads the
  // full bleed as one instant nuke; spread it over 18s instead.
  TFT17_Talon: {
    ability: "Diviner's Judgment",
    expression: 'ADBleedDamage',
    scaling: 'AD',
    dotDuration: 18,
    rationale: 'Stab applies a bleed for ADBleedDamage physical over BleedDuration(18)s — damage over time, not a burst.',
  },
  // Channels a storm dealing Damage each second for Duration seconds. Total =
  // Damage × Duration; the heuristic reads the per-second number as one hit.
  TFT17_Viktor: {
    ability: 'Psionic Storm',
    expression: 'Damage * Duration',
    scaling: 'AP',
    dotDuration: 4,
    rationale: 'Channel: Damage magic damage each second over Duration(4)s — the total spread across the storm.',
  },
  // Bel'Veth flurries BaseNumSlashes(12, more with AS) slashes at the target, each
  // ADDamage physical. The heuristic reads one slash; multiply by the base count.
  TFT17_Belveth: {
    ability: 'Tidal Slashes',
    expression: 'BaseNumSlashes * ADDamage',
    scaling: 'AD',
    rationale: 'BaseNumSlashes slashes (base count; grows with AS), each ADDamage physical to the target — all land on a lone target.',
  },
  // Blitzcrank uppercuts the target into the disco ball (UppercutDamage) then crashes
  // it down into it (ExplosionDamage); a lone target eats both. Heuristic keeps only the larger.
  TFT17_Blitzcrank: {
    ability: 'Party Crasher',
    expression: 'UppercutDamage + ExplosionDamage',
    scaling: 'AP',
    rationale: 'The knocked-up target takes both UppercutDamage and the ExplosionDamage crash; the heuristic keeps only the larger half.',
  },
  // Collateral Damage's shell deals Damage (physical %i:scaleAD%) to the target. The
  // heuristic reads the neutral name as the unit-wide "mixed" and mis-scales it with AP.
  TFT17_Graves: {
    ability: 'Collateral Damage',
    expression: 'Damage',
    scaling: 'AD',
    rationale: "The shell's on-target Damage is physical %i:scaleAD%; the heuristic mis-reads the neutral name as AP. Same number, correct AD scaling.",
  },
  // Space Opera's NumHands hands each fire on Jhin's next NumAttacks attacks at ADDamage
  // per shot — a 16-shot barrage on his target. Heuristic counts only the 4 attacks.
  TFT17_Jhin: {
    ability: 'Space Opera',
    expression: 'NumHands * NumAttacks * ADDamage',
    scaling: 'AD',
    rationale: 'NumHands spectral hands each fire over NumAttacks attacks (16 shots) at ADDamage on the target; omits the smaller final-shot amp (conservative).',
  },
  // Bullet Cluster rains BaseNumMissiles(16) around the target; PercentTargetedMissiles
  // of them are aimed at it (~8), each ADDamage. Heuristic counts a single missile.
  TFT17_Kaisa: {
    ability: 'Bullet Cluster',
    expression: 'BaseNumMissiles * PercentTargetedMissiles * ADDamage',
    scaling: 'AD',
    rationale: 'Of BaseNumMissiles missiles, the PercentTargetedMissiles fraction strike the current target, each ADDamage — the rest scatter to others.',
  },
  // Fracture Reality: NumClones clones attack NumAttacks times at CloneDamageMultiplier
  // of LeBlanc's (magic-converted) BasicAttackDamage, then each fires a BoltDamage bolt.
  // Heuristic takes a single bolt; sum the clone barrage + all bolts.
  TFT17_Leblanc: {
    ability: 'Fracture Reality',
    expression: 'NumClones * NumAttacks * CloneDamageMultiplier * BasicAttackDamage + NumClones * BoltDamage',
    scaling: 'AP',
    rationale: 'NumClones clones each land NumAttacks hits at CloneDamageMultiplier×BasicAttackDamage, then fire one BoltDamage bolt — all magic; the clones are extra attackers the auto model never counts.',
  },
  // Indestructible pulses DamagePerProc to adjacent enemies each second for Duration
  // seconds (a shield-channel). Heuristic reads one per-second tick as an instant nuke.
  TFT17_Mordekaiser: {
    ability: 'Indestructible',
    expression: 'DamagePerProc * Duration',
    scaling: 'AP',
    dotDuration: 4,
    rationale: 'Channel: DamagePerProc magic to adjacent enemies each second over Duration(4)s — the total spread across the shield duration.',
  },
  // Groovin' Susan transforms and deals DamageAP to adjacent enemies each second for
  // Duration seconds. Heuristic reads one tick as an instant hit.
  TFT17_Nasus: {
    ability: "Groovin' Susan",
    expression: 'DamageAP * Duration',
    scaling: 'AP',
    dotDuration: 6,
    rationale: 'Transform aura: DamageAP magic to adjacent enemies each second over Duration(6)s — the total spread across the transform (the %max-HP part is unmodeled).',
  },
  // Advanced Defences deals its per-second value (physical, %i:scaleAD%) in a cone each
  // second for Duration seconds. The "PerSecond" name makes the heuristic drop it to
  // ZERO; restore it as an AD channel.
  TFT17_Pantheon: {
    ability: 'Advanced Defences',
    expression: 'TrueDamagePerSecond * Duration',
    scaling: 'AD',
    dotDuration: 4,
    rationale: 'Cone deals the per-second value (physical, AD) each second over Duration(4)s; the heuristic excludes any "PerSecond" variable and reads zero ability damage.',
  },
  // Marked for Death harpoons the target (SpearDamage) then teleports and cleaves it
  // (TargetDamage, the AD bulk). Heuristic keeps only the cleave and mis-scales it AP.
  TFT17_Pyke: {
    ability: 'Marked for Death',
    expression: 'SpearDamage + TargetDamage',
    scaling: 'AD',
    rationale: 'The lone target eats the harpoon SpearDamage and the on-target cleave TargetDamage; the dominant TargetDamage is %i:scaleAD%, so scale the burst as AD.',
  },
  // Jump and Jive's active Damage (physical, %i:scaleAD%) hits the target. The heuristic
  // reads the neutral name as the unit-wide "mixed" and mis-scales it AP.
  TFT17_Samira: {
    ability: 'Jump and Jive',
    expression: 'Damage',
    scaling: 'AD',
    rationale: "The active's on-target Damage is physical %i:scaleAD%; the heuristic mis-reads the neutral name as AP. Same number, correct AD scaling.",
  },
  // Fate's Gambit throws a card worth DamageMin..DamageMax (uniform value 1-9), so the
  // expected hit is their midpoint. Heuristic takes the MAX — a ~33% over-read.
  TFT17_TwistedFate: {
    ability: "Fate's Gambit",
    expression: '(DamageMin + DamageMax) / 2',
    scaling: 'AP',
    rationale: 'The card value is uniform between 1 and 9, so expected damage is the midpoint of DamageMin and DamageMax — not the max the heuristic reads.',
  },
};

const SCALINGS: readonly AbilityScaling[] = ['AP', 'AD', 'mixed', 'none'];

/** Build a full AbilityFormula from a seed: sanity-check the ability name,
 *  validate the expression's variables exist, then evaluate it per star. */
function fromSeed(u: UnitMath, seed: Seed, source: 'manual' | 'claude', model?: string): AbilityFormula {
  if (seed.ability && seed.ability !== u.ability.name) {
    console.warn(`  ⚠ ${u.apiName}: seed ability "${seed.ability}" ≠ cdragon "${u.ability.name}"`);
  }
  if (!SCALINGS.includes(seed.scaling)) throw new Error(`bad scaling "${seed.scaling}"`);
  const names = u.ability.variables.map((v) => v.name);
  const check = validateFormula(seed.expression, names); // throws on syntax error
  if (!check.ok) throw new Error(`expression uses unknown variables: ${check.missing.join(', ')}`);
  const perCastBase = evaluatePerStar(seed.expression, u.ability.variables);

  const f: AbilityFormula = {
    apiName: u.apiName,
    ability: u.ability.name,
    expression: seed.expression,
    scaling: seed.scaling,
    perCastBase,
    rationale: seed.rationale,
    source,
  };
  if (seed.dotDuration && seed.dotDuration > 0) f.dotDuration = seed.dotDuration;
  if (seed.trueDamage) f.trueDamage = true;
  if (model) f.model = model;
  return f;
}

// ---- Claude pass (offline, CI-only) --------------------------------------

function variableTable(u: UnitMath): string {
  return u.ability.variables.map((v) => `  ${v.name} = [${v.value.join(', ')}]`).join('\n');
}

function buildPrompt(u: UnitMath): string {
  return `You are reverse-engineering a Teamfight Tactics champion ability into a per-cast base-damage formula.

ABILITY: "${u.ability.name}"   (unit: ${u.name}, cost ${u.cost})
COARSE SCALING HINT (may be wrong — it's unit-wide, not damage-specific): ${u.ability.scaling}

DESCRIPTION (cdragon tooltip — @Var@ is a variable listed below; %i:scaleAP%/%i:scaleAD% mark which stat the adjacent NUMBER scales with):
${u.ability.desc}

VARIABLES (value is indexed by star: index 1 = 1-star, 2 = 2-star, 3 = 3-star; IGNORE index 0 and indices ≥ 4 — placeholders/junk):
${variableTable(u)}

TASK: Write an arithmetic EXPRESSION for the average damage ONE cast deals, using ONLY the variable names above, numeric constants, and the operators + - * / and parentheses.
- Combine the variables exactly as the description says: sum the damage components of a single cast; if a big effect only happens every Nth cast, AVERAGE over that cycle, e.g. "(4*A + B) / 5"; if one strike lands K times, multiply its per-hit value by K.
- Keep the result in the SAME native units as the variables. Do NOT apply AP/AD scaling, item bonuses, or convert percentages — a downstream engine does all of that.
- Count ONLY damage. Ignore healing, shields, mana gain, stun/CC durations, and stat buffs.

Respond with ONLY a JSON object — no prose, no markdown fences:
{
  "expression": "<arithmetic over the variable names>",
  "scaling": "AP" | "AD" | "mixed" | "none",
  "dotDuration": <seconds>,
  "trueDamage": true,
  "rationale": "<one sentence, grounded in the description>"
}
Rules for the fields:
- "scaling": which stat the DAMAGE scales with, from the %i:scale…% marker next to the DAMAGE numbers (ignore markers next to healing/shield numbers). Use "none" for flat damage, "mixed" only if the damage itself is part AD part AP.
- "dotDuration": include ONLY if the damage is dealt over time (bleed/burn/poison) spread across that many seconds; otherwise omit.
- "trueDamage": include ONLY if the damage is TRUE damage (ignores armor and magic resist); otherwise omit.
If the ability deals NO direct damage (pure utility / heal / shield / buff), respond with exactly: {"none": true}`;
}

function extractJson(text: string): any {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error(`no JSON object in response: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(s, e + 1));
}

/** Shared parse/validate for one model response (API or CLI). Returns a Seed,
 *  or null when the model reports the ability deals no direct damage. Throws on
 *  malformed output (the caller logs and falls back to the heuristic). */
function parseSeedJson(text: string, u: UnitMath): Seed | null {
  const j = extractJson(text);
  if (j.none === true) return null;
  if (typeof j.expression !== 'string' || !j.expression.trim()) throw new Error('missing "expression"');
  if (!SCALINGS.includes(j.scaling)) throw new Error(`bad "scaling": ${JSON.stringify(j.scaling)}`);
  const seed: Seed = {
    ability: u.ability.name,
    expression: j.expression.trim(),
    scaling: j.scaling,
    rationale: typeof j.rationale === 'string' ? j.rationale.trim() : '',
  };
  if (typeof j.dotDuration === 'number' && j.dotDuration > 0) seed.dotDuration = j.dotDuration;
  if (j.trueDamage === true) seed.trueDamage = true;
  return seed;
}

/** API provider — ask Claude via @anthropic-ai/sdk (metered, ANTHROPIC_API_KEY). */
async function askClaudeApi(client: any, model: string, u: UnitMath): Promise<Seed | null> {
  const msg = await client.messages.create({
    model,
    max_tokens: 700,
    messages: [{ role: 'user', content: buildPrompt(u) }],
  });
  const text = (msg.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return parseSeedJson(text, u);
}

/** Spawn the Claude Code CLI, feed `input` on stdin, resolve its stdout. Strips
 *  ANTHROPIC_API_KEY from the child env so the CLI authenticates with the
 *  subscription (CLAUDE_CODE_OAUTH_TOKEN or an existing local `claude` login)
 *  instead of silently switching to metered API billing. */
function runClaudeCli(args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // On Windows the CLI is a `.cmd` shim; Node ≥20 refuses to spawn `.cmd`
    // without a shell (EINVAL, the CVE-2024-27980 mitigation). `shell` is safe
    // here: every arg is a static literal (no user input in argv) and the prompt
    // is fed on stdin, never the command line.
    const isWin = process.platform === 'win32';
    const bin = isWin ? 'claude.cmd' : 'claude';
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // force subscription auth, never metered API
    let child;
    try {
      child = spawn(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'], shell: isWin });
    } catch (e) {
      reject(e as Error);
      return;
    }
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`claude CLI exited ${code}: ${err.trim().slice(0, 200)}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

/** Subscription provider — ask Claude via the Claude Code CLI (`claude -p
 *  --output-format json`). The CLI wraps the assistant text in a `.result`
 *  envelope; on failure it sets `.is_error`. */
async function askClaudeCli(model: string | undefined, u: UnitMath): Promise<Seed | null> {
  const args = ['-p', '--output-format', 'json'];
  if (model) args.push('--model', model);
  const raw = await runClaudeCli(args, buildPrompt(u));
  let env: any;
  try {
    env = JSON.parse(raw);
  } catch {
    throw new Error(`CLI did not return JSON: ${raw.trim().slice(0, 120)}`);
  }
  if (env.is_error) throw new Error(`CLI reported error: ${String(env.result ?? env.subtype).slice(0, 120)}`);
  const text = typeof env.result === 'string' ? env.result.trim() : '';
  if (!text) throw new Error('CLI returned empty result');
  return parseSeedJson(text, u);
}

/** Fill in every unit not already covered by the seed. Provider precedence:
 *  subscription CLI first (free against API credits), then metered API, else a
 *  no-op. USE_CLAUDE_CLI forces the CLI even without the token (local login). */
async function claudePass(
  units: UnitMath[],
): Promise<{ formulas: AbilityFormula[]; providerTag: string | null }> {
  if (units.length === 0) return { formulas: [], providerTag: null };

  const useCli = !!process.env.USE_CLAUDE_CLI || !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const model = process.env.ANTHROPIC_MODEL; // optional override for either path

  let ask: (u: UnitMath) => Promise<Seed | null>;
  let providerTag: string;

  if (useCli) {
    providerTag = `claude-cli${model ? `:${model}` : ''}`;
    ask = (u) => askClaudeCli(model, u);
    console.log(
      `  Claude pass: ${units.length} units via Claude Code CLI (subscription)${model ? ` · ${model}` : ''}…`,
    );
  } else if (process.env.ANTHROPIC_API_KEY) {
    let Anthropic: any;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch {
      console.warn('  @anthropic-ai/sdk not installed — skipping Claude pass (run: npm i -D @anthropic-ai/sdk).');
      return { formulas: [], providerTag: null };
    }
    const apiModel = model ?? 'claude-sonnet-4-5';
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    providerTag = `claude-api:${apiModel}`;
    ask = (u) => askClaudeApi(client, apiModel, u);
    console.log(`  Claude pass: ${units.length} units via Anthropic API (metered) · ${apiModel}…`);
  } else {
    console.log(
      '  No Claude auth (CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY / USE_CLAUDE_CLI) — seed only, Claude pass skipped.',
    );
    return { formulas: [], providerTag: null };
  }

  const out: AbilityFormula[] = [];
  let none = 0;
  let failed = 0;
  for (const u of units) {
    try {
      const seed = await ask(u);
      if (!seed) {
        none++;
        continue;
      }
      out.push(fromSeed(u, seed, 'claude', providerTag));
    } catch (e) {
      failed++;
      console.warn(`  ⚠ ${u.apiName} (${u.name}): ${(e as Error).message} — leaving to heuristic.`);
    }
  }
  console.log(`  Claude pass done: ${out.length} formulas, ${none} no-damage, ${failed} skipped.`);
  return { formulas: out, providerTag };
}

// Units the Claude pass must NOT touch: their ability damage scales off the
// target's/caster's Armor+MR or max-HP (e.g. "deal coefficient × (Armor+MR)"),
// and cdragon persists only the bare scaling coefficient — the resolved damage
// variable isn't in the dataset. No expression over the available variables is
// meaningful, so a model will reliably produce a junk formula (a ~1.0 coefficient
// read as flat damage). Skipping leaves them to the heuristic, which honestly
// reports ~0 ability damage for a resist-scaling tank. Keep this list tight —
// only units proven unrepresentable, not merely hard.
const SKIP_CLAUDE = new Set<string>([
  'TFT17_Galio', // ModifiedDamage = ARMARScaling × (Armor+MR), %i:scaleArmor%%i:scaleMR%
  'TFT17_Jax', //   ModifiedDamage = ArmorMRScale × (Armor+MR), %i:scaleArmor%%i:scaleMR%
]);

async function main(): Promise<void> {
  console.log('Building ability formulas (Stage 3)…');
  const t0 = Date.now();

  const byApi = new Map<string, UnitMath>(ALL_UNITS.map((u) => [u.apiName, u]));
  const formulas: AbilityFormula[] = [];
  const covered = new Set<string>();

  // 1) Manual seed (hand-verified from the tooltip, source 'manual').
  for (const [apiName, seed] of Object.entries(MANUAL_FORMULAS)) {
    const u = byApi.get(apiName);
    if (!u) {
      console.warn(`  ⚠ seed "${apiName}" not found in unit-math — skipping.`);
      continue;
    }
    try {
      formulas.push(fromSeed(u, seed, 'manual'));
      covered.add(apiName);
    } catch (e) {
      console.error(`  ✖ seed "${apiName}": ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log(`  manual seed: ${covered.size} formula(s).`);

  // 1b) In-session authored set (Claude read the desc; committed, keyless).
  //     Manual seed wins any overlap; authored ones join `covered` so the Claude
  //     pass below skips them.
  let authored = 0;
  for (const [apiName, seed] of Object.entries(AUTHORED_FORMULAS)) {
    const u = byApi.get(apiName);
    if (!u) {
      console.warn(`  ⚠ authored "${apiName}" not found in unit-math — skipping.`);
      continue;
    }
    if (covered.has(apiName)) {
      console.warn(`  ⚠ authored "${apiName}" already covered by manual seed — keeping manual.`);
      continue;
    }
    try {
      formulas.push(fromSeed(u, seed, 'claude', AUTHORED_BY));
      covered.add(apiName);
      authored++;
    } catch (e) {
      console.error(`  ✖ authored "${apiName}": ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log(`  authored: ${authored} formula(s).`);

  // 2) Claude pass for everything not in the seed (CI, auth-gated). Only units
  //    that actually have ability variables are worth asking about. Subscription
  //    CLI is tried first (free), then the metered API; neither overwrites the seed.
  const remaining = ALL_UNITS.filter(
    (u) => !covered.has(u.apiName) && !SKIP_CLAUDE.has(u.apiName) && u.ability.variables.length > 0,
  );
  const pass = await claudePass(remaining);
  formulas.push(...pass.formulas);

  const source = `manual+authored:${AUTHORED_BY}${pass.providerTag ? `+${pass.providerTag}` : ''}`;
  const written = writeAbilityFormulasFile(formulas, source);

  const manual = formulas.filter((f) => f.source === 'manual').length;
  const claude = formulas.filter((f) => f.source === 'claude').length;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n──────── ability-formulas summary ────────');
  console.log(`formulas: ${formulas.length}  (manual=${manual} claude=${claude})  of ${ALL_UNITS.length} units`);
  for (const f of [...formulas].sort((a, b) => a.apiName.localeCompare(b.apiName))) {
    const flags = [f.scaling, f.trueDamage ? 'true' : '', f.dotDuration ? `DoT ${f.dotDuration}s` : ''].filter(Boolean).join(', ');
    const tag = f.source === 'manual' ? 'manual' : f.model ?? 'claude';
    console.log(`  ${f.apiName.padEnd(20)} ${f.expression}`);
    console.log(`  ${''.padEnd(20)} → @1★/2★/3★ = ${f.perCastBase[1]} / ${f.perCastBase[2]} / ${f.perCastBase[3]}  [${flags}]  (${tag})`);
  }
  console.log(`\n✓ wrote ${written}  (${secs}s)`);
}

main().catch((e) => {
  console.error(`✖ build:formulas failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
