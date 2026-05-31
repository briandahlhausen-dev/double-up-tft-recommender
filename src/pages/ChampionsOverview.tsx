import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAMPIONS_VIEW, ALL_TRAITS, HAS_CHAMPION_STATS, CHAMPION_STATS_UPDATED_AT } from '../lib/champions';
import { ChampionCard } from '../components/ChampionCard';
import { ChampionTable } from '../components/ChampionTable';
import { ChampionTierList } from '../components/ChampionTierList';
import { SiteFooter } from '../components/SiteFooter';
import { cx } from '../lib/cx';
import { filterAndSort } from '../lib/championFilters';
import type { CostFilter, Sort, TierFilter, View } from '../lib/championFilters';
import { TIER_ORDER, tierStyle } from '../lib/tier';

const COST_OPTIONS: CostFilter[] = ['all', 1, 2, 3, 4, 5];
const TIER_OPTIONS: TierFilter[] = ['all', ...TIER_ORDER];
const VIEW_OPTIONS: { id: View; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'table', label: 'Table' },
  { id: 'tiers', label: 'Tier list' },
];

export function ChampionsOverview() {
  const [q, setQ] = useState('');
  const [cost, setCost] = useState<CostFilter>('all');
  const [trait, setTrait] = useState<string>('all');
  const [tier, setTier] = useState<TierFilter>('all');
  const [sort, setSort] = useState<Sort>(HAS_CHAMPION_STATS ? 'avgPlace' : 'cost');
  const [view, setView] = useState<View>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

  // Power-user nicety every stats site has: press "/" to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (typing) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shown = useMemo(
    () => filterAndSort(CHAMPIONS_VIEW, { q, cost, trait, tier, sort }),
    [q, cost, trait, tier, sort],
  );

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Set 17 <span className="text-nebula">Champions</span>
        </h1>
        <p className="max-w-2xl text-sm text-slate-300">
          Every Set 17 unit, graded by Double Up performance. Click a champion for best items, comps, and a full stat
          breakdown.
        </p>
        <p className="text-xs text-slate-500">
          {CHAMPIONS_VIEW.length} champions ·{' '}
          {HAS_CHAMPION_STATS && CHAMPION_STATS_UPDATED_AT
            ? `stats updated ${new Date(CHAMPION_STATS_UPDATED_AT).toLocaleDateString()}`
            : 'performance data not yet crawled'}
        </p>
      </header>

      {/* ---- Filter bar ---- */}
      <section className="glass mt-5 flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Search</span>
            <div className="relative">
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Champion or trait…"
                className="w-full rounded-xl border border-white/10 bg-cosmos-900/60 px-3 py-2 pr-8 text-sm text-slate-200 placeholder:text-slate-500 focus:border-nebula/50 focus:outline-none focus:ring-1 focus:ring-nebula/50"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-display text-[10px] text-slate-500">
                /
              </kbd>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Trait</span>
            <select
              value={trait}
              onChange={(e) => setTrait(e.target.value)}
              className="rounded-xl border border-white/10 bg-cosmos-900/60 px-3 py-2 text-sm text-slate-200 focus:border-nebula/50 focus:outline-none focus:ring-1 focus:ring-nebula/50"
            >
              <option value="all">All traits</option>
              {ALL_TRAITS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-xl border border-white/10 bg-cosmos-900/60 px-3 py-2 text-sm text-slate-200 focus:border-nebula/50 focus:outline-none focus:ring-1 focus:ring-nebula/50"
            >
              {HAS_CHAMPION_STATS && <option value="avgPlace">Avg place ↑</option>}
              {HAS_CHAMPION_STATS && <option value="top4">Top 4 %</option>}
              {HAS_CHAMPION_STATS && <option value="first">First %</option>}
              {HAS_CHAMPION_STATS && <option value="pickRate">Play rate</option>}
              <option value="cost">Cost ↑</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>

          {/* View toggle */}
          <div className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">View</span>
            <div className="flex gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
              {VIEW_OPTIONS.map((v) => {
                // Tier list needs stats to grade; hide it when there's no data.
                if (v.id === 'tiers' && !HAS_CHAMPION_STATS) return null;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={view === v.id}
                    onClick={() => setView(v.id)}
                    className={cx(
                      'seg-btn px-3 py-1.5 text-xs',
                      view === v.id ? 'bg-nebula/25 text-white ring-1 ring-nebula/50' : 'hover:bg-white/5',
                    )}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cost filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 font-display text-[10px] uppercase tracking-wider text-slate-400">Cost</span>
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
            {COST_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cost === c}
                onClick={() => setCost(c)}
                className={cx(
                  'seg-btn px-3 py-1.5 text-xs',
                  cost === c ? 'bg-nebula/25 text-white ring-1 ring-nebula/50' : 'hover:bg-white/5',
                )}
              >
                {c === 'all' ? 'All' : `${c}-cost`}
              </button>
            ))}
          </div>
        </div>

        {/* Tier filter — only meaningful with stats */}
        {HAS_CHAMPION_STATS && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-10 font-display text-[10px] uppercase tracking-wider text-slate-400">Tier</span>
            <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
              {TIER_OPTIONS.map((t) => {
                const active = tier === t;
                const ts = t === 'all' ? null : tierStyle(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTier(t)}
                    className={cx(
                      'seg-btn px-3 py-1.5 text-xs font-bold',
                      active && ts && cx(ts.bg, ts.text, 'ring-1', ts.ring),
                      active && !ts && 'bg-nebula/25 text-white ring-1 ring-nebula/50',
                      !active && 'hover:bg-white/5',
                    )}
                  >
                    {t === 'all' ? 'All' : t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ---- Results ---- */}
      <section className="mt-5">
        {shown.length === 0 ? (
          <div className="glass p-10 text-center text-sm text-slate-400">No champions match those filters.</div>
        ) : view === 'table' ? (
          <ChampionTable champions={shown} sort={sort} onSort={setSort} />
        ) : view === 'tiers' ? (
          <ChampionTierList champions={shown} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {shown.map((champ) => (
              <ChampionCard key={champ.id} champ={champ} />
            ))}
          </div>
        )}
        <p className="mt-3 text-right text-xs text-slate-500">{shown.length} shown</p>
      </section>

      <SiteFooter>
        {!HAS_CHAMPION_STATS && (
          <p>
            Champion catalog and art come from CommunityDragon. Per-champion Double Up stats populate after the crawl —
            run <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">npm run refresh:champions</code>.
          </p>
        )}
      </SiteFooter>
    </>
  );
}
