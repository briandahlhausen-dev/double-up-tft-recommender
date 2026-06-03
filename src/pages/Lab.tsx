import { useEffect, useMemo, useRef, useState } from 'react';
import { DISCOVERED_BOARDS, THEORYCRAFT_UPDATED_AT } from '../data/theorycraft';
import type { BoardScore } from '../lib/theorycraft';
import { evaluateBoardUnits } from '../lib/theorycraft';
import { ASSUMPTIONS } from '../lib/combat-model';
import { CHAMPIONS_VIEW } from '../lib/champions';
import { boardDamageType, carryOptions, filterBoards, noveltyOf, traitOptions } from '../lib/labFilters';
import type { DamageFilter, LabSort, Novelty, NoveltyFilter } from '../lib/labFilters';
import { championHref } from '../lib/router';
import { costStyle } from '../lib/cost';
import { cx } from '../lib/cx';
import { SiteFooter } from '../components/SiteFooter';
import type { ChampionView } from '../types';

// ---------------------------------------------------------------------------
// THEORYCRAFT LAB (Stage 2 surface)
//
// Renders the offline-discovered high-synergy boards from src/data/theorycraft
// (a trait-anchored beam search over the deterministic combat model). The search
// is too expensive to run live, so we show the BAKED results and re-derive each
// board's per-unit math on the fly via the cheap combat-model.
//
// This is a candidate generator — "theorycraft proposes, ladder data validates."
// Every board is tagged Novel / Variant / Known by overlap with the curated meta
// comps so the genuinely new ideas stand out as leads to test.
// ---------------------------------------------------------------------------

const STAR = 2; // boards were discovered/scored at 2★; per-unit detail matches

const normName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const CHAMP_BY_NORM: Record<string, ChampionView> = Object.fromEntries(
  CHAMPIONS_VIEW.map((c) => [normName(c.name), c]),
);
const champOf = (name: string): ChampionView | undefined => CHAMP_BY_NORM[normName(name)];

// ---- novelty vs the curated meta (logic lives in lib/labFilters) -----------

const NOVELTY_STYLE: Record<Novelty['label'], string> = {
  Novel: 'bg-nebula/20 text-nebula ring-nebula/40',
  Variant: 'bg-sky-400/15 text-sky-300 ring-sky-400/40',
  Known: 'bg-white/5 text-slate-400 ring-white/15',
};

const round0 = (n: number): number => Math.round(n);

// ---- filter-bar option lists + shared input styling ------------------------

const SELECT_CLS =
  'rounded-xl border border-white/10 bg-cosmos-900/60 px-3 py-2 text-sm text-slate-200 focus:border-nebula/50 focus:outline-none focus:ring-1 focus:ring-nebula/50';

const DAMAGE_OPTS: { id: DamageFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'AD', label: 'AD' },
  { id: 'AP', label: 'AP' },
  { id: 'Hybrid', label: 'Hybrid' },
];

const NOVELTY_OPTS: { id: NoveltyFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Novel', label: 'Novel' },
  { id: 'Variant', label: 'Variant' },
  { id: 'Known', label: 'Known' },
];

// ---- page ------------------------------------------------------------------

export function Lab() {
  const boards = DISCOVERED_BOARDS;
  const updated = THEORYCRAFT_UPDATED_AT ? new Date(THEORYCRAFT_UPDATED_AT).toLocaleDateString() : null;

  // Filter state — mirrors the Champions page conventions.
  const [q, setQ] = useState('');
  const [carry, setCarry] = useState('all');
  const [trait, setTrait] = useState('all');
  const [damage, setDamage] = useState<DamageFilter>('all');
  const [novelty, setNovelty] = useState<NoveltyFilter>('all');
  const [sort, setSort] = useState<LabSort>('score');
  const searchRef = useRef<HTMLInputElement>(null);

  // Power-user nicety: "/" jumps to search (same as the Champions page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (typing) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // True score-rank (boards are baked in score order) stays with each board even
  // when the list is re-sorted, so "#3 overall" reads honestly under any sort.
  const rankOf = useMemo(() => {
    const m = new Map<string, number>();
    boards.forEach((b, i) => m.set(b.units.join('|'), i + 1));
    return m;
  }, [boards]);

  const carries = useMemo(() => carryOptions(boards), [boards]);
  const traits = useMemo(() => traitOptions(boards), [boards]);
  const novelCount = useMemo(() => boards.filter((b) => noveltyOf(b.units).label === 'Novel').length, [boards]);

  const shown = useMemo(
    () => filterBoards(boards, { q, carry, trait, damage, novelty, sort }),
    [boards, q, carry, trait, damage, novelty, sort],
  );

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Theorycraft <span className="text-nebula">Lab</span>
        </h1>
        <p className="max-w-2xl text-sm text-slate-300">
          High-synergy boards a deterministic combat model discovered by searching every trait — each itemizes its
          carry's best-in-slot build and folds in trait breakpoints. The math proposes; the ladder data validates.
        </p>
        <p className="text-xs text-slate-500">
          {boards.length} boards · {novelCount} tagged novel
          {updated ? ` · discovered ${updated}` : ''}
        </p>
      </header>

      {/* Honest framing — this is a candidate generator, not a meta report. */}
      <section className="glass mt-5 p-4 text-sm text-slate-300">
        <p>
          <span className="font-semibold text-white">How to read this.</span> A beam search grows a board from each
          trait, keeping units that share an active trait, and scores the result with the same transparent DPS/EHP model
          the comp guides use. It finds <span className="text-nebula">verticals and combos by the numbers</span> — some
          will be off-meta gold, some will be traps the model can't see. Cross-check the novel ones against the crawled
          Double Up data before forcing them.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">
            What the model computes — and what it ignores
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
            {ASSUMPTIONS.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      </section>

      {/* ---- Filter bar (matches the Champions page) ---- */}
      <section className="glass mt-5 flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Search</span>
            <div className="relative">
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Champion or trait…"
                className="w-full rounded-xl border border-white/10 bg-cosmos-900/60 px-3 py-2 pr-8 text-sm text-slate-200 placeholder:text-slate-500 focus:border-nebula/50 focus:outline-none focus:ring-1 focus:ring-nebula/50"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-display text-[10px] text-slate-500">
                /
              </kbd>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Carry</span>
            <select value={carry} onChange={(e) => setCarry(e.target.value)} className={SELECT_CLS}>
              <option value="all">All carries</option>
              {carries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Trait</span>
            <select value={trait} onChange={(e) => setTrait(e.target.value)} className={SELECT_CLS}>
              <option value="all">All traits</option>
              {traits.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as LabSort)} className={SELECT_CLS}>
              <option value="score">Score ↓</option>
              <option value="carry">Carry DPS ↓</option>
              <option value="front">Frontline EHP ↓</option>
              <option value="cost">Board cost ↑</option>
            </select>
          </label>
        </div>

        {/* Damage type — the carry's best-in-slot archetype */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 font-display text-[10px] uppercase tracking-wider text-slate-400">Damage</span>
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
            {DAMAGE_OPTS.map((d) => {
              const active = damage === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDamage(d.id)}
                  className={cx(
                    'seg-btn px-3 py-1.5 text-xs font-bold',
                    active && d.id === 'AD' && 'bg-ad/20 text-ad-light ring-1 ring-ad/50',
                    active && d.id === 'AP' && 'bg-ap/20 text-ap-light ring-1 ring-ap/50',
                    active && (d.id === 'all' || d.id === 'Hybrid') && 'bg-nebula/25 text-white ring-1 ring-nebula/50',
                    !active && 'hover:bg-white/5',
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Novelty vs the curated meta */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 font-display text-[10px] uppercase tracking-wider text-slate-400">Show</span>
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
            {NOVELTY_OPTS.map((n) => (
              <button
                key={n.id}
                type="button"
                aria-pressed={novelty === n.id}
                onClick={() => setNovelty(n.id)}
                className={cx(
                  'seg-btn px-3 py-1.5 text-xs font-semibold',
                  novelty === n.id ? 'bg-nebula/25 text-white ring-1 ring-nebula/50' : 'hover:bg-white/5',
                )}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 flex flex-col gap-4">
        {shown.length === 0 ? (
          <div className="glass p-10 text-center text-sm text-slate-400">
            No boards match those filters. <button
              type="button"
              onClick={() => {
                setQ('');
                setCarry('all');
                setTrait('all');
                setDamage('all');
                setNovelty('all');
              }}
              className="text-nebula underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          shown.map((b) => (
            <BoardCard key={b.units.join('|')} board={b} rank={rankOf.get(b.units.join('|')) ?? 0} />
          ))
        )}
      </section>
      <p className="mt-3 text-right text-xs text-slate-500">
        {shown.length} of {boards.length} shown
      </p>

      <SiteFooter>
        <p>
          Boards are machine-discovered from CommunityDragon unit math — no human picked them. Regenerate with{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">npm run build:theorycraft</code>.
        </p>
      </SiteFooter>
    </>
  );
}

// ---- one discovered board --------------------------------------------------

function BoardCard({ board, rank }: { board: BoardScore; rank: number }) {
  // Re-derive per-unit math live (cheap) — same numbers the score ranks on.
  const evals = useMemo(() => evaluateBoardUnits(board.units, STAR), [board.units]);
  const novelty = useMemo(() => noveltyOf(board.units), [board.units]);
  const keyTraits = board.activeTraits.filter((t) => t.tierLevel > 0);
  const carryEval = evals.find((u) => u.name === board.suggestedCarry);
  const carryBareDps = carryEval ? carryEval.dps : 0;
  const itemMult = carryBareDps > 0 ? board.suggestedCarryDps / carryBareDps : 0;
  const dmg = boardDamageType(board.suggestedCarry);

  return (
    <article className="glass p-4">
      {/* Header row: rank, trait identity, novelty */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 font-display text-sm font-black text-slate-300 ring-1 ring-white/10">
            {rank}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {keyTraits.map((t, idx) => (
              <span
                key={t.name}
                className={cx(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-display text-[11px] font-semibold ring-1',
                  idx === 0 ? 'bg-nebula/20 text-nebula ring-nebula/40' : 'bg-white/5 text-slate-300 ring-white/10',
                )}
                title={`tier ${t.tierLevel}`}
              >
                {t.name} {t.count}
              </span>
            ))}
            {board.suggestedEmblem && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-0.5 font-display text-[11px] font-semibold text-fuchsia-200"
                title={`One ${board.suggestedEmblem} unit (or emblem) short of this trait's next breakpoint`}
              >
                + {board.suggestedEmblem} emblem
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cx(
              'rounded-md px-2 py-0.5 font-display text-[11px] font-bold ring-1',
              dmg === 'AD'
                ? 'bg-ad/20 text-ad-light ring-ad/40'
                : dmg === 'AP'
                  ? 'bg-ap/20 text-ap-light ring-ap/40'
                  : 'bg-fuchsia-400/15 text-fuchsia-200 ring-fuchsia-400/40',
            )}
            title={`${board.suggestedCarry} itemizes as ${dmg}`}
          >
            {dmg}
          </span>
          <span
            className={cx('rounded-md px-2 py-0.5 font-display text-[11px] font-bold ring-1', NOVELTY_STYLE[novelty.label])}
            title={novelty.similarTo ? `${novelty.overlap}/8 units shared with “${novelty.similarTo}”` : 'no curated comp shares 3+ units'}
          >
            {novelty.label}
          </span>
        </div>
      </div>

      {/* Unit chips — carry-high-first, the suggested carry flagged */}
      <div className="mt-3 flex flex-wrap gap-2">
        {evals.map((u) => {
          const c = champOf(u.name);
          const cs = costStyle(c?.cost ?? 1);
          const isCarry = u.name === board.suggestedCarry;
          const chip = (
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs',
                cs.border,
                cs.bg,
                isCarry ? 'ring-1 ring-amber-400/60' : '',
              )}
            >
              {c?.portrait ? (
                <img src={c.portrait} alt="" className={cx('h-5 w-5 rounded ring-1', cs.ring)} loading="lazy" />
              ) : (
                <span className={cx('grid h-5 w-5 place-items-center rounded text-[10px]', cs.text)}>
                  {u.name.charAt(0)}
                </span>
              )}
              <span className={cx('font-medium', cs.text)}>{u.name}</span>
              {isCarry && <span className="font-display text-[9px] font-bold uppercase text-amber-300">carry</span>}
            </span>
          );
          return c ? (
            <a key={u.name} href={championHref(c.id)} className="transition hover:brightness-125">
              {chip}
            </a>
          ) : (
            <span key={u.name}>{chip}</span>
          );
        })}
      </div>

      {/* Suggested carry build — the itemized lens the ranking now uses */}
      {board.suggestedCarryItems.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2">
          <span className="font-display text-[10px] font-bold uppercase tracking-wider text-amber-300">
            {board.suggestedCarry} build
          </span>
          <div className="flex flex-wrap gap-1.5">
            {board.suggestedCarryItems.map((it) => (
              <span key={it} className="chip py-0.5 text-[11px]">
                {it}
              </span>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-slate-400">
            {carryBareDps > 0 && (
              <>
                <span className="tabular-nums text-slate-500" title="bare 2★ DPS, no items">
                  {round0(carryBareDps).toLocaleString()}
                </span>
                <span className="mx-1 text-slate-600">→</span>
              </>
            )}
            <span className="font-display font-bold tabular-nums text-amber-200" title="itemized DPS with this build">
              {round0(board.suggestedCarryDps).toLocaleString()}
            </span>{' '}
            DPS
            {itemMult >= 1.1 && <span className="ml-1 text-amber-300/80">({itemMult.toFixed(1)}×)</span>}
          </span>
        </div>
      )}

      {/* Headline math tiles */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile label="Carry DPS" sub={`${board.suggestedCarry} · itemized`} value={round0(board.suggestedCarryDps)} accent="text-amber-300" />
        <Tile label="Frontline EHP" sub="top 3 units" value={round0(board.frontPower)} accent="text-emerald-300" />
        <Tile label="Board cost" sub="gold to field" value={board.cost} accent="text-sky-300" />
      </div>

      {/* Per-unit breakdown */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">
          Per-unit DPS / EHP at {STAR}★
        </summary>
        <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-1.5 font-display font-semibold">Unit</th>
                <th className="px-3 py-1.5 text-right font-display font-semibold">Bare DPS</th>
                <th className="px-3 py-1.5 text-right font-display font-semibold">Itemized</th>
                <th className="px-3 py-1.5 text-right font-display font-semibold">Auto / Ability</th>
                <th className="px-3 py-1.5 text-right font-display font-semibold">Eff. HP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {evals.map((u) => {
                const e = u.evaluation;
                const isCarry = u.name === board.suggestedCarry;
                return (
                  <tr key={u.name} className={isCarry ? 'bg-amber-400/5' : undefined}>
                    <td className="px-3 py-1.5 text-slate-200">{u.name}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-100">{round0(u.dps)}</td>
                    <td
                      className={cx('px-3 py-1.5 text-right font-medium', isCarry ? 'text-amber-200' : 'text-slate-300')}
                      title={`best-in-slot (${u.bestItemLabel}): ${u.bestItems.join(', ')}`}
                    >
                      {round0(u.itemizedDps)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-400">
                      {round0(e.autoDps)} / {round0(e.ability.dps)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{round0(u.ehp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          Steady-state averages with the board's trait breakpoints folded in.{' '}
          <span className="text-slate-400">Itemized</span> is each unit's ceiling with its own best-in-slot 3-item build
          (hover for the build) — the lens the carry pick uses. No positioning, targeting, cast timing, or crowd control —
          relative comparison only.
        </p>
      </details>
    </article>
  );
}

function Tile({ label, sub, value, accent }: { label: string; sub: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-cosmos-900/50 px-3 py-2">
      <div className="font-display text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cx('font-display text-lg font-bold tabular-nums', accent)}>{value.toLocaleString()}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}
