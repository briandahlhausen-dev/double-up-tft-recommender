# Double Up TFT — Set 17 Comp Recommender

A single-page, fully client-side web app for **Teamfight Tactics Set 17 Double Up**.
Tell it the comp your duo partner is locking in, set a few quick preferences, and it
returns data-backed recommendations for what **you** should play — picked so your units
and items don't collide with your partner's and so your two boards complement each other.

- **Static-first.** No backend, no accounts, no database for the core app — all comp data lives in
  one typed module. The single optional networked extra is the **Live duo link** (real-time board
  sharing, below), and it's off unless you configure it.
- **Explainable engine.** Every recommendation comes with specific "why this pick" reasons
  that name the partner comp, the shared units, and the item types in play.
- **Tune it in one place.** Scoring weights live in a single exported `WEIGHTS` constant;
  the comp dataset is a single typed array.
- **Champions browser.** A second page (`#/champions`) lists every Set 17 unit with traits
  and art from CommunityDragon, plus per-champion Double Up stats — sortable, filterable, with
  click-through detail pages for best items and comps. Hash-routed, so detail URLs are shareable.
- **Live duo link.** Generate a code, send it to your duo, and watch each other's board update in
  real time — then **Compare** to get picks that complement theirs. Opt-in; falls back to a static
  share link when unconfigured.

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

### GitHub Pages — automated (recommended)
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and publishes
the site on every push to `main` using GitHub's native Pages deployment. **One-time
setup:** repo → **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
After that it's hands-off — pushes ship automatically, and a scheduled data refresh
(which commits via the Actions bot) redeploys through the workflow's `workflow_run`
hook. The site lands at `https://<user>.github.io/<repo>/`.

### GitHub Pages — manual (alternative)
```bash
npm run build
npx gh-pages -d dist        # publishes dist/ to the gh-pages branch
```
`base: './'` (see `vite.config.ts`) keeps asset paths relative, and the app is
hash-routed, so the project-subpath URLs Pages serves from work with no extra config
or 404 fallback.

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

### Live duo link (real-time board sharing)
Plan together: one player hits **⚡ Start live session** on the recommender, sends the 6-char code
(or a `#/live/<code>` link) to their duo, and both boards sync in real time — each person edits
their own board under **Build my board**, and **Compare ↓** loads the other's board as the partner
so the engine ranks what complements it. The session and your name persist across refreshes.

It stays true to the static-first design: it talks to a **Firebase Realtime Database over its REST
API — no SDK, no apiKey, no login** — just a database URL (public by design; rules restrict
read/write to `/rooms`, and the collection can't be enumerated). Each client writes only its own
member slot, so simultaneous edits merge instead of clobbering, and any network failure degrades
quietly. Set `RTDB_URL` in [`src/lib/liveConfig.ts`](src/lib/liveConfig.ts) to enable it — leave it
`''` and the feature is dormant and the app stays 100% static. That file's header has the ~3-minute
Firebase setup (create a Realtime Database, paste these rules, copy the URL):

```json
{ "rules": { "rooms": { "$room": { ".read": true, ".write": true } } } }
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
and seed comps stay on one scale. Finally, **Set 17 Double Up matches expose no augments** through
the match API (the set runs a missions mechanic instead), so the augment overlay
(`augment-stats.ts`) stays empty for this set — that's expected, not a failure, and the comp guide
degrades gracefully.

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

### Theorycraft & the Lab (offline math — mostly keyless)
The Lab's unit DPS/EHP model and the comp-discovery engine run on numbers
extracted from CommunityDragon — no Riot key, no runtime API. Three offline
steps, all committed into `src/data/` so the app stays 100% static:

```bash
npm run build:math        # src/data/unit-math.ts — base stats, ability variables,
                          # item/trait math + raw ability descriptions (keyless)
npm run build:formulas    # src/data/ability-formulas.ts — exact per-cast damage
npm run build:theorycraft # src/data/theorycraft.ts — discovered high-synergy boards
```

**Stage 3 (`build:formulas`).** The name-only ability heuristic can't tell a
"big nuke every 5th cast" (Sona) from a single hit, a 12-strike volley (Bel'Veth)
from one hit, or a multi-second channel (Mordekaiser, Pantheon) from an instant
nuke — and it mis-scales neutrally-named AD bursts (Graves, Samira) as AP. So an
offline pass reads each ability's **description** and pins an exact per-cast
formula — an arithmetic expression over the ability's own variables — evaluated
per star into plain numbers the runtime reads (it never parses the string).

A **committed seed of 23 formulas** (hand-verified + authored from the tooltips)
runs with **no key** and covers the cases the heuristic provably gets wrong. To
fill in the remaining units, the generator asks Claude for the *structure* only —
code does the arithmetic — and it authenticates **two ways**:

```powershell
# Preferred — your Claude subscription, $0 against API credits:
claude setup-token                          # one-time: prints a long-lived token
$env:CLAUDE_CODE_OAUTH_TOKEN="…"            # offline / CI only — NEVER shipped to the client
npm run build:formulas

# Or — the metered Anthropic API:
$env:ANTHROPIC_API_KEY="sk-ant-…"           # offline / CI only — NEVER shipped to the client
npm run build:formulas
```

When the subscription token is set the generator shells out to the Claude Code
CLI (`claude -p … --output-format json`) and **strips `ANTHROPIC_API_KEY` from the
child env** so it can't silently fall back to metered billing; `USE_CLAUDE_CLI=1`
forces the CLI path with a local `claude` login. Either credential lives **only**
in CI (a repo secret) or your shell — never read at runtime, never bundled. The
scheduled Action runs this step automatically when **either** secret is present
(subscription first), and keeps the committed seed formulas when neither is.

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
2. **"Both players unknown" duo-pairing mode** — when neither comp is locked, suggest a full
   complementary pairing (one AD + one AP, split aggressive/scaling) instead of reacting to a
   fixed partner.

> Patch-data import (originally listed here) is now built — see **Keeping data fresh** above.
>
> Shareable board links + real-time duo sync (originally listed here) are now built — see
> **Live duo link** above.
