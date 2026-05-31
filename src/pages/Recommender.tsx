import { useEffect, useMemo, useRef, useState } from 'react';
import { COMPS } from '../data/comps';
import { DEFAULT_PREFS } from '../types';
import type { Comp, Prefs } from '../types';
import { recommend } from '../lib/recommend';
import { Header } from '../components/Header';
import { PartnerSelect } from '../components/PartnerSelect';
import { PartnerBuilder } from '../components/PartnerBuilder';
import { PreferenceControls } from '../components/PreferenceControls';
import { Results } from '../components/Results';
import { ItemEconomyPanel } from '../components/ItemEconomyPanel';
import { MechanicsCheatStrip } from '../components/MechanicsCheatStrip';
import { DamageTag } from '../components/DamageTag';
import { SiteFooter } from '../components/SiteFooter';
import { cx } from '../lib/cx';
import { buildCustomComp, loadBuilder, saveBuilder, decodeBuilder } from '../lib/customComp';
import type { BuilderState } from '../lib/customComp';

type PartnerMode = 'preset' | 'build';

export function Recommender({ initialBoard }: { initialBoard?: string }) {
  // A share link (#/board/<code>) wins over the locally saved board on first load.
  const [build, setBuild] = useState<BuilderState>(() => {
    if (initialBoard) {
      const shared = decodeBuilder(initialBoard);
      if (shared) return shared;
    }
    return loadBuilder();
  });
  const [mode, setMode] = useState<PartnerMode>('build');
  const [partnerId, setPartnerId] = useState(COMPS[0].id);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Remember the partner board across refreshes (localStorage; see customComp).
  useEffect(() => saveBuilder(build), [build]);

  // Landed on a share link: load it, switch to build mode, then tidy the URL so
  // later edits aren't shadowed by the stale code (replaceState fires no hashchange).
  useEffect(() => {
    if (!initialBoard) return;
    const shared = decodeBuilder(initialBoard);
    if (shared) {
      setBuild(shared);
      setMode('build');
    }
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  }, [initialBoard]);

  const presetPartner = useMemo(() => COMPS.find((c) => c.id === partnerId) ?? COMPS[0], [partnerId]);
  const customComp = useMemo(() => buildCustomComp(build), [build]);
  const partner: Comp | null = mode === 'build' ? customComp : presetPartner;

  const results = useMemo(() => (partner ? recommend(partner, prefs) : []), [partner, prefs]);
  const top1 = results[0];

  const scrollToResults = () => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <Header />

      {/* ---- Input panel ---- */}
      <section className="glass mt-6 p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
          <div className="flex min-w-0 flex-col">
            {/* Preset vs build toggle */}
            <div className="mb-3 flex gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
              {(
                [
                  { id: 'preset', label: 'Pick a comp' },
                  { id: 'build', label: 'Build their board' },
                ] as { id: PartnerMode; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={mode === t.id}
                  onClick={() => setMode(t.id)}
                  className={cx(
                    'seg-btn flex-1',
                    mode === t.id ? 'bg-nebula/25 text-white ring-1 ring-nebula/50' : 'hover:bg-white/5',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {mode === 'preset' ? (
              <PartnerSelect value={partnerId} onChange={setPartnerId} />
            ) : (
              <PartnerBuilder state={build} onChange={setBuild} />
            )}

            {/* Partner snapshot */}
            {partner ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Locking in</span>
                  <DamageTag type={partner.primaryDamage} />
                </div>
                {partner.carries.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {partner.carries.map((cr) => (
                      <div key={cr.name} className="flex min-w-0 items-center gap-2 text-sm">
                        <DamageTag type={cr.damageType} className="shrink-0" />
                        <span className="shrink-0 font-medium text-white">{cr.name}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{cr.items.join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-400">
                  {partner.levelStrategy} · {partner.playstyle === 'aggressive' ? 'aggressive' : 'scaling'}
                  {mode === 'build' && ` · ${partner.units.length} units`}
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-sm text-slate-400">
                Add your partner&apos;s champions above and the recommender will react to their board.
              </p>
            )}

            <button
              type="button"
              onClick={scrollToResults}
              disabled={!partner}
              className="no-print mt-4 w-full rounded-xl bg-nebula px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white shadow-glow-violet transition hover:bg-violet-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              Recommend my board ↓
            </button>
          </div>

          <div className="min-w-0">
            <h2 className="mb-3 font-display text-xs uppercase tracking-wider text-slate-300">
              Your preferences
              <span className="ml-2 font-body text-[10px] normal-case text-slate-500">all optional · updates live</span>
            </h2>
            <PreferenceControls prefs={prefs} onChange={setPrefs} />
          </div>
        </div>
      </section>

      {/* ---- Results ---- */}
      <section ref={resultsRef} className="mt-8 scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-white">Boards you should play</h2>
          <span className="text-xs text-slate-400">
            {partner ? (
              <>
                ranked against <span className="text-slate-200">{shortName(partner.name)}</span> · {results.length} candidates
              </>
            ) : (
              'waiting for your partner’s board'
            )}
          </span>
        </div>
        {partner ? (
          <Results results={results} />
        ) : (
          <div className="glass p-8 text-center text-sm text-slate-400">
            Build your partner&apos;s board above to see which comps complement it.
          </div>
        )}
      </section>

      {/* ---- Shared item economy (dynamic to #1) ---- */}
      {top1 && partner && (
        <section className="mt-8">
          <ItemEconomyPanel mine={top1.comp} partner={partner} />
        </section>
      )}

      {/* ---- Mechanics reference ---- */}
      <section className="mt-8">
        <MechanicsCheatStrip />
      </section>

      <SiteFooter>
        <p>
          Win-rate data is a Diamond+ Double Up snapshot (patches 17.3–17.4) and shifts every patch. Edit{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">src/data/comps.ts</code> to update it — no
          other code changes needed.
        </p>
      </SiteFooter>
    </>
  );
}

function shortName(name: string): string {
  return name.split('—')[0].trim();
}
