// ---------------------------------------------------------------------------
// Minimal, rate-limited Riot TFT API client (Node 18+ global fetch).
//
// Reads the key from RIOT_API_KEY. A DEV key is fine for testing but is capped
// at ~100 requests / 2 min and EXPIRES EVERY 24h — paste a fresh one each run.
// A production key lifts the cap; set RIOT_RATE_MS lower to crawl faster.
//
// Routing: league + summoner use the PLATFORM host (na1, euw1, kr…); match-v1
// uses the REGIONAL host (americas, asia, europe, sea).
// ---------------------------------------------------------------------------

const PLATFORM_TO_REGION: Record<string, string> = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia',
  sg2: 'sea', tw2: 'sea', vn2: 'sea',
};

export function regionFor(platform: string): string {
  const region = PLATFORM_TO_REGION[platform];
  if (!region) throw new Error(`unknown platform "${platform}". Known: ${Object.keys(PLATFORM_TO_REGION).join(', ')}`);
  return region;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RiotClient {
  private key: string;
  private minIntervalMs: number;
  private lastRequestAt = 0;
  public requestCount = 0;

  constructor() {
    const key = process.env.RIOT_API_KEY;
    if (!key) {
      throw new Error(
        'RIOT_API_KEY is not set. Get a key at https://developer.riotgames.com and run e.g.\n' +
          '  PowerShell:  $env:RIOT_API_KEY="RGAPI-…"; npm run refresh\n' +
          '  bash:        RIOT_API_KEY=RGAPI-… npm run refresh',
      );
    }
    this.key = key;
    // Default ~1.3s between calls keeps a dev key safely under 100 req / 2 min.
    // An unset/empty/invalid RIOT_RATE_MS must NOT disable throttling.
    const rate = Number(process.env.RIOT_RATE_MS);
    this.minIntervalMs = Number.isFinite(rate) && rate > 0 ? rate : 1300;
  }

  // GET a Riot JSON endpoint. Returns null on 404. Retries 429/5xx with backoff.
  async get<T = unknown>(host: string, path: string): Promise<T | null> {
    const url = `https://${host}.api.riotgames.com${path}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = this.minIntervalMs - (Date.now() - this.lastRequestAt);
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      this.requestCount++;

      const res = await fetch(url, { headers: { 'X-Riot-Token': this.key } });

      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 2);
        console.warn(`  429 rate-limited; waiting ${retryAfter}s…`);
        await sleep((retryAfter + 0.5) * 1000);
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Riot API ${res.status} (key invalid or expired?) on ${path}`);
      }
      if (res.status >= 500) {
        await sleep((attempt + 1) * 1000);
        continue;
      }
      throw new Error(`Riot API ${res.status} on ${path}`);
    }
    console.warn(`  giving up on ${path} after retries`);
    return null;
  }
}
