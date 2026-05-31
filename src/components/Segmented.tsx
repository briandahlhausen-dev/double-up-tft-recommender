import { cx } from '../lib/cx';

export interface SegOption<T extends string> {
  value: T;
  label: string;
  accent?: 'ad' | 'ap' | 'neutral';
}

interface Props<T extends string> {
  label: string;
  hint?: string;
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ label, hint, value, options, onChange }: Props<T>) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-display text-xs uppercase tracking-wider text-slate-300">{label}</span>
        {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
      </div>
      <div className="flex gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
        {options.map((opt) => {
          const active = opt.value === value;
          const accent = opt.accent ?? 'neutral';
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cx(
                'seg-btn flex-1 whitespace-nowrap',
                !active && 'hover:bg-white/5',
                active && accent === 'ad' && 'bg-ad/20 text-ad-light ring-1 ring-ad/50',
                active && accent === 'ap' && 'bg-ap/20 text-ap-light ring-1 ring-ap/50',
                active && accent === 'neutral' && 'bg-nebula/25 text-white ring-1 ring-nebula/50',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
