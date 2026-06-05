import { useEffect, useMemo, useRef, useState } from 'react';
import { COMPS } from '../data/comps';
import { STATS_UPDATED_AT, STATS_SOURCE } from '../data/stats';
import { DEFAULT_PREFS } from '../types';
import type { Comp, Prefs } from '../types';
import { recommend, recommendForBoard } from '../lib/recommend';
import { recommendBridges } from '../lib/bridges';
import { Header } from '../components/Header';
import { PartnerSelect } from '../components/PartnerSelect';
import { BoardBuilder } from '../components/BoardBuilder';
import { PreferenceControls } from '../components/PreferenceControls';
import { Results } from '../components/Results';
import { BuildResults } from '../components/BuildResults';
import { BridgeSuggestions } from '../components/BridgeSuggestions';
import { CompGuideProvider } from '../components/CompGuide';
import { ItemEconomyPanel } from '../components/ItemEconomyPanel';
import { MechanicsCheatStrip } from '../components/MechanicsCheatStrip';
import { DamageTag } from '../components/DamageTag';
import { SiteFooter } from '../components/SiteFooter';
import { cx } from '../lib/cx';
import { buildCustomComp, loadBuilder, saveBuilder, decodeBuilder, encodeBuilder, MY_BOARD_KEY } from '../lib/customComp';
import type { BuilderState } from '../lib/customComp';
import { LiveShare } from '../components/LiveShare';
import { liveEnabled } from '../lib/liveConfig';

// Three input modes: the first two describe your PARTNER (and the engine ranks
// comps that complement them); 'myboard' describes YOUR current units (and the
// engine ranks comps you're closest to completing — a different question).
type PartnerMode = 'preset' | 'build' | 'myboard';

export function Recommender({ initialBoard, initialRoom }: { initialBoard?: string; initialRoom?: string }) {
  // A share link (#/board/<code>) wins over the locally saved board on first load.
  const [build, setBuild] = useState<BuilderState>(() => {
    if (initialBoard) {
      const shared = decodeBuilder(initialBoard);
      if (shared) return shared;
    }
    return loadBuilder();
  });
  const [myBoard, setMyBoard] = useState<BuilderState>(() => loadBuilder(MY_BOARD_KEY));
  const [mode, setMode] = useState<PartnerMode>('build');
  const [partnerId, setPartnerId] = useState(COMPS[0].id);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Remember both boards across refreshes (localStorage; see customComp). Each
  // lives under its own key, so editing one never clobbers the other.
  useEffect(() => saveBuilder(build), [build]);
  useEffect(() => saveBuilder(myBoard, MY_BOARD_KEY), [myBoard]);

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

  const isMyBoard = mode === 'myboard';
  const presetPartner = useMemo(() => COMPS.find((c) => c.id === partnerId) ?? COMPS[0], [partnerId]);
  const customComp = useMemo(() => buildCustomComp(build), [build]);
  const myComp = useMemo(() => buildCustomComp(myBoard), [myBoard]);
  // The board the live duo-link broadcasts: your own ("Build my board").
  const myCode = useMemo(() => encodeBuilder(myBoard), [myBoard]);

  // Partner modes resolve a partner Comp; 'myboard' has no partner (different axis).
  const partner: Comp | null = isMyBoard ? null : mode === 'build' ? customComp : presetPartner;
  const snapshot = isMyBoard ? myComp : partner;

  const results = useMemo(() => (partner ? recommend(partner, prefs) : []), [partner, prefs]);
  const buildFits = useMemo(
    () => (isMyBoard && myComp ? recommendForBoard(myComp.units, prefs) : []),
    [isMyBoard, myComp, prefs],
  );
  // Stats-driven trait bridges: data-backed units that share an active trait
  // with your board but live outside the 10 curated comps (independent of prefs).
  const bridges = useMemo(() => (isMyBoard ? recommendBridges(myBoard) : []), [isMyBoard, myBoard]);
  const top1 = results[0];

  const scrollToResults = () => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <CompGuideProvider>
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
                  { id: 'myboard', label: 'Build my board' },
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
            ) : mode === 'build' ? (
              <BoardBuilder state={build} onChange={setBuild} />
            ) : (
              <BoardBuilder
                state={myBoard}
                onChange={setMyBoard}
                title="Your board"
                playstyleLabel="Your playstyle"
                showShare={false}
                emptyHint={
                  <>
                    Tap the champions you have right now, then mark your intended carries{' '}
                    <DamageTag type="AD" className="mx-0.5" /> or <DamageTag type="AP" className="mx-0.5" /> — the engine ranks
                    which comps you&apos;re closest to completing.
                  </>
                }
              />
            )}

            {/* Board snapshot */}
            {snapshot ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">
                    {isMyBoard ? 'Your board' : 'Locking in'}
                  </span>
                  <DamageTag type={snapshot.primaryDamage} />
                </div>
                {snapshot.carries.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {snapshot.carries.map((cr) => (
                      <div key={cr.name} className="flex min-w-0 items-center gap-2 text-sm">
                        <DamageTag type={cr.damageType} className="shrink-0" />
                        <span className="shrink-0 font-medium text-white">{cr.name}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{cr.items.join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-400">
                  {snapshot.levelStrategy} · {snapshot.playstyle === 'aggressive' ? 'aggressive' : 'scaling'}
                  {(mode === 'build' || isMyBoard) && ` · ${snapshot.units.length} units`}
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-sm text-slate-400">
                {isMyBoard
                  ? "Add the champions you have above and I'll rank the comps you're closest to completing."
                  : "Add your partner's champions above and the recommender will react to their board."}
              </p>
            )}

            <button
              type="button"
              onClick={scrollToResults}
              disabled={!snapshot}
              className="no-print mt-4 w-full rounded-xl bg-nebula px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white shadow-glow-violet transition hover:bg-violet-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {isMyBoard ? 'Find comps to build ↓' : 'Recommend my board ↓'}
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

      {/* ---- Live duo link (real-time board sharing; only when configured) ---- */}
      {liveEnabled() && (
        <LiveShare
          myCode={myCode}
          initialRoom={initialRoom}
          onActivate={() => setMode('myboard')}
          onCompare={(state) => {
            setBuild(state);
            setMode('build');
            scrollToResults();
          }}
        />
      )}

      {/* ---- Results ---- */}
      <section ref={resultsRef} className="mt-8 scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-white">
            {isMyBoard ? 'Comps you can build' : 'Boards you should play'}
          </h2>
          <span className="text-xs text-slate-400">
            {isMyBoard ? (
              myComp ? (
                <>
                  ranked by fit to your <span className="text-slate-200">{myComp.units.length} units</span> · {buildFits.length}{' '}
                  comps
                </>
              ) : (
                'waiting for your board'
              )
            ) : partner ? (
              <>
                ranked against <span className="text-slate-200">{shortName(partner.name)}</span> · {results.length} candidates
              </>
            ) : (
              'waiting for your partner’s board'
            )}
          </span>
        </div>
        {isMyBoard ? (
          myComp ? (
            <BuildResults results={buildFits} />
          ) : (
            <div className="glass p-8 text-center text-sm text-slate-400">
              Add the champions you currently have above to see which comps you&apos;re closest to completing.
            </div>
          )
        ) : partner ? (
          <Results results={results} />
        ) : (
          <div className="glass p-8 text-center text-sm text-slate-400">
            Build your partner&apos;s board above to see which comps complement it.
          </div>
        )}
      </section>

      {/* ---- Stats-driven trait bridges (my-board flow only) ---- */}
      {isMyBoard && myComp && <BridgeSuggestions bridges={bridges} />}

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
          {STATS_UPDATED_AT ? (
            <>
              Win-rate data is a live Double Up ladder crawl
              {STATS_SOURCE ? ` (${STATS_SOURCE})` : ''}, updated{' '}
              {new Date(STATS_UPDATED_AT).toLocaleDateString()}; comps below the sample floor fall back to the seed.{' '}
            </>
          ) : (
            <>Win-rate data is the Diamond+ seed snapshot and shifts every patch. </>
          )}
          Edit <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">src/data/comps.ts</code> to update the
          structure — no other code changes needed.
        </p>
      </SiteFooter>
    </CompGuideProvider>
  );
}

function shortName(name: string): string {
  return name.split('—')[0].trim();
}
