import type { Comp } from '../types';
import { itemEconomy } from '../lib/economy';
import type { EconomyColumn } from '../lib/economy';
import { cx } from '../lib/cx';

export function ItemEconomyPanel({ mine, partner }: { mine: Comp; partner: Comp }) {
  const econ = itemEconomy(mine, partner);

  return (
    <section className="glass p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Shared Item Economy</h2>
        <span className="text-xs text-slate-400">based on your #1 pick vs your partner</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Who scoops which component shards off the carousel so nobody&apos;s carry sits item-starved.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {econ.columns.map((col) => (
          <Column key={col.owner} col={col} />
        ))}
      </div>

      <p
        className={cx(
          'mt-4 rounded-xl border p-3 text-sm',
          econ.collision
            ? 'border-rose-500/30 bg-rose-500/5 text-rose-200'
            : 'border-white/10 bg-white/[0.02] text-slate-300',
        )}
      >
        {econ.note}
      </p>
    </section>
  );
}

function Column({ col }: { col: EconomyColumn }) {
  return (
    <div
      className={cx(
        'rounded-xl border p-3',
        col.accent === 'ad' && 'border-ad/30 bg-ad/[0.06]',
        col.accent === 'ap' && 'border-ap/30 bg-ap/[0.06]',
        col.accent === 'neutral' && 'border-white/10 bg-white/[0.02]',
      )}
    >
      <div
        className={cx(
          'font-display text-xs font-bold uppercase tracking-wide',
          col.accent === 'ad' && 'text-ad-light',
          col.accent === 'ap' && 'text-ap-light',
          col.accent === 'neutral' && 'text-slate-300',
        )}
      >
        {col.title}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {col.shards.map((s) => (
          <span key={s} className="chip py-0.5 text-[11px]">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
