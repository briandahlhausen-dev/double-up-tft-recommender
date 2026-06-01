import { Fragment, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { CHAMPIONS } from '../data/champions';
import { cx } from '../lib/cx';
import { costStyle } from '../lib/cost';
import { Segmented } from './Segmented';
import { DamageTag } from './DamageTag';
import { buildCustomComp, traitBreakdown, ALL_TRAITS, encodeBuilder } from '../lib/customComp';
import type { BuilderState, CarryRole } from '../lib/customComp';
import { boardHref } from '../lib/router';

// Double Up boards top out around 10–11 units late; a soft cap keeps the list sane.
const MAX_UNITS = 11;
const ROLES: CarryRole[] = ['none', 'AD', 'AP'];
const BY_COST = [...CHAMPIONS].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Fallback for insecure contexts where navigator.clipboard is unavailable.
function copyViaTextarea(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Assemble a board from the champion catalog. Owns no comp logic itself — it
 * edits a BuilderState that the parent turns into a synthetic Comp via
 * buildCustomComp(). State is lifted so it survives mode switches.
 *
 * The roster is an always-visible click-to-toggle palette (not a type-then-pick
 * dropdown) so building a board is a few taps rather than a search per unit.
 *
 * Generic over WHOSE board it is: the partner flow uses the defaults ("Partner's
 * board", share enabled), while the "build my board" flow relabels it and hides
 * the share link via props.
 */
export function BoardBuilder({
  state,
  onChange,
  title = "Partner's board",
  playstyleLabel = 'Partner playstyle',
  showShare = true,
  emptyHint,
}: {
  state: BuilderState;
  onChange: (s: BuilderState) => void;
  title?: string;
  playstyleLabel?: string;
  showShare?: boolean;
  emptyHint?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const atCap = state.unitIds.length >= MAX_UNITS;
  const picked = useMemo(() => new Set(state.unitIds), [state.unitIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? BY_COST.filter((c) => c.name.toLowerCase().includes(q) || c.traits.some((t) => t.toLowerCase().includes(q)))
      : BY_COST;
  }, [query]);

  // Group the (already cost-sorted) matches into tiers so the palette shows a
  // labelled break between 1-cost, 2-cost, … instead of one undifferentiated wall.
  const tiers = useMemo(() => {
    const groups = new Map<number, typeof matches>();
    for (const c of matches) {
      const arr = groups.get(c.cost);
      if (arr) arr.push(c);
      else groups.set(c.cost, [c]);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  const champ = (id: string) => CHAMPIONS.find((c) => c.id === id);
  const derived = buildCustomComp(state);
  const traits = traitBreakdown(state);

  const addUnit = (id: string) => {
    if (atCap || picked.has(id)) return;
    onChange({ ...state, unitIds: [...state.unitIds, id] });
  };
  const removeUnit = (id: string) => {
    const roles = { ...state.roles };
    delete roles[id];
    const emblems = { ...state.emblems };
    delete emblems[id];
    onChange({ ...state, unitIds: state.unitIds.filter((u) => u !== id), roles, emblems });
  };
  const toggleUnit = (id: string) => (picked.has(id) ? removeUnit(id) : addUnit(id));
  const setRole = (id: string, role: CarryRole) =>
    onChange({ ...state, roles: { ...state.roles, [id]: role } });
  const addEmblem = (id: string, trait: string) => {
    const cur = state.emblems[id] ?? [];
    if (cur.includes(trait)) return;
    onChange({ ...state, emblems: { ...state.emblems, [id]: [...cur, trait] } });
  };
  const removeEmblem = (id: string, trait: string) => {
    const next = (state.emblems[id] ?? []).filter((t) => t !== trait);
    const emblems = { ...state.emblems };
    if (next.length) emblems[id] = next;
    else delete emblems[id];
    onChange({ ...state, emblems });
  };
  const clearAll = () => onChange({ ...state, unitIds: [], roles: {}, emblems: {} });
  const shareBoard = async () => {
    const url = `${location.origin}${location.pathname}${boardHref(encodeBuilder(state))}`;
    const ok = (await writeClipboard(url)) || copyViaTextarea(url);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  // Enter adds the first match that isn't already on the board, then clears the
  // filter so you can immediately type the next champion.
  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = matches.find((c) => !picked.has(c.id));
    if (next && !atCap) {
      addUnit(next.id);
      setQuery('');
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="font-display text-xs uppercase tracking-wider text-slate-300">{title}</label>
        <div className="flex items-baseline gap-2.5 text-[11px] text-slate-500">
          {showShare && state.unitIds.length > 0 && (
            <button
              type="button"
              onClick={shareBoard}
              title="Copy a link that loads this exact board — send it to your duo"
              className={cx(
                'font-medium underline-offset-2 hover:underline',
                copied ? 'text-emerald-300' : 'text-nebula hover:text-violet-300',
              )}
            >
              {copied ? '✓ Link copied' : '⧉ Share board'}
            </button>
          )}
          <span>
            {state.unitIds.length}/{MAX_UNITS} units
            {state.unitIds.length > 0 && (
              <button type="button" onClick={clearAll} className="ml-2 text-slate-400 underline-offset-2 hover:text-rose-300 hover:underline">
                clear
              </button>
            )}
          </span>
        </div>
      </div>

      {/* Filter — narrows the palette below; Enter adds the first match */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onSearchKeyDown}
        placeholder="Filter by name or trait — press Enter to add the first match"
        className="w-full rounded-xl border border-white/10 bg-cosmos-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-nebula/50 focus:outline-none"
      />

      {/* Always-visible click-to-toggle roster */}
      <div className="mt-2 grid max-h-96 grid-cols-5 gap-2 overflow-auto rounded-xl border border-white/10 bg-cosmos-900/40 p-2 sm:grid-cols-7">
        {matches.length === 0 ? (
          <p className="col-span-full px-2 py-6 text-center text-xs text-slate-500">No champions match “{query.trim()}”.</p>
        ) : (
          tiers.map(([cost, champs]) => {
            const ts = costStyle(cost);
            return (
              <Fragment key={cost}>
                <div className="col-span-full mt-2 flex items-center gap-2 px-0.5 first:mt-0">
                  <span className={cx('text-[10px] font-bold uppercase tracking-wider', ts.text)}>{cost}-cost</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                {champs.map((c) => {
                  const selected = picked.has(c.id);
                  const blocked = atCap && !selected;
                  const cs = costStyle(c.cost);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleUnit(c.id)}
                      disabled={blocked}
                      aria-pressed={selected}
                      title={blocked ? 'Board full — remove a unit first' : c.name}
                      className={cx('group flex flex-col items-center gap-1 rounded-lg', blocked && 'cursor-not-allowed opacity-30')}
                    >
                      <span
                        className={cx(
                          'relative aspect-square w-full overflow-hidden rounded-lg ring-2 transition',
                          selected ? 'ring-nebula' : cs.ring,
                          !blocked && 'group-hover:ring-white/60',
                        )}
                      >
                        <img src={c.portrait} alt="" loading="lazy" className="h-full w-full object-cover" />
                        <span className={cx('absolute bottom-0 left-0 rounded-tr px-1 text-[9px] font-bold leading-tight', cs.bg, cs.text)}>
                          {c.cost}
                        </span>
                        {selected && (
                          <span className="absolute inset-0 flex items-center justify-center bg-nebula/40 text-base font-black text-white">✓</span>
                        )}
                      </span>
                      <span className={cx('w-full truncate text-center text-[10px] leading-tight', selected ? 'font-semibold text-white' : 'text-slate-400')}>
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </Fragment>
            );
          })
        )}
      </div>

      {/* Selected board — assign carries here */}
      {state.unitIds.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-sm text-slate-400">
          {emptyHint ?? (
            <>
              Tap your partner&apos;s champions above to build their board, then mark each carry{' '}
              <DamageTag type="AD" className="mx-0.5" /> or <DamageTag type="AP" className="mx-0.5" /> so the engine can route items around them.
            </>
          )}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {state.unitIds.map((id) => {
            const c = champ(id);
            if (!c) return null;
            const role = state.roles[id] ?? 'none';
            const cs = costStyle(c.cost);
            const chosen = state.emblems[id] ?? [];
            const emblemOptions = ALL_TRAITS.filter((t) => !c.traits.includes(t) && !chosen.includes(t));
            return (
              <li key={id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                <div className="flex items-center gap-2.5">
                  <img src={c.portrait} alt="" loading="lazy" className={cx('h-9 w-9 shrink-0 rounded-md object-cover ring-2', cs.ring)} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{c.name}</span>
                  <div className="flex shrink-0 gap-0.5 rounded-lg border border-white/10 bg-cosmos-900/60 p-0.5">
                    {ROLES.map((r) => {
                      const active = role === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={active}
                          title={r === 'none' ? 'Not a carry' : `Carry — ${r} items`}
                          onClick={() => setRole(id, r)}
                          className={cx(
                            'rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide transition',
                            !active && 'text-slate-400 hover:text-white',
                            active && r === 'none' && 'bg-white/10 text-slate-200',
                            active && r === 'AD' && 'bg-ad/20 text-ad-light ring-1 ring-ad/50',
                            active && r === 'AP' && 'bg-ap/20 text-ap-light ring-1 ring-ap/50',
                          )}
                        >
                          {r === 'none' ? '—' : r}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUnit(id)}
                    aria-label={`Remove ${c.name}`}
                    className="shrink-0 rounded-md px-1.5 py-1 text-slate-500 transition hover:bg-white/5 hover:text-rose-300"
                  >
                    ✕
                  </button>
                </div>

                {/* Emblems — grant this unit an off-trait (e.g. a Brawler emblem on a Rogue) */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[2.875rem]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Emblems</span>
                  {chosen.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-md border border-nebula/40 bg-nebula/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-200"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeEmblem(id, t)}
                        aria-label={`Remove ${t} emblem from ${c.name}`}
                        className="text-violet-300/70 transition hover:text-rose-300"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {emblemOptions.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && addEmblem(id, e.target.value)}
                      aria-label={`Add an emblem to ${c.name}`}
                      className="rounded-md border border-dashed border-white/15 bg-cosmos-900/80 px-1.5 py-0.5 text-[11px] text-slate-400 transition hover:border-nebula/50 hover:text-slate-200 focus:border-nebula/50 focus:outline-none"
                    >
                      <option value="" disabled>
                        + emblem
                      </option>
                      {emblemOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Trait counts — emblems folded in, exactly like the in-game trait tracker */}
      {state.unitIds.length > 0 && traits.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="font-display text-xs uppercase tracking-wider text-slate-300">Traits</span>
            <span className="text-[11px] text-slate-500">emblems counted in</span>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-cosmos-900/40 p-2.5">
            {traits.map((t) => (
              <span
                key={t.trait}
                title={t.emblems ? `+${t.emblems} from emblem${t.emblems > 1 ? 's' : ''}` : undefined}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs',
                  t.emblems
                    ? 'border-nebula/40 bg-nebula/10 text-violet-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-300',
                )}
              >
                <span className="font-display text-sm font-bold text-white">{t.count}</span>
                <span className="font-medium">{t.trait}</span>
                {t.emblems > 0 && <span className="text-nebula">◈</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Playstyle + derived item type */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Segmented
          label={playstyleLabel}
          hint="early vs late"
          value={state.playstyle}
          onChange={(v) => onChange({ ...state, playstyle: v })}
          options={[
            { value: 'aggressive', label: 'Aggressive' },
            { value: 'scaling', label: 'Econ & scale' },
          ]}
        />
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="font-display text-xs uppercase tracking-wider text-slate-300">Item type</span>
            <span className="text-[11px] text-slate-500">auto from carries</span>
          </div>
          <div className="flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-white/10 bg-cosmos-900/60 px-3 py-2">
            {derived ? (
              <>
                <DamageTag type={derived.primaryDamage} />
                <span className="min-w-0 truncate text-xs text-slate-400">
                  {derived.carries.length
                    ? derived.carries.map((cr) => cr.name).join(', ')
                    : 'no carry marked — flexes either way'}
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-500">add a unit to begin</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
