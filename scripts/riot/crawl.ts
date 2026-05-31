import { RiotClient, regionFor } from './client';
import { normalizeName, type Board } from '../classify';

interface LeagueEntry {
  puuid?: string;
}
interface LeagueList {
  entries: LeagueEntry[];
}
interface Participant {
  placement: number;
  units: { character_id: string; itemNames?: string[]; tier?: number }[];
  traits: { name: string; tier_current: number }[];
}
interface MatchDetail {
  metadata: { participants: string[] };
  info: { tft_game_type: string; participants: Participant[] };
}

export interface CrawlOptions {
  platform: string;
  seedPlayers: number; // Challenger players to seed the queue with
  matchesPerPlayer: number; // recent matches to scan per player (Riot caps at 20)
  maxBoards: number;
  maxRequests: number; // hard cap so a slow dev-key run stays bounded
}

export interface CrawlResult {
  boards: Board[];
  matchesSeen: number;
  doubleUpMatches: number;
  gameTypes: Record<string, number>; // tft_game_type -> count (sanity-check the filter)
  requests: number;
}

// Snowball crawl. Seed from the DOUBLE UP ranked ladder (its own queue, separate
// from standard RANKED_TFT) — every seed is already an active Double Up player, so
// their match histories are full of 'pairs' games. We still only FOLLOW players who
// show up in a 'pairs' game, which keeps the crawl inside the Double Up network and
// off the occasional standard game these same players also play. Standard games are
// counted for diagnostics but never followed.
const DOUBLE_UP_QUEUE = 'RANKED_TFT_DOUBLE_UP';
const APEX_TIERS = ['challenger', 'grandmaster', 'master'] as const;

export async function crawl(client: RiotClient, opts: CrawlOptions): Promise<CrawlResult> {
  const region = regionFor(opts.platform);

  // The challenger Double Up ladder is small (tens of players), so pull all three
  // apex tiers for a healthy seed pool; the snowball expands past it from there.
  const seedEntries: LeagueEntry[] = [];
  for (const tier of APEX_TIERS) {
    const league = await client.get<LeagueList>(opts.platform, `/tft/league/v1/${tier}?queue=${DOUBLE_UP_QUEUE}`);
    if (league?.entries?.length) seedEntries.push(...league.entries);
  }
  if (seedEntries.length === 0) {
    throw new Error(
      `no Double Up ranked players found on ${opts.platform} (queried ${APEX_TIERS.join('/')} for ${DOUBLE_UP_QUEUE})` +
        ' — check the key and platform',
    );
  }

  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (puuid?: string) => {
    if (puuid && !queued.has(puuid)) {
      queued.add(puuid);
      queue.push(puuid);
    }
  };
  for (const e of seedEntries.slice(0, opts.seedPlayers)) enqueue(e.puuid);
  console.log(`Double Up apex players: ${seedEntries.length}, seeded ${queue.length}`);

  const boards: Board[] = [];
  const seenMatches = new Set<string>();
  const gameTypes: Record<string, number> = {};
  let doubleUpMatches = 0;
  let processedPlayers = 0;

  const capReached = () => boards.length >= opts.maxBoards || client.requestCount >= opts.maxRequests;

  while (queue.length > 0 && !capReached()) {
    const puuid = queue.shift()!;
    processedPlayers++;

    const ids = await client.get<string[]>(
      region,
      `/tft/match/v1/matches/by-puuid/${puuid}/ids?count=${opts.matchesPerPlayer}`,
    );
    if (!ids) continue;

    for (const id of ids) {
      if (capReached()) break;
      if (seenMatches.has(id)) continue;
      seenMatches.add(id);

      const match = await client.get<MatchDetail>(region, `/tft/match/v1/matches/${id}`);
      if (!match) continue;

      const gt = match.info.tft_game_type;
      gameTypes[gt] = (gameTypes[gt] ?? 0) + 1;
      if (gt !== 'pairs') continue; // Double Up only
      doubleUpMatches++;

      for (const p of match.info.participants) {
        boards.push({
          matchId: id,
          placement: p.placement,
          units: p.units.map((u) => ({
            name: normalizeName(u.character_id),
            items: u.itemNames ?? [],
            tier: u.tier ?? 0,
          })),
          traits: p.traits.filter((t) => t.tier_current > 0).map((t) => normalizeName(t.name)),
        });
      }
      // Everyone in a Double Up game is a Double Up player — chase them.
      for (const pid of match.metadata.participants) enqueue(pid);
    }

    if (processedPlayers % 10 === 0) {
      console.log(
        `  …${processedPlayers} players · ${doubleUpMatches} double-up · ${boards.length} boards · ${client.requestCount} reqs · queue ${queue.length}`,
      );
    }
  }

  return { boards, matchesSeen: seenMatches.size, doubleUpMatches, gameTypes, requests: client.requestCount };
}
