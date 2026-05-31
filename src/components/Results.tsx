import { useState } from 'react';
import type { ScoredComp } from '../lib/recommend';
import { cx } from '../lib/cx';
import { ResultCard } from './ResultCard';

export function Results({ results }: { results: ScoredComp[] }) {
  const [showMore, setShowMore] = useState(false);
  const top = results.slice(0, 3);
  const rest = results.slice(3);

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {top.map((s, i) => (
          <ResultCard key={s.comp.id} scored={s} rank={i + 1} defaultOpen={i === 0} />
        ))}
      </div>

      {rest.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowMore((m) => !m)}
            className="no-print mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-nebula/40 hover:text-white"
          >
            {showMore ? 'Hide' : 'Show'} {rest.length} more option{rest.length > 1 ? 's' : ''}
            <svg className={cx('h-4 w-4 transition-transform', showMore && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          <div className={cx('print-open mt-4 grid gap-4 lg:grid-cols-3', !showMore && 'hidden')}>
            {rest.map((s, i) => (
              <ResultCard key={s.comp.id} scored={s} rank={i + 4} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
