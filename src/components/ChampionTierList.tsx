import type { ChampionView } from '../types';
import { TIER_ORDER, tierForStats, tierStyle } from '../lib/tier';
import type { Tier } from '../lib/tier';
import { costStyle } from '../lib/cost';
import { championHref } from '../lib/router';
import { cx } from '../lib/cx';

type Row = { tier: Tier | 'U'; items: ChampionView[] };

/** Classic tier-list layout — graded rows (S→D) of compact unit tiles. */
export function ChampionTierList({ champions }: { champions: ChampionView[] }) {
  const groups = new Map<Tier | 'U', ChampionView[]>();
  for (const c of champions) {
    const key: Tier | 'U' = tierForStats(c.stats) ?? 'U';
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }

  const rows: Row[] = [];
  for (const t of TIER_ORDER) {
    const items = groups.get(t);
    if (items?.length) rows.push({ tier: t, items });
  }
  const unrated = groups.get('U');
  if (unrated?.length) rows.push({ tier: 'U', items: unrated });

  if (rows.length === 0) {
    return <div className="glass p-10 text-center text-sm text-slate-400">No champions match those filters.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map(({ tier, items }) => {
        const rated = tier !== 'U';
        const ts = rated ? tierStyle(tier) : null;
        return (
          <div key={tier} className="glass flex overflow-hidden p-0">
            <div
              className={cx(
                'flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-r sm:w-16',
                rated ? cx(ts!.border, ts!.bg) : 'border-white/10 bg-white/[0.03]',
              )}
            >
              <span className={cx('font-display text-2xl font-black sm:text-3xl', rated ? ts!.text : 'text-slate-500')}>
                {rated ? tier : '–'}
              </span>
              <span className="text-[10px] text-slate-400">{items.length}</span>
            </div>
            <div className="flex flex-wrap gap-2 p-2.5 sm:p-3">
              {items.map((c) => (
                <TierTile key={c.id} champ={c} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TierTile({ champ }: { champ: ChampionView }) {
  const cs = costStyle(champ.cost);
  return (
    <a
      href={championHref(champ.id)}
      title={champ.stats ? `${champ.name} · avg ${champ.stats.avgPlace.toFixed(2)}` : champ.name}
      className="group flex w-14 flex-col items-center gap-1 sm:w-16"
    >
      <span
        className={cx(
          'relative aspect-square w-full overflow-hidden rounded-lg ring-2 transition group-hover:ring-white/60',
          cs.ring,
        )}
      >
        <img src={champ.portrait} alt="" loading="lazy" className="h-full w-full object-cover" />
        <span className={cx('absolute bottom-0 left-0 rounded-tr px-1 text-[9px] font-bold leading-tight', cs.bg, cs.text)}>
          {champ.cost}
        </span>
      </span>
      <span className="w-full truncate text-center text-[10px] leading-tight text-slate-400 group-hover:text-white">
        {champ.name}
      </span>
    </a>
  );
}
