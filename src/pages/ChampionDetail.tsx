import type { ReactNode } from 'react';
import { getChampion, CHAMPION_STATS_UPDATED_AT, CHAMPION_STATS_SOURCE } from '../lib/champions';
import type { ChampionStats } from '../types';
import { costStyle } from '../lib/cost';
import { cx } from '../lib/cx';
import { tierForStats, tierStyle, TIER_BLURB } from '../lib/tier';
import { CostBadge } from '../components/CostBadge';
import { TierBadge } from '../components/TierBadge';
import { MatchRing } from '../components/MatchRing';
import { SiteFooter } from '../components/SiteFooter';

export function ChampionDetail({ id }: { id: string }) {
  const champ = getChampion(id);

  if (!champ) {
    return (
      <div className="glass p-10 text-center">
        <p className="font-display text-lg text-white">Champion not found</p>
        <p className="mt-1 text-sm text-slate-400">No Set 17 unit matches “{id}”.</p>
        <a href="#/champions" className="mt-4 inline-block text-sm font-semibold text-nebula hover:text-violet-300">
          ← Back to all champions
        </a>
      </div>
    );
  }

  const s = costStyle(champ.cost);
  const stats = champ.stats;
  const tier = tierForStats(stats);

  return (
    <>
      <a href="#/champions" className="no-print inline-flex items-center text-sm font-semibold text-slate-400 hover:text-white">
        ← All champions
      </a>

      {/* ---- Hero ---- */}
      <section className="glass relative mt-3 overflow-hidden p-5 sm:p-6">
        <img
          src={champ.splash}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-cosmos-950 via-cosmos-950/85 to-cosmos-950/40" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <img
            src={champ.portrait}
            alt={champ.name}
            className={cx('h-24 w-24 shrink-0 rounded-2xl object-cover ring-2', s.ring, s.glow)}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CostBadge cost={champ.cost} />
              <span className="font-display text-[11px] uppercase tracking-wider text-slate-400">{champ.cost}-cost</span>
            </div>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {champ.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {champ.traits.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {tier && (
            <div className={cx('shrink-0 self-start rounded-2xl border px-4 py-3 text-center sm:ml-auto sm:self-center', tierStyle(tier).border, tierStyle(tier).bg)}>
              <TierBadge tier={tier} size="lg" className="mx-auto" />
              <div className="mt-1.5 font-display text-[10px] uppercase tracking-wider text-slate-300">Tier</div>
            </div>
          )}
        </div>

        {tier && (
          <p className={cx('relative mt-4 text-sm', tierStyle(tier).text)}>
            <span className="font-semibold">Tier {tier}.</span>{' '}
            <span className="text-slate-300">{TIER_BLURB[tier]}</span>
          </p>
        )}
      </section>

      {stats ? (
        <ChampionStatsBody name={champ.name} accent={s} stats={stats} />
      ) : (
        <NoData name={champ.name} />
      )}

      <SiteFooter>
        {stats && CHAMPION_STATS_UPDATED_AT && (
          <p>
            Double Up data{CHAMPION_STATS_SOURCE ? ` (${CHAMPION_STATS_SOURCE})` : ''}, updated{' '}
            {new Date(CHAMPION_STATS_UPDATED_AT).toLocaleDateString()} · {stats.sampleSize.toLocaleString()} boards.
          </p>
        )}
      </SiteFooter>
    </>
  );
}

function ChampionStatsBody({
  name,
  accent,
  stats,
}: {
  name: string;
  accent: ReturnType<typeof costStyle>;
  stats: ChampionStats;
}) {
  return (
    <>
      {/* ---- Stat row ---- */}
      <section className="glass mt-5 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <MatchRing pct={stats.top4} accent="mix" size={92} />
            <div>
              <div className="font-display text-3xl font-bold text-white">
                {stats.avgPlace.toFixed(2)}
                <span className="ml-1.5 text-sm font-medium text-slate-500">out of 4</span>
              </div>
              <div className="font-display text-[10px] uppercase tracking-wider text-slate-400">Avg team placement</div>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Top 4" value={`${stats.top4}%`} />
            <Stat label="First" value={`${stats.first}%`} />
            <Stat label="Play rate" value={`${stats.pickRate}%`} />
            <Stat label="Boards" value={stats.sampleSize.toLocaleString()} />
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ---- Best items ---- */}
        <section className="glass p-5">
          <h2 className="font-display text-sm uppercase tracking-wider text-slate-300">Best items</h2>
          {stats.bestItems.length ? (
            <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {stats.bestItems.map((it) => (
                <li key={it.name} className="flex items-center gap-3">
                  {it.icon && (
                    <img src={it.icon} alt="" className="h-8 w-8 shrink-0 rounded-md ring-1 ring-white/10" loading="lazy" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{it.name}</span>
                  {/* Clamp defends the display against stale pre-fix data where a
                      stacked item (e.g. 3× Nashor's) could read >100%. */}
                  <span className="font-display text-sm font-semibold text-white">{Math.min(100, it.pct)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No item data yet for {name}.</p>
          )}
        </section>

        {/* ---- Best comps ---- */}
        <section className="glass p-5">
          <h2 className="font-display text-sm uppercase tracking-wider text-slate-300">Plays best in</h2>
          {stats.bestComps.length ? (
            <ul className="mt-3 space-y-2">
              {stats.bestComps.map((c) => (
                <li
                  key={c.id}
                  className={cx('flex items-center justify-between gap-3 rounded-xl border px-3 py-2', accent.border, 'bg-white/[0.02]')}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{c.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{c.n.toLocaleString()} boards</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No comp data yet for {name}.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
      <div className="font-display text-lg font-bold text-white">{value}</div>
      <div className="font-display text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function NoData({ name }: { name: string }) {
  return (
    <section className="glass mt-5 p-8 text-center">
      <p className="font-display text-lg text-white">No Double Up data yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
        {name}&apos;s placement, item, and comp stats appear here once the Double Up crawl has run. The catalog and art
        are live now; performance is filled in by the data pipeline.
      </p>
      <code className="mt-3 inline-block rounded bg-white/5 px-2 py-1 text-xs text-slate-300">
        npm run refresh:champions
      </code>
    </section>
  );
}
