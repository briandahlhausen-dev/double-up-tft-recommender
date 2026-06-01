import { useState } from 'react';
import type { BoardFit } from '../lib/recommend';
import type { DamageType } from '../types';
import { CHAMPIONS } from '../data/champions';
import { cx } from '../lib/cx';
import { MatchRing } from './MatchRing';
import { ContestedBadge } from './ContestedBadge';
import { TierBadge } from './TierBadge';
import { DamageTag } from './DamageTag';
import { useCompGuide } from './CompGuide';
import { tierForAvgPlace } from '../lib/tier';

// ---------------------------------------------------------------------------
// Results for the "build my board" flow. Where ResultCard answers "how well does
// this comp complement my partner", these cards answer "how close am I to this
// comp" — leading with the roster you already own vs. still need, then the
// payoff carries, then why it fits.
// ---------------------------------------------------------------------------

const RING_ACCENT: Record<DamageType, 'ad' | 'ap' | 'mix'> = { AD: 'ad', AP: 'ap', hybrid: 'mix' };
const TONE_DOT = { positive: 'bg-emerald-400', negative: 'bg-rose-400', neutral: 'bg-slate-400' } as const;
const CHAMP_BY_NAME = new Map(CHAMPIONS.map((c) => [c.name, c] as const));

/** One roster unit as a portrait dot — bright if you own it, dimmed if you don't. */
function UnitDot({ name, owned }: { name: string; owned: boolean }) {
  const c = CHAMP_BY_NAME.get(name);
  return (
    <span
      title={owned ? `${name} — you have this` : `${name} — still need`}
      className={cx('relative block h-8 w-8 overflow-hidden rounded-md ring-2', owned ? 'ring-nebula' : 'ring-white/10')}
    >
      {c ? (
        <img src={c.portrait} alt={name} loading="lazy" className={cx('h-full w-full object-cover', !owned && 'opacity-40 grayscale')} />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-white/5 text-[9px] text-slate-400">{name.slice(0, 3)}</span>
      )}
      {owned && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-nebula px-0.5 text-[8px] font-black leading-tight text-white">✓</span>
      )}
    </span>
  );
}

function BuildResultCard({ fit, rank }: { fit: BoardFit; rank: number }) {
  const { comp, fitPct, have, missing, haveCarries, reasons } = fit;
  const guide = useCompGuide();
  const isTop = rank === 1;
  const tier = tierForAvgPlace(comp.avgPlace);

  return (
    <article
      className={cx('glass animate-fade-up flex flex-col p-4 sm:p-5', isTop && 'ring-1 ring-nebula/40 shadow-glow-violet')}
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
          <MatchRing pct={fitPct} accent={RING_ACCENT[comp.primaryDamage]} size={isTop ? 72 : 58} />
          <span className="mt-1 font-display text-[10px] uppercase tracking-wider text-slate-400">fit</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TierBadge tier={tier} />
        <ContestedBadge level={comp.contested} />
        <span className="chip">{comp.levelStrategy}</span>
      </div>

      {/* Roster fit — the headline of this flow */}
      <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[10px] uppercase tracking-wider text-emerald-300">
            You have {have.length}/{have.length + missing.length}
          </span>
          {missing.length > 0 && (
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-500">need {missing.length} more</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {have.map((u) => (
            <UnitDot key={u} name={u} owned />
          ))}
          {missing.map((u) => (
            <UnitDot key={u} name={u} owned={false} />
          ))}
        </div>
      </div>

      {/* Carries — owned ones lit up */}
      <div className="mt-3 space-y-2">
        {comp.carries.map((cr) => {
          const owned = haveCarries.includes(cr.name);
          return (
            <div
              key={cr.name}
              className={cx('rounded-xl border p-2.5', owned ? 'border-nebula/30 bg-nebula/5' : 'border-white/5 bg-white/[0.02]')}
            >
              <div className="flex items-center gap-2">
                <DamageTag type={cr.damageType} />
                <span className="text-sm font-semibold text-white">{cr.name}</span>
                <span
                  className={cx(
                    'ml-auto text-[10px] font-bold uppercase tracking-wide',
                    owned ? 'text-emerald-300' : 'text-slate-500',
                  )}
                >
                  {owned ? '✓ owned' : 'need'}
                </span>
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
          );
        })}
      </div>

      {/* Why this fits */}
      <div className="mt-3">
        <h4 className="font-display text-xs uppercase tracking-wider text-slate-300">Why this fits</h4>
        <ul className="mt-1.5 space-y-1.5">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex gap-2 text-sm leading-snug">
              <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[r.tone])} aria-hidden />
              <span className="text-slate-300">{r.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Guide CTA — positioning + augments, opens the comp guide overlay */}
      <button
        type="button"
        onClick={() => guide.open(comp)}
        className="no-print mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-nebula/40 bg-nebula/10 px-3 py-2 font-display text-xs font-bold uppercase tracking-wide text-violet-200 transition hover:border-nebula/70 hover:bg-nebula/20 hover:text-white"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zm-8 8h6v6H3v-6zm8 0h6v6h-6v-6z" />
        </svg>
        Positioning &amp; augments
      </button>

      {/* Standalone strength */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
        <Stat label="Avg place" value={comp.avgPlace.toFixed(2)} />
        <Stat label="Top 4" value={`${comp.top4}%`} />
        <Stat label="First" value={`${comp.first}%`} />
      </div>
    </article>
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

export function BuildResults({ results }: { results: BoardFit[] }) {
  const [showMore, setShowMore] = useState(false);
  const top = results.slice(0, 3);
  const rest = results.slice(3);

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {top.map((f, i) => (
          <BuildResultCard key={f.comp.id} fit={f} rank={i + 1} />
        ))}
      </div>

      {rest.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowMore((m) => !m)}
            className="no-print mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-nebula/40 hover:text-white"
          >
            {showMore ? 'Hide' : 'Show'} {rest.length} more comp{rest.length > 1 ? 's' : ''}
            <svg className={cx('h-4 w-4 transition-transform', showMore && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          <div className={cx('mt-4 grid gap-4 lg:grid-cols-3', !showMore && 'hidden')}>
            {rest.map((f, i) => (
              <BuildResultCard key={f.comp.id} fit={f} rank={i + 4} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
