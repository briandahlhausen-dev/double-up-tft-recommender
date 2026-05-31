import type { Contested } from '../types';
import { cx } from '../lib/cx';

const MAP: Record<Contested, { label: string; cls: string }> = {
  low: { label: 'Low contest', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40' },
  moderate: { label: 'Moderate contest', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/40' },
  high: { label: 'High contest', cls: 'bg-orange-500/15 text-orange-300 ring-orange-500/40' },
  severe: { label: 'Severe contest', cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/40' },
};

export function ContestedBadge({ level }: { level: Contested }) {
  const m = MAP[level];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', m.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </span>
  );
}
