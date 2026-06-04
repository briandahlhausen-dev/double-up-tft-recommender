import { STATS_UPDATED_AT } from '../data/stats';

export function Header() {
  const updated = STATS_UPDATED_AT ? new Date(STATS_UPDATED_AT).toLocaleDateString() : null;
  return (
    <header className="text-center sm:text-left">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Double Up <span className="text-nebula">TFT</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
            Tell it the comp your duo is locking in, set a few quick prefs, and get data-backed picks whose
            units and items <span className="text-white">don&apos;t collide</span> with your partner&apos;s.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="chip">{updated ? `Set 17 · updated ${updated}` : 'Set 17 · seed data'}</span>
          <span className="chip">data is a snapshot</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400 sm:justify-start">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ad" /> AD — Swords &amp; Bows
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ap" /> AP — Rods &amp; Tears
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-nebula" /> Hybrid
        </span>
      </div>
    </header>
  );
}
