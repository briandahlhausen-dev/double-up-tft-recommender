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
// Two sources, both OFFLINE:
//   • MANUAL_FORMULAS  — hand-verified seed, read straight from the tooltip.
//     Small and certain; works with no API key (local + CI).
//   • Claude pass      — for everything not in the seed, ONLY when
//     ANTHROPIC_API_KEY is set (CI secret, never client-side). Claude reads the
//     description and returns the STRUCTURE (an arithmetic expression over the
//     variable names); this script does the ARITHMETIC (evaluates per star).
//
//   npm run build:formulas                         # manual seed only
//   ANTHROPIC_API_KEY=… npm run build:formulas     # + Claude for the rest
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

/** Ask Claude for one ability's structure. Returns a Seed, or null when Claude
 *  reports the ability deals no direct damage. Throws on malformed output (the
 *  caller logs and falls back to the heuristic for that unit). */
async function askClaude(client: any, model: string, u: UnitMath): Promise<Seed | null> {
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

async function claudePass(units: UnitMath[]): Promise<AbilityFormula[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log('  ANTHROPIC_API_KEY not set — manual seed only (Claude pass skipped).');
    return [];
  }
  let Anthropic: any;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    console.warn('  @anthropic-ai/sdk not installed — skipping Claude pass (run: npm i -D @anthropic-ai/sdk).');
    return [];
  }
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
  const client = new Anthropic({ apiKey: key });
  console.log(`  Claude pass: ${units.length} units via ${model}…`);

  const out: AbilityFormula[] = [];
  let none = 0;
  let failed = 0;
  for (const u of units) {
    try {
      const seed = await askClaude(client, model, u);
      if (!seed) {
        none++;
        continue;
      }
      out.push(fromSeed(u, seed, 'claude', model));
    } catch (e) {
      failed++;
      console.warn(`  ⚠ ${u.apiName} (${u.name}): ${(e as Error).message} — leaving to heuristic.`);
    }
  }
  console.log(`  Claude pass done: ${out.length} formulas, ${none} no-damage, ${failed} skipped.`);
  return out;
}

async function main(): Promise<void> {
  console.log('Building ability formulas (Stage 3)…');
  const t0 = Date.now();

  const byApi = new Map<string, UnitMath>(ALL_UNITS.map((u) => [u.apiName, u]));
  const formulas: AbilityFormula[] = [];
  const covered = new Set<string>();

  // 1) Manual seed.
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

  // 2) Claude pass for everything not in the seed (CI, key-gated). Only units
  //    that actually have ability variables are worth asking about.
  const remaining = ALL_UNITS.filter((u) => !covered.has(u.apiName) && u.ability.variables.length > 0);
  formulas.push(...(await claudePass(remaining)));

  const source = `manual+${process.env.ANTHROPIC_API_KEY ? `claude:${process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'}` : 'seed-only'}`;
  const written = writeAbilityFormulasFile(formulas, source);

  const manual = formulas.filter((f) => f.source === 'manual').length;
  const claude = formulas.filter((f) => f.source === 'claude').length;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n──────── ability-formulas summary ────────');
  console.log(`formulas: ${formulas.length}  (manual=${manual} claude=${claude})  of ${ALL_UNITS.length} units`);
  for (const f of formulas.filter((x) => x.source === 'manual')) {
    console.log(`  ${f.apiName.padEnd(20)} ${f.expression}`);
    console.log(`  ${''.padEnd(20)} → perCast @1★/2★/3★ = ${f.perCastBase[1]} / ${f.perCastBase[2]} / ${f.perCastBase[3]}  [${f.scaling}${f.trueDamage ? ', true' : ''}]`);
  }
  console.log(`\n✓ wrote ${written}  (${secs}s)`);
}

main().catch((e) => {
  console.error(`✖ build:formulas failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
