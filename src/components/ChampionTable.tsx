import type { ChampionView } from '../types';
import type { Sort } from '../lib/championFilters';
import { costStyle } from '../lib/cost';
import { championHref } from '../lib/router';
import { cx } from '../lib/cx';
import { tierForStats } from '../lib/tier';
import { CostBadge } from './CostBadge';
import { TierBadge } from './TierBadge';

interface Col {
  label: string;
  sort: Sort | null; // null = not sortable
  align: 'left' | 'right' | 'center';
  hideSm?: boolean; // collapse on narrow screens
}

const COLS: Col[] = [
  { label: 'Champion', sort: 'name', align: 'left' },
  { label: 'Cost', sort: 'cost', align: 'center' },
  { label: 'Traits', sort: null, align: 'left', hideSm: true },
  { label: 'Tier', sort: null, align: 'center' },
  { label: 'Avg', sort: 'avgPlace', align: 'right' },
  { label: 'Top 4', sort: 'top4', align: 'right' },
  { label: 'First', sort: 'first', align: 'right', hideSm: true },
  { label: 'Play', sort: 'pickRate', align: 'right' },
];

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/** Dense, sortable stats table — the tactics.tools-style leaderboard view. */
export function ChampionTable({
  champions,
  sort,
  onSort,
}: {
  champions: ChampionView[];
  sort: Sort;
  onSort: (s: Sort) => void;
}) {
  const go = (id: string) => {
    window.location.hash = championHref(id).slice(1); // championHref already starts with '#'
  };

  return (
    <div className="glass overflow-x-auto p-0">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {COLS.map((col) => {
              const active = col.sort !== null && col.sort === sort;
              return (
                <th
                  key={col.label}
                  scope="col"
                  className={cx(
                    'px-3 py-2.5 font-display text-[10px] font-bold uppercase tracking-wider',
                    ALIGN[col.align],
                    col.hideSm && 'hidden md:table-cell',
                    active ? 'text-nebula' : 'text-slate-400',
                  )}
                >
                  {col.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.sort!)}
                      className="inline-flex items-center gap-1 transition hover:text-white"
                    >
                      {col.label}
                      <span className={cx('text-[8px]', active ? 'opacity-100' : 'opacity-0')}>▼</span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {champions.map((c) => {
            const cs = costStyle(c.cost);
            const tier = tierForStats(c.stats);
            return (
              <tr
                key={c.id}
                onClick={() => go(c.id)}
                className="cursor-pointer border-b border-white/5 transition last:border-0 hover:bg-white/[0.04]"
              >
                {/* Champion */}
                <td className="px-3 py-2">
                  <a
                    href={championHref(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2.5 focus:outline-none"
                  >
                    <img
                      src={c.portrait}
                      alt=""
                      loading="lazy"
                      className={cx('h-9 w-9 shrink-0 rounded-md object-cover ring-2', cs.ring)}
                    />
                    <span className="truncate font-medium text-white hover:text-nebula">{c.name}</span>
                  </a>
                </td>
                {/* Cost */}
                <td className="px-3 py-2 text-center">
                  <CostBadge cost={c.cost} />
                </td>
                {/* Traits */}
                <td className="hidden px-3 py-2 md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {c.traits.map((t) => (
                      <span key={t} className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                {/* Tier */}
                <td className="px-3 py-2 text-center">
                  {tier ? <TierBadge tier={tier} size="sm" className="mx-auto" /> : <span className="text-slate-600">—</span>}
                </td>
                {/* Avg */}
                <td className="px-3 py-2 text-right font-display font-semibold text-white">
                  {c.stats ? c.stats.avgPlace.toFixed(2) : <span className="font-body text-slate-600">—</span>}
                </td>
                {/* Top 4 */}
                <td className="px-3 py-2 text-right text-emerald-300">
                  {c.stats ? `${c.stats.top4}%` : <span className="text-slate-600">—</span>}
                </td>
                {/* First */}
                <td className="hidden px-3 py-2 text-right text-slate-200 md:table-cell">
                  {c.stats ? `${c.stats.first}%` : <span className="text-slate-600">—</span>}
                </td>
                {/* Play */}
                <td className="px-3 py-2 text-right text-slate-300">
                  {c.stats ? `${c.stats.pickRate}%` : <span className="text-slate-600">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
