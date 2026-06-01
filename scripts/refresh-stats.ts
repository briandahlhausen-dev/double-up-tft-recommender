import { COMPS } from '../src/data/comps';
import { buildSignatures } from './classify';
import { RiotClient } from './riot/client';
import { crawl } from './riot/crawl';
import { aggregate } from './aggregate';
import { aggregateAugments } from './aggregate-augments';
import { writeStatsFile } from './lib/write-stats';
import { writeAugmentStatsFile } from './lib/write-augment-stats';
import { fetchAugmentMeta } from './lib/cdragon';

// ---------------------------------------------------------------------------
// FULL REFRESH — crawl the Riot API and recompute src/data/stats.ts.
//
//   npm run refresh
//   npm run refresh -- --platform=euw1 --seed-players=60 --max-boards=8000
//
// Needs RIOT_API_KEY. A dev key works for a small run but is slow (~1.3s/call)
// and expires every 24h; a production key lets you raise the caps and lower
// RIOT_RATE_MS. Only comps with at least --min-sample classified boards are
// written; the rest keep their seed numbers from comps.ts.
// ---------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  const platform = arg('platform', 'na1');
  const opts = {
    platform,
    seedPlayers: Number(arg('seed-players', '50')),
    matchesPerPlayer: Number(arg('matches-per-player', '20')),
    maxBoards: Number(arg('max-boards', '6000')),
    maxRequests: Number(arg('max-requests', '100000')),
  };
  const minSample = Number(arg('min-sample', '25'));
  const augMinSample = Number(arg('aug-min-sample', '15'));
  const augTop = Number(arg('aug-top', '6'));

  console.log(`Refreshing from Riot API · platform=${platform} · min-sample=${minSample}`);
  const client = new RiotClient();
  const t0 = Date.now();

  const { boards, matchesSeen, doubleUpMatches, gameTypes, requests } = await crawl(client, opts);
  const signatures = buildSignatures(COMPS);
  const result = aggregate(boards, signatures, minSample);

  const written = writeStatsFile(result.stats, `riot-api:${platform}`);

  // Augment overlay: resolve display metadata from CommunityDragon (no key needed)
  // and tally per-comp pick + placement from the same boards. Best-effort — the
  // comp stats above are already written, so a cdragon hiccup must not sink the run.
  let augSummary = '';
  let augWritten = '';
  try {
    const meta = await fetchAugmentMeta();
    const aug = aggregateAugments(boards, signatures, meta, { minSample: augMinSample, top: augTop });
    augWritten = writeAugmentStatsFile(aug.byComp, `riot-api:${platform}`);
    augSummary = `${aug.compsWithData}/${COMPS.length} comps · ${aug.augmentsSeen} distinct seen · cdragon meta ${meta.size}`;
  } catch (e) {
    augSummary = `FAILED (${(e as Error).message}) — overlay left unchanged`;
  }

  const secs = Math.round((Date.now() - t0) / 1000);

  console.log('\n──────── refresh summary ────────');
  console.log(`requests:        ${requests}  (${secs}s)`);
  console.log(`matches seen:    ${matchesSeen}  ·  double-up: ${doubleUpMatches}`);
  const gameTypeSummary = Object.entries(gameTypes).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)';
  console.log(`game types:      ${gameTypeSummary}  ← 'pairs' is Double Up`);
  console.log(`boards:          ${result.total}  ·  classified: ${result.classified}` +
    (result.total ? `  (${Math.round((result.classified / result.total) * 100)}%)` : ''));
  console.log(`placement range: ${result.placementMin}..${result.placementMax}  ← confirm 1..8 vs 1..4`);
  if (boards.length) {
    console.log(`sample units:    ${boards[0].units.slice(0, 8).map((u) => u.name).join(', ')}  ← normalized; should match comps.ts keys`);
    console.log(`sample traits:   ${boards[0].traits.slice(0, 6).join(', ')}`);
  }
  console.log(`comps written:   ${Object.keys(result.stats).length}/${COMPS.length}`);
  console.log(`augments:        ${augSummary}`);

  for (const c of COMPS) {
    const s = result.stats[c.id];
    if (s) console.log(`  ✓ ${c.id.padEnd(24)} n=${String(s.sampleSize).padStart(4)}  avg=${s.avgPlace}  top4=${s.top4}%  first=${s.first}%  (${s.contested})`);
  }
  for (const sk of result.skipped) {
    console.log(`  – ${sk.id.padEnd(24)} n=${String(sk.n).padStart(4)}  below min-sample, kept seed numbers`);
  }
  if (doubleUpMatches === 0) {
    console.log('\n⚠ No Double Up matches found — the Double Up ranked ladder on this platform may' +
      ' be empty or unreachable. Raise --seed-players / --max-requests, or try another platform.');
  }
  console.log(`\n✓ wrote ${written}`);
  if (augWritten) console.log(`✓ wrote ${augWritten}`);
}

main().catch((e) => {
  console.error(`✖ refresh failed: ${(e as Error).message}`);
  // Set the code and let the event loop drain — calling process.exit() while
  // fetch's keep-alive sockets are still closing trips a libuv assertion on Windows.
  process.exitCode = 1;
});
