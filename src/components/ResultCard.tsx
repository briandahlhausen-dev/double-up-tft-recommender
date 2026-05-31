import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DamageType } from '../types';
import type { ReasonTone, ScoredComp } from '../lib/recommend';
import { cx } from '../lib/cx';
import { MatchRing } from './MatchRing';
import { ContestedBadge } from './ContestedBadge';
import { DamageTag } from './DamageTag';

const RING_ACCENT: Record<DamageType, 'ad' | 'ap' | 'mix'> = {
  AD: 'ad',
  AP: 'ap',
  hybrid: 'mix',
};

const TONE_DOT: Record<ReasonTone, string> = {
  positive: 'bg-emerald-400',
  negative: 'bg-rose-400',
  neutral: 'bg-slate-400',
};

export function ResultCard({
  scored,
  rank,
  defaultOpen = false,
}: {
  scored: ScoredComp;
  rank: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { comp, matchPct, reasons } = scored;
  const isTop = rank === 1;

  return (
    <article
      className={cx(
        'glass animate-fade-up flex flex-col p-4 sm:p-5',
        isTop && 'ring-1 ring-nebula/40 shadow-glow-violet',
      )}
      style={{ animationDelay: `${Math.min(rank, 6) * 45}ms` }}
    >
      <div className="flex items-start gap-3">
        <div
          className={cx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold',
            isTop ? 'bg-nebula text-white' : 'bg-white/10 text-slate-200',
          )}
        >
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold leading-tight text-white">{comp.name}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {comp.traits.map((t) => (
              <span key={t} className="chip py-0.5 text-[10px]">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <MatchRing pct={matchPct} accent={RING_ACCENT[comp.primaryDamage]} size={isTop ? 72 : 58} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ContestedBadge level={comp.contested} />
        <span className="chip">{comp.levelStrategy}</span>
      </div>

      {/* Carries */}
      <div className="mt-3 space-y-2">
        {comp.carries.map((cr) => (
          <div key={cr.name} className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <div className="flex items-center gap-2">
              <DamageTag type={cr.damageType} />
              <span className="text-sm font-semibold text-white">{cr.name}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {cr.items.map((it) => (
                <span
                  key={it}
                  className={cx(
                    'chip py-0.5 text-[11px]',
                    cr.damageType === 'AD' && 'border-ad/30',
                    cr.damageType === 'AP' && 'border-ap/30',
                    cr.damageType === 'hybrid' && 'border-nebula/30',
                  )}
                >
                  {it}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Why this pick */}
      <div className="mt-3">
        <h4 className="font-display text-xs uppercase tracking-wider text-slate-300">Why this pick</h4>
        <ul className="mt-1.5 space-y-1.5">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex gap-2 text-sm leading-snug">
              <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[r.tone])} aria-hidden />
              <span className="print-text text-slate-300">{r.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Details */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="no-print mt-3 inline-flex items-center gap-1 self-start text-xs font-semibold text-nebula transition hover:text-violet-300"
      >
        {open ? 'Hide details' : 'Show details'}
        <svg className={cx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      <div className={cx('print-open mt-3 space-y-3 border-t border-white/5 pt-3', !open && 'hidden')}>
        <Detail label="Frontline">
          {comp.frontline.map((f) => (
            <span key={f} className="chip py-0.5 text-[11px]">
              {f}
            </span>
          ))}
        </Detail>
        <Detail label="Augment archetypes">
          {comp.augments.map((a) => (
            <span key={a} className="chip py-0.5 text-[11px]">
              {a}
            </span>
          ))}
        </Detail>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Avg place" value={comp.avgPlace.toFixed(2)} />
          <Stat label="Top 4" value={`${comp.top4}%`} />
          <Stat label="First" value={`${comp.first}%`} />
        </div>
      </div>
    </article>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-center">
      <div className="font-display text-sm font-bold text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
