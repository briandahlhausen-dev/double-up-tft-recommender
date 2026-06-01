import { useState } from 'react';
import type { TraitBridge } from '../lib/bridges';
import { BRIDGE_PREVIEW } from '../lib/bridges';
import { costStyle } from '../lib/cost';
import { championHref } from '../lib/router';
import { cx } from '../lib/cx';
import { CostBadge } from './CostBadge';
import { TierBadge } from './TierBadge';

// ---------------------------------------------------------------------------
// Trait-bridge suggestions for the "build my board" flow. Where BuildResults
// ranks the 10 curated comps you're closest to, this surfaces individual units
// the curated list can't reach: champions you DON'T own that share an active
// trait with your board AND grade out well on real Double Up stats. It's the
// engine's answer to the human leap "Sniper + Meeple → who ties those
// together?" — and it's pure data, so a unit the snapshot never logged simply
// doesn't appear (no guesses). Every card links to that champion's guide page.
// ---------------------------------------------------------------------------

/** One suggested pickup: portrait, why-it-bridges (shared traits lit), real stats. */
function BridgeCard({ bridge }: { bridge: TraitBridge }) {
  const { champion: champ, sharedTraits, tier } = bridge;
  const stats = champ.stats!; // engine guarantees non-null (data-gated)
  const s = costStyle(champ.cost);
  const shared = new Set(sharedTraits);
  const topComp = stats.bestComps[0];

  return (
    <a
      href={championHref(champ.id)}
      className="group glass flex flex-col overflow-hidden p-0 transition duration-150 hover:-translate-y-0.5 hover:border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-nebula/60"
    >
      <div className={cx('relative aspect-square w-full overflow-hidden ring-1 ring-inset', s.ring)}>
        <img
          src={champ.portrait}
          alt={champ.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cosmos-950/90 to-transparent" />
        <CostBadge cost={champ.cost} className="absolute left-1.5 top-1.5" />
        <TierBadge tier={tier} size="sm" className="absolute right-1.5 top-1.5 shadow-sm" />
        <div className="absolute inset-x-0 bottom-0 p-2">
          <h4 className="truncate font-display text-sm font-semibold text-white drop-shadow">{champ.name}</h4>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {/* Traits — the ones bridging your board are lit, the rest muted. */}
        <div className="flex flex-wrap gap-1">
          {champ.traits.map((t) => (
            <span
              key={t}
              className={cx(
                'chip px-1.5 py-0.5 text-[10px]',
                shared.has(t) ? 'border-nebula/50 text-white' : 'text-slate-500',
              )}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-1.5 pt-1 text-[10px] text-slate-400">
          <span>
            Avg <span className="font-semibold text-white">{stats.avgPlace.toFixed(2)}</span>
          </span>
          <span className="text-slate-600">·</span>
          <span>
            Top 4 <span className="font-semibold text-emerald-300">{stats.top4}%</span>
          </span>
        </div>
        {topComp && (
          <div className="truncate text-[10px] text-slate-500" title={topComp.name}>
            plays in <span className="text-slate-300">{topComp.name}</span>
          </div>
        )}
      </div>
    </a>
  );
}

/** Data-backed trait bridges below the curated comps. Renders nothing when empty. */
export function BridgeSuggestions({ bridges }: { bridges: TraitBridge[] }) {
  const [showMore, setShowMore] = useState(false);
  if (bridges.length === 0) return null;

  const rest = bridges.slice(BRIDGE_PREVIEW);
  const shown = showMore ? bridges : bridges.slice(0, BRIDGE_PREVIEW);

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-white">Units that bridge your board</h2>
        <span className="text-xs text-slate-400">
          data-backed pickups sharing a trait you already run · {bridges.length} found
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {shown.map((b) => (
          <BridgeCard key={b.champion.id} bridge={b} />
        ))}
      </div>

      {rest.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowMore((m) => !m)}
            className="no-print mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-nebula/40 hover:text-white"
          >
            {showMore ? 'Hide' : 'Show'} {rest.length} more
            <svg
              className={cx('h-4 w-4 transition-transform', showMore && 'rotate-180')}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
