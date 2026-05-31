import type { ChampionView } from '../types';
import { costStyle } from '../lib/cost';
import { championHref } from '../lib/router';
import { cx } from '../lib/cx';
import { tierForStats } from '../lib/tier';
import { CostBadge } from './CostBadge';
import { TierBadge } from './TierBadge';

export function ChampionCard({ champ }: { champ: ChampionView }) {
  const s = costStyle(champ.cost);
  const tier = tierForStats(champ.stats);
  return (
    <a
      href={championHref(champ.id)}
      className="group glass flex flex-col overflow-hidden p-0 transition duration-150 hover:-translate-y-0.5 hover:border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-nebula/60"
    >
      <div className={cx('relative aspect-square w-full overflow-hidden ring-1 ring-inset', s.ring)}>
        <img
          src={champ.portrait}
          alt={champ.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cosmos-950/90 to-transparent" />
        <CostBadge cost={champ.cost} className="absolute left-1.5 top-1.5" />
        {tier && <TierBadge tier={tier} size="sm" className="absolute right-1.5 top-1.5 shadow-sm" />}
        <div className="absolute inset-x-0 bottom-0 p-2">
          <h3 className="truncate font-display text-sm font-semibold text-white drop-shadow">{champ.name}</h3>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="flex flex-wrap gap-1">
          {champ.traits.map((t) => (
            <span key={t} className="chip px-1.5 py-0.5 text-[10px]">
              {t}
            </span>
          ))}
        </div>
        {champ.stats ? (
          <div className="mt-auto flex items-center gap-1.5 pt-1 text-[10px] text-slate-400">
            <span>
              Avg <span className="font-semibold text-white">{champ.stats.avgPlace.toFixed(2)}</span>
            </span>
            <span className="text-slate-600">·</span>
            <span>
              Top 4 <span className="font-semibold text-emerald-300">{champ.stats.top4}%</span>
            </span>
            <span className="text-slate-600">·</span>
            <span>
              Play <span className="font-semibold text-slate-200">{champ.stats.pickRate}%</span>
            </span>
          </div>
        ) : (
          <div className="mt-auto pt-1 text-[10px] text-slate-600">no data yet</div>
        )}
      </div>
    </a>
  );
}
