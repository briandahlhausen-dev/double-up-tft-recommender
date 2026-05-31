# Double Up TFT — Set 17 Comp Recommender

A single-page, fully client-side web app for **Teamfight Tactics Set 17 Double Up**.
Tell it the comp your duo partner is locking in, set a few quick preferences, and it
returns data-backed recommendations for what **you** should play — picked so your units
and items don't collide with your partner's and so your two boards complement each other.

- **No backend, no accounts, no database.** All comp data lives in one typed module.
- **Explainable engine.** Every recommendation comes with specific "why this pick" reasons
  that name the partner comp, the shared units, and the item types in play.
- **Tune it in one place.** Scoring weights live in a single exported `WEIGHTS` constant;
  the comp dataset is a single typed array.
- **Champions browser.** A second page (`#/champions`) lists every Set 17 unit with traits
  and art from CommunityDragon, plus per-champion Double Up stats — sortable, filterable, with
  click-through detail pages for best items and comps. Hash-routed, so detail URLs are shareable.

---

## Tech stack

Vite · React 18 · TypeScript (strict) · Tailwind CSS v3. Mobile-responsive, dark "Space
Gods" cosmic theme, print-friendly stylesheet. Builds to static files that drop onto any
host.

---

## Quick start

Prerequisites: **Node 18+** and npm.

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
```

Open the printed URL in your browser. Pick a partner comp, tweak the preferences — results
recompute live.

## Build & preview

```bash
npm run build    # type-check (tsc) + production build → dist/
npm run preview  # serve the built dist/ locally to sanity-check it
```

The build is configured with `base: './'` (see `vite.config.ts`), so the output uses
relative asset paths and works from a domain root **or** a subpath.

---

## Deploy

The app is 100% static — deploy the `dist/` folder anywhere.

### Netlify
- **Build command:** `npm run build`
- **Publish directory:** `dist`
- Or drag-and-drop the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).

### Vercel
- Import the repo; Vercel auto-detects Vite.
- **Build command:** `npm run build` · **Output directory:** `dist`

### GitHub Pages
```bash
npm run build
npx gh-pages -d dist        # publishes dist/ to the gh-pages branch
```
`base: './'` already handles the project-subpath URLs that Pages serves from, so no extra
config is needed.

---

## How it works

### Editing the data (per patch)
Open [`src/data/comps.ts`](src/data/comps.ts) and edit the `COMPS` array. Each entry is a
typed `Comp` (see [`src/types.ts`](src/types.ts)). **Adding a comp requires no other code
changes** — the dropdown, the engine, and every card pick it up automatically. The `units`
array is what powers overlap detection, so keep it complete.

### Tuning the engine
The recommender is a pure function, `recommend(partner, prefs)`, in
[`src/lib/recommend.ts`](src/lib/recommend.ts). It scores every comp (except the partner's
own) as a weighted sum of six normalized (0–1) components:

| Component | Weight | What it rewards |
|---|---:|---|
| Item complement | 30 | Opposite AD/AP item types (no shard competition); hybrid = partial |
| Unit overlap | 25 | Few/zero shared units with the partner |
| Board synergy | 20 | The Double Up aggressive + scaling split |
| Standalone strength | 15 | Lower avg place blended with top-4 % |
| Contested fit | 10 | Open comps; scaled by your contested tolerance |
| Preference match | 10 | Your playstyle + tempo prefs ("no preference" is neutral) |

Adjust the exported `WEIGHTS` constant to re-tune. Each component also emits a
human-readable reason with a salience score; the most impactful 2–3 surface on each card.
The weighted sum is normalized to a 0–100 **match %** for display.

### Project layout
```
src/
  types.ts              # Comp + Prefs + Champion types, default prefs
  data/
    comps.ts            # THE editable comp seed dataset
    stats.ts            # machine-written comp performance overlay
    champions.ts        # generated Set 17 catalog (CommunityDragon)
    champion-stats.ts   # machine-written per-champion overlay
  lib/
    recommend.ts        # scoring engine + WEIGHTS (the heart)
    economy.ts          # dynamic shared-item-economy routing
    champions.ts        # merges champion catalog + stats overlay
    router.ts           # dependency-free hash router (#/champions/<id>)
    cost.ts · cx.ts     # TFT cost palette · classnames helper
  components/           # Header, SiteNav, ChampionCard, CostBadge,
                        # Results/ResultCard, ItemEconomyPanel, MatchRing, …
  pages/                # Recommender, ChampionsOverview, ChampionDetail
  App.tsx               # router shell: picks a page from the hash
```

---

## Keeping data fresh

Comp data is split in two so the numbers can be refreshed without touching the
hand-authored structure:

- **Structure** (units, traits, carries, items, playstyle…) lives in
  [`src/data/comps.ts`](src/data/comps.ts) and is edited by hand.
- **Performance numbers** (`avgPlace`, `top4`, `first`, `contested`) live in
  [`src/data/stats.ts`](src/data/stats.ts), a **machine-written overlay**. An
  empty overlay means "use the seed numbers in `comps.ts`", so the app behaves
  identically until the pipeline writes real values. Don't hand-edit it.

There are three ways to fill that overlay, from zero-effort-today to fully
hands-off:

### 1. Manual import — no API key (use this in the interim)
Read the numbers off any stats site, drop them in a JSON file, and apply them:

```bash
cp scripts/data-in.example.json scripts/data-in.json   # then edit the numbers
npm run import                                          # writes src/data/stats.ts
```

The importer validates every comp id and value range before writing. It's a
full replace — any comp you leave out falls back to its seed numbers.

### 2. Riot API crawl — dev key (test the real pipeline)
Get a key at [developer.riotgames.com](https://developer.riotgames.com), then:

```powershell
$env:RIOT_API_KEY="RGAPI-…"   # PowerShell;  bash: RIOT_API_KEY=RGAPI-… npm run refresh
npm run refresh -- --platform=na1 --seed-players=60
```

This seeds from the **Double Up ranked ladder** (challenger/grandmaster/master on
the `RANKED_TFT_DOUBLE_UP` queue — its own ladder, separate from standard ranked),
snowballs through the players it meets in `pairs` games, classifies each board
against your comp signatures, and recomputes the overlay. A dev key is throttled
(~1.3 s/call) and **expires every 24 h**, so it's for testing — not a standing
source. A ~260-request dev-key run yields ~1k boards and solid samples (n≈100–400)
for the meta comps.

### 3. Scheduled GitHub Action — production key (zero manual input)
[`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml) runs
the same crawl on a weekly cron and commits the diff. Add a repo secret
`RIOT_API_KEY` (a **production** key — get one approved so it doesn't expire),
and the data refreshes itself with no human in the loop. The app stays static;
only `stats.ts` changes, and the site rebuilds on the commit.

**Known limits of the crawl:** seeds come from the Double Up apex ladder (only a
few hundred players across challenger/grandmaster/master), so on a dev key the
request budget — not Double Up scarcity — is the real ceiling on sample size;
raise `--seed-players` / `--max-requests`, or use a production key, if samples
are thin. The classifier only recognizes comps you've already defined in
`comps.ts` (a new meta comp needs its signature added there). Riot reports Double
Up as **distinct 1..8 player placements**; the aggregator folds each team's two
adjacent slots into the **1..4 team scale** the seed numbers use (`avgPlace` =
team rank, `first` = won the game, `top4` = top half / top 2 teams), so refreshed
and seed comps stay on one scale.

### Champion data (the Champions page)
The champion browser uses the same catalog + overlay split as comps:

- **Catalog** — [`src/data/champions.ts`](src/data/champions.ts) (id, name, cost,
  traits, portrait/splash URLs) is **generated** from CommunityDragon's free static
  data (no API key). Regenerate it after a set or patch drops:

  ```bash
  npm run champions          # rewrites src/data/champions.ts (63 Set 17 units)
  ```

  Portraits hot-link CommunityDragon's CDN at runtime, so no images are bundled.

- **Performance** — [`src/data/champion-stats.ts`](src/data/champion-stats.ts)
  (avg place, top-4 %, first %, play rate, best items, best comps) is a
  **machine-written overlay**, empty until the crawl runs. An empty overlay means
  the page shows every unit with its stats blank ("no data yet"):

  ```powershell
  $env:RIOT_API_KEY="RGAPI-…"
  npm run refresh:champions -- --platform=na1 --seed-players=60
  ```

  This reuses the **same Double Up crawl** as `npm run refresh`, but tallies by
  individual unit instead of by comp: placement folds to the 1..4 team scale, play
  rate is the share of boards the unit appears on, best items are the unit's most-held
  *completed* combat items (resolved to name + icon via CommunityDragon, components and
  emblems filtered out), and best comps come from the same classifier the recommender
  uses. The scheduled Action refreshes this overlay alongside `stats.ts`.

---

## Data source & disclaimer

Seed values are a **Diamond+ Double Up snapshot from patches 17.3–17.4**
(metatft / tactics.tools / metabot). They shift every patch — treat them as a starting
point and update `src/data/comps.ts` as the meta moves. Not affiliated with Riot Games.

---

## Stretch ideas (not built yet)

1. **Per-region / per-elo data profiles** — have the refresh job emit several overlays
   (NA Challenger, EUW Master…) and let the UI switch between them, instead of one blended
   snapshot.
2. **Shareable result links** — encode the partner pick + prefs in the URL hash so a duo can
   send each other a ready-made recommendation.
3. **"Both players unknown" duo-pairing mode** — when neither comp is locked, suggest a full
   complementary pairing (one AD + one AP, split aggressive/scaling) instead of reacting to a
   fixed partner.

> Patch-data import (originally listed here) is now built — see **Keeping data fresh** above.
