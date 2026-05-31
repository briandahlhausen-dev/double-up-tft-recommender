import { COMPS } from '../src/data/comps';
import { buildSignatures } from './classify';
import { RiotClient } from './riot/client';
import { crawl } from './riot/crawl';
import { aggregateChampions } from './aggregate-champions';
import { writeChampionStatsFile } from './lib/write-champion-stats';
import { fetchCdragon } from './lib/cdragon';

// ---------------------------------------------------------------------------
// CHAMPION REFRESH — crawl the Riot API and recompute src/data/champion-stats.ts.
//
//   npm run refresh:champions
//   npm run refresh:champions -- --platform=euw1 --seed-players=80 --max-boards=8000
//
// Reuses the SAME Double Up crawl as `npm run refresh`, then aggregates per
// champion (placement, top4/first, play rate, best items, best comps) instead of
// per comp. Needs RIOT_API_KEY. CommunityDragon supplies item display names and
// icons (no key). Only champions with at least --min-sample boards are written;
// the rest stay blank ("no data yet") in the UI.
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
  const minSample = Number(arg('min-sample', '40'));
  const topItems = Number(arg('top-items', '8'));
  const topComps = Number(arg('top-comps', '3'));

  console.log(`Refreshing CHAMPIONS from Riot API · platform=${platform} · min-sample=${minSample}`);
  const t0 = Date.now();

  // Item names + icons (and the completed-item flag) come from CommunityDragon.
  const { items } = await fetchCdragon();
  const completedItems = [...items.values()].filter((i) => i.completed).length;
  console.log(`CommunityDragon items: ${items.size} (${completedItems} completed combat items)`);

  const client = new RiotClient();
  const { boards, matchesSeen, doubleUpMatches, gameTypes, requests } = await crawl(client, opts);

  const signatures = buildSignatures(COMPS);
  const compNames = new Map(COMPS.map((c) => [c.id, c.name]));
  const result = aggregateChampions(boards, signatures, items, compNames, { minSample, topItems, topComps });

  const written = writeChampionStatsFile(result.stats, `riot-api:${platform}`);
  const secs = Math.round((Date.now() - t0) / 1000);

  console.log('\n──────── champion refresh summary ────────');
  console.log(`requests:        ${requests}  (${secs}s)`);
  console.log(`matches seen:    ${matchesSeen}  ·  double-up: ${doubleUpMatches}`);
  const gameTypeSummary = Object.entries(gameTypes).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)';
  console.log(`game types:      ${gameTypeSummary}  ← 'pairs' is Double Up`);
  console.log(`boards:          ${result.totalBoards}  ·  distinct champions: ${result.championsSeen}`);
  console.log(`champions written: ${result.written}  (≥ ${minSample} boards)`);

  const ranked = Object.entries(result.stats).sort((a, b) => a[1].avgPlace - b[1].avgPlace);
  for (const [id, s] of ranked) {
    const itemsPreview = s.bestItems.slice(0, 3).map((it) => it.name).join(', ') || '—';
    const more = s.bestItems.length > 3 ? ` +${s.bestItems.length - 3}` : '';
    console.log(
      `  ✓ ${id.padEnd(18)} n=${String(s.sampleSize).padStart(4)}  avg=${s.avgPlace}  top4=${s.top4}%  play=${s.pickRate}%  ⟶ ${itemsPreview}${more}`,
    );
  }
  if (result.skipped.length) {
    const top = result.skipped.sort((a, b) => b.n - a.n).slice(0, 8).map((s) => `${s.id}(${s.n})`).join(', ');
    console.log(`skipped (below min-sample): ${result.skipped.length} — e.g. ${top}`);
  }
  if (doubleUpMatches === 0) {
    console.log('\n⚠ No Double Up matches found — the Double Up ranked ladder on this platform may' +
      ' be empty or unreachable. Raise --seed-players / --max-requests, or try another platform.');
  }
  console.log(`\n✓ wrote ${written}`);
}

main().catch((e) => {
  console.error(`✖ champion refresh failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
