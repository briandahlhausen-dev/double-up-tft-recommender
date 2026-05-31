import { useEffect, useMemo, useRef, useState } from 'react';
import { COMPS } from '../data/comps';
import { cx } from '../lib/cx';
import { DamageTag } from './DamageTag';

export function PartnerSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = COMPS.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMPS;
    return COMPS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.traits.some((t) => t.toLowerCase().includes(q)) ||
        c.carries.some((cr) => cr.name.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block font-display text-xs uppercase tracking-wider text-slate-300">
        Partner&apos;s comp
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="glass flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left transition hover:border-nebula/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <>
              <DamageTag type={selected.primaryDamage} className="shrink-0" />
              <span className="truncate font-medium text-white">{selected.name}</span>
            </>
          ) : (
            <span className="text-slate-400">Choose a comp…</span>
          )}
        </span>
        <svg
          className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
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

      {open && (
        <div className="glass absolute z-30 mt-2 w-full overflow-hidden p-1.5 shadow-glow-violet">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search comp, trait, or carry…"
            className="mb-1.5 w-full rounded-lg border border-white/10 bg-cosmos-900/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-nebula/50 focus:outline-none"
          />
          <ul role="listbox" className="max-h-72 overflow-auto">
            {filtered.map((c) => (
              <li key={c.id} role="option" aria-selected={c.id === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cx(
                    'w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-white/5',
                    c.id === value && 'bg-nebula/15',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">{c.name}</span>
                    <DamageTag type={c.primaryDamage} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.traits.map((t) => (
                      <span key={t} className="chip py-0.5 text-[10px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-sm text-slate-400">No comps match “{query}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
