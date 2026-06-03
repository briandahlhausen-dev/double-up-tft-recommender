import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AugmentStat, AugmentTier, Carry, Comp, Playstyle, Tempo } from '../types';
import { cx } from '../lib/cx';
import { tierForAvgPlace } from '../lib/tier';
import { ASSUMPTIONS, evaluateCompCarry } from '../lib/combat-model';
import type { CarryEvaluation } from '../lib/combat-model';
import { POSITIONING } from '../data/positioning';
import { augmentsForComp } from '../data/augment-stats';
import { HexBoard } from './HexBoard';
import { TierBadge } from './TierBadge';
import { ContestedBadge } from './ContestedBadge';
import { DamageTag } from './DamageTag';

// ---------------------------------------------------------------------------
// Tap-a-comp guide: a Mobalytics-style overlay with the recommended board
// positioning, the augments that actually performed (crawled), the carry item
// builds, and a short game plan. Mounted once by CompGuideProvider; any comp
// card opens it via useCompGuide().open(comp). No routing, no state lib — just
// React context + a portal, to stay within the app's static, built-ins-only diet.
// ---------------------------------------------------------------------------

interface CompGuideApi {
  open: (comp: Comp) => void;
}
const CompGuideContext = createContext<CompGuideApi>({ open: () => {} });

/** Open the comp guide from anywhere inside the provider. */
export const useCompGuide = (): CompGuideApi => useContext(CompGuideContext);

export function CompGuideProvider({ children }: { children: ReactNode }) {
  const [comp, setComp] = useState<Comp | null>(null);
  return (
    <CompGuideContext.Provider value={{ open: (c) => setComp(c) }}>
      {children}
      {comp && <CompGuideModal comp={comp} onClose={() => setComp(null)} />}
    </CompGuideContext.Provider>
  );
}

function CompGuideModal({ comp, onClose }: { comp: Comp; onClose: () => void }) {
  // Escape closes; lock the background from scrolling while the overlay is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const slots = POSITIONING[comp.id] ?? [];
  const augs = augmentsForComp(comp.id);
  const tier = tierForAvgPlace(comp.avgPlace);
  // The deterministic combat model: one transparent evaluation per carry.
  const carryMath = useMemo(
    () => comp.carries.map((cr) => ({ carry: cr, evald: evaluateCompCarry(comp, cr) })),
    [comp],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-cosmos-950/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${comp.name} guide`}
        onClick={(e) => e.stopPropagation()}
        className="glass animate-fade-up mx-auto my-4 w-full max-w-3xl p-4 sm:p-6"
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold leading-tight text-white sm:text-xl">{comp.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <TierBadge tier={tier} size="sm" />
              <ContestedBadge level={comp.contested} />
              <span className="chip">{comp.levelStrategy}</span>
              <DamageTag type={comp.primaryDamage} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Traits */}
        <div className="mt-3 flex flex-wrap gap-1">
          {comp.traits.map((t) => (
            <span key={t} className="chip py-0.5 text-[11px]">
              {t}
            </span>
          ))}
        </div>

        {/* Standalone strength */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Avg place" value={comp.avgPlace.toFixed(2)} />
          <Stat label="Top 4" value={`${comp.top4}%`} />
          <Stat label="First" value={`${comp.first}%`} />
        </div>

        {/* Positioning */}
        <Section title="Positioning" hint="recommended hexes">
          {slots.length ? (
            <>
              <div className="rounded-xl border border-white/5 bg-cosmos-950/40 p-3">
                <HexBoard comp={comp} slots={slots} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <Legend swatch="bg-ad" label="AD carry" />
                <Legend swatch="bg-ap" label="AP carry" />
                <span className="text-slate-500">★ = carry, cornered for protection · front row engages first</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">No positioning authored for this comp yet.</p>
          )}
        </Section>

        {/* Augments */}
        <Section title="Recommended augments" hint={augs.length ? 'by real pick rate' : 'priorities'}>
          {augs.length ? (
            <div className="space-y-1.5">
              {augs.map((a) => (
                <AugmentRow key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <AugmentFallback augments={comp.augments} />
          )}
        </Section>

        {/* Carries & items */}
        <Section title="Carries & items">
          <div className="space-y-2">
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
        </Section>

        {/* Combat math — the deterministic theorycraft model */}
        <Section title="The math behind the carries" hint="deterministic model · approximate">
          <div className="space-y-2">
            {carryMath.map(({ carry, evald }) =>
              evald ? (
                <CarryMath key={carry.name} carry={carry} data={evald} />
              ) : (
                <div key={carry.name} className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-sm text-slate-400">
                  <span className="font-semibold text-slate-300">{carry.name}</span> isn’t in the extracted math data yet.
                </div>
              ),
            )}
          </div>
          <details className="group mt-2">
            <summary className="cursor-pointer list-none text-[11px] text-slate-500 transition hover:text-slate-300">
              <span className="group-open:hidden">▸ How these numbers are computed (and what they ignore)</span>
              <span className="hidden group-open:inline">▾ How these numbers are computed (and what they ignore)</span>
            </summary>
            <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-3 text-[11px] leading-snug text-slate-400">
              {ASSUMPTIONS.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        </Section>

        {/* Game plan */}
        <Section title="Game plan">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="chip">{comp.levelStrategy}</span>
            <span className="chip capitalize">{comp.playstyle}</span>
            <span className="chip">{TEMPO_LABEL[comp.tempo]}</span>
          </div>
          <ul className="space-y-1.5 text-sm leading-snug text-slate-300">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-nebula" aria-hidden />
              {PLAYSTYLE_PLAN[comp.playstyle]}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-nebula" aria-hidden />
              {TEMPO_PLAN[comp.tempo]}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-nebula" aria-hidden />
              Frontline ({comp.frontline.join(', ')}) holds while your{' '}
              {comp.carries.map((c) => c.name).join(' & ')} scale from the backline.
            </li>
          </ul>
        </Section>

        <p className="mt-4 border-t border-white/5 pt-3 text-[11px] text-slate-500">
          Positioning is authored guidance; placement isn't measured by the snapshot.{' '}
          {augs.length
            ? 'Augments are ranked by real Double Up pick rate and the placement they produced.'
            : 'Specific augment win-rates populate on the next data refresh — until then these are archetype priorities.'}
        </p>
      </div>
    </div>,
    document.body,
  );
}

// ---- bits -----------------------------------------------------------------

const TEMPO_LABEL: Record<Tempo, string> = {
  reroll: 'Reroll',
  fast8: 'Fast 8',
  tempo: 'Tempo',
};

const PLAYSTYLE_PLAN: Record<Playstyle, string> = {
  aggressive: 'Play aggressively — push levels early and pressure HP while your board is ahead of the lobby.',
  scaling: 'Play for scaling — protect your econ, hit your level spikes, and stabilize into the late game.',
};

const TEMPO_PLAN: Record<Tempo, string> = {
  reroll: 'Roll down at your level to 3-star the carries before you spend on levels.',
  fast8: 'Save gold and fast-8 to your high-cost spike, rolling only to stabilize HP.',
  tempo: 'Ride win-streak tempo to push levels ahead of curve, then consolidate your board.',
};

const AUG_TIER_STYLE: Record<AugmentTier, string> = {
  silver: 'text-slate-200 ring-slate-400/40',
  gold: 'text-amber-300 ring-amber-400/40',
  prismatic: 'text-fuchsia-300 ring-fuchsia-400/40',
};
// cdragon doesn't always encode an augment's rarity; render neutral when unknown.
const AUG_TIER_NEUTRAL = 'text-slate-300 ring-white/15';

function AugmentRow({ a }: { a: AugmentStat }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2">
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg ring-1', a.tier ? AUG_TIER_STYLE[a.tier] : AUG_TIER_NEUTRAL)}>
        {a.icon ? <img src={a.icon} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="text-[10px] uppercase">{a.tier ? a.tier[0] : '◆'}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{a.name}</div>
        <div className="text-[11px] text-slate-400">
          <span className="text-slate-300">{a.pickRate}%</span> pick · avg{' '}
          <span className="text-slate-300">{a.avgPlace.toFixed(2)}</span> · top4{' '}
          <span className="text-emerald-300">{a.top4}%</span>
        </div>
      </div>
    </div>
  );
}

const FALLBACK_CAT = (aug: string): { label: string; cls: string } => {
  const s = aug.toLowerCase();
  if (s.includes('reroll')) return { label: 'Tempo', cls: 'border-sky-400/30 text-sky-300' };
  if (s.includes('econ')) return { label: 'Economy', cls: 'border-emerald-400/30 text-emerald-300' };
  if (s.includes('trait') || s.includes('emblem')) return { label: 'Trait', cls: 'border-nebula/40 text-nebula' };
  if (s.includes('combat') || s.includes('crit') || s.includes('attack') || s.includes('damage'))
    return { label: 'Combat', cls: 'border-amber-400/30 text-amber-300' };
  return { label: 'Strategy', cls: 'border-white/15 text-slate-300' };
};

function AugmentFallback({ augments }: { augments: string[] }) {
  return (
    <div className="space-y-1.5">
      {augments.map((aug) => {
        const cat = FALLBACK_CAT(aug);
        return (
          <div key={aug} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2">
            <span className={cx('rounded-md border px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider', cat.cls)}>
              {cat.label}
            </span>
            <span className="text-sm text-slate-200">{aug}</span>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 flex items-baseline gap-2 font-display text-sm font-bold uppercase tracking-wider text-slate-200">
        {title}
        {hint && <span className="font-body text-[10px] normal-case tracking-normal text-slate-500">{hint}</span>}
      </h3>
      {children}
    </section>
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

const round0 = (n: number): string => Math.round(n).toLocaleString();

// One carry, run through the deterministic combat model: headline DPS / EHP /
// cadence, the effective stat line, the auto + ability split, and an auditable
// list of exactly which item & trait effects were folded in (and which weren't).
function CarryMath({ carry, data }: { carry: Carry; data: CarryEvaluation }) {
  const e = data.evaluation;
  const applied = e.modifiers.filter((m) => m.target !== 'unmodeled');
  const ignored = e.modifiers.filter((m) => m.target === 'unmodeled');

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2">
        <DamageTag type={carry.damageType} />
        <span className="text-sm font-semibold text-white">{e.name}</span>
        <span className="chip py-0 text-[10px]">{e.star}★</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-500">{e.ability.scaling} scaling</span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <MathStat label="Total DPS" value={round0(e.totalDps)} accent="text-amber-300" />
        <MathStat label="Effective HP" value={round0(e.ehp.mixed)} accent="text-emerald-300" />
        <MathStat label="Casts / 10s" value={e.cast.castsPer10s.toFixed(1)} accent="text-sky-300" />
      </div>

      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        <StatChip k="AD" v={round0(e.effective.ad)} />
        <StatChip k="AS" v={e.effective.attackSpeed.toFixed(2)} />
        <StatChip k="AP" v={round0(e.effective.ap)} />
        <StatChip k="HP" v={round0(e.effective.hp)} />
        <StatChip k="AR" v={round0(e.effective.armor)} />
        <StatChip k="MR" v={round0(e.effective.magicResist)} />
      </div>

      <div className="mt-2 space-y-1 text-[11px] leading-snug text-slate-400">
        <div>
          <span className="text-slate-300">Auto</span> {round0(e.autoDps)} DPS
          <span className="text-slate-600"> = </span>
          {round0(e.effective.ad)} AD × {e.effective.attackSpeed.toFixed(2)} AS × {e.critFactor.toFixed(2)} crit
        </div>
        <div>
          <span className="text-slate-300">Ability</span> “{e.ability.name}” {round0(e.ability.dps)} DPS — {e.ability.interpretation}
        </div>
      </div>

      {data.unmatchedItems.length > 0 && (
        <div className="mt-1.5 text-[10px] text-slate-500">Items not in math data: {data.unmatchedItems.join(', ')}</div>
      )}

      {(applied.length > 0 || ignored.length > 0) && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-[11px] text-nebula/80 transition hover:text-nebula">
            <span className="group-open:hidden">
              ▸ {applied.length} stat mods applied{ignored.length ? ` · ${ignored.length} not modeled` : ''}
            </span>
            <span className="hidden group-open:inline">▾ item &amp; trait modifiers</span>
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {applied.map((m, i) => (
              <span
                key={`a-${m.source}-${m.key}-${i}`}
                className="rounded-md border border-emerald-400/20 bg-emerald-400/5 px-1.5 py-0.5 text-[10px] text-emerald-200/90"
              >
                <span className="text-emerald-300/70">{m.source}</span> {m.applied}
              </span>
            ))}
            {ignored.map((m, i) => (
              <span
                key={`i-${m.source}-${m.key}-${i}`}
                className="rounded-md border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-slate-500"
                title={`${m.key} = ${m.value} — conditional / stacking / teamwide / non-stat`}
              >
                <span className="text-slate-600">{m.source}</span> {m.key}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MathStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-cosmos-950/40 px-2 py-1.5 text-center">
      <div className={cx('font-display text-base font-bold', accent)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function StatChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-slate-300">
      <span className="text-slate-500">{k}</span> {v}
    </span>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('h-2.5 w-2.5 rounded-sm', swatch)} aria-hidden />
      {label}
    </span>
  );
}
