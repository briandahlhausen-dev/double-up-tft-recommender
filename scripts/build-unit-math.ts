import { fetchUnitMath } from './lib/cdragon';
import { writeUnitMathFile } from './lib/write-unit-math';

// ---------------------------------------------------------------------------
// Stage 0 of the theorycraft engine: extract the deep math (champion base
// stats, ability variables, completed-item stat effects, trait breakpoints)
// from CommunityDragon into src/data/unit-math.ts. Keyless — runs locally and
// in CI, no Riot key needed.
//
//   npm run build:math
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Building unit math from CommunityDragon (no key needed)…');
  const t0 = Date.now();
  const { units, items, traits } = await fetchUnitMath();
  const written = writeUnitMathFile({ units, items, traits }, 'cdragon:TFTSet17');

  const scaleCount = (s: string) => units.filter((u) => u.ability.scaling === s).length;
  let itemKeys = 0;
  let hashedKeys = 0;
  for (const i of items) {
    for (const k of Object.keys(i.effects)) {
      itemKeys++;
      if (/^\{[0-9a-f]+\}$/.test(k)) hashedKeys++;
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n──────── unit-math summary ────────');
  console.log(`units:   ${units.length}  (AP=${scaleCount('AP')} AD=${scaleCount('AD')} mixed=${scaleCount('mixed')} none=${scaleCount('none')})`);
  console.log(`items:   ${items.length} completed  ·  ${itemKeys} effect keys (${hashedKeys} opaque hashes)`);
  console.log(`traits:  ${traits.length}`);
  const sample = units.find((u) => u.cost >= 4) ?? units[0];
  if (sample) {
    console.log(
      `sample:  ${sample.name} (cost ${sample.cost})  HP ${sample.stats.hp}  AD ${sample.stats.damage}  ` +
        `AS ${sample.stats.attackSpeed}  mana ${sample.stats.initialMana}/${sample.stats.mana}`,
    );
    console.log(`         ability "${sample.ability.name}" scaling=${sample.ability.scaling}  vars=${sample.ability.variables.length}`);
  }
  console.log(`\n✓ wrote ${written}  (${secs}s)`);
}

main().catch((e) => {
  console.error(`✖ build:math failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
