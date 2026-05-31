import type { Comp, DamageType, Playstyle } from '../types';
import { CHAMPIONS } from '../data/champions';

// ---------------------------------------------------------------------------
// Custom partner board — let the user assemble the team their duo is actually
// running instead of picking a predefined comp. We turn that pick list into a
// synthetic Comp the recommender can score against.
//
// The engine only reads a few partner fields (see recommend.ts): `units` (for
// overlap), `primaryDamage` (item complement), `playstyle` (board synergy),
// `id` (so the partner isn't scored against itself) and `name` (reason text).
// Everything else is filled with inert defaults — it never reaches scoring.
//
// CRITICAL: `units` must hold catalog DISPLAY names (e.g. "Miss Fortune"), not
// normalized ids, because COMPS.units are display names and overlap is a plain
// string match. The catalog's `name` field already matches those strings.
// ---------------------------------------------------------------------------

export const CUSTOM_COMP_ID = '__custom__';

/** Per-unit role: not a carry, or a carry itemising AD / AP. */
export type CarryRole = 'none' | 'AD' | 'AP';

export interface BuilderState {
  unitIds: string[]; // catalog ids, in the order added
  roles: Record<string, CarryRole>; // catalog id -> carry role
  emblems: Record<string, string[]>; // catalog id -> granted trait names (emblems held)
  playstyle: Playstyle;
}

export const EMPTY_BUILDER: BuilderState = { unitIds: [], roles: {}, emblems: {}, playstyle: 'scaling' };

const NAME_BY_ID = new Map(CHAMPIONS.map((c) => [c.id, c.name]));
const TRAITS_BY_ID = new Map(CHAMPIONS.map((c) => [c.id, c.traits]));
const VALID_IDS = new Set(CHAMPIONS.map((c) => c.id));

/** Every trait in the catalog, de-duped and alphabetised — the emblem menu. */
export const ALL_TRAITS: string[] = [...new Set(CHAMPIONS.flatMap((c) => c.traits))].sort((a, b) =>
  a.localeCompare(b),
);
const VALID_TRAITS = new Set(ALL_TRAITS);

// Remember the partner board between sessions so you don't re-enter it every
// game. Pure client-side (localStorage) — no account, no server.
const LS_KEY = 'dutft.partner-board.v1';

/**
 * Validate a loosely-typed board (from storage OR a share link) into a clean
 * BuilderState: drop unknown ids, keep only AD/AP roles, and keep only real,
 * de-duped, non-innate emblem traits. Same rules whatever the source.
 */
function sanitize(parsed: Partial<BuilderState> | null | undefined): BuilderState {
  const unitIds = (Array.isArray(parsed?.unitIds) ? parsed!.unitIds : []).filter(
    (id): id is string => typeof id === 'string' && VALID_IDS.has(id),
  );
  const roles: Record<string, CarryRole> = {};
  const emblems: Record<string, string[]> = {};
  for (const id of unitIds) {
    const r = parsed?.roles?.[id];
    if (r === 'AD' || r === 'AP') roles[id] = r; // 'none' is the default — no need to persist

    // Keep only real traits this unit doesn't already have innately, de-duped.
    const innate = new Set(TRAITS_BY_ID.get(id) ?? []);
    const seen = new Set<string>();
    const kept = (Array.isArray(parsed?.emblems?.[id]) ? parsed!.emblems![id] : []).filter(
      (t): t is string =>
        typeof t === 'string' && VALID_TRAITS.has(t) && !innate.has(t) && !seen.has(t) && (seen.add(t), true),
    );
    if (kept.length) emblems[id] = kept;
  }
  const playstyle: Playstyle = parsed?.playstyle === 'aggressive' ? 'aggressive' : 'scaling';
  return { unitIds, roles, emblems, playstyle };
}

/** Read a saved board, dropping any ids the current catalog no longer has. */
export function loadBuilder(): BuilderState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY_BUILDER;
    return sanitize(JSON.parse(raw) as Partial<BuilderState> | null);
  } catch {
    return EMPTY_BUILDER;
  }
}

// ---- Share links ---------------------------------------------------------
// Encode the board into a compact, URL-safe code so a player can hand their duo
// a link that loads their exact board. Stays 100% client-side: the code is just
// the board, base64url'd into the hash — no server, no shortener, no storage.

interface WireBoard {
  u: string[]; // unit ids
  r?: Record<string, 'AD' | 'AP'>; // carry roles (omit 'none')
  e?: Record<string, string[]>; // emblems
  p?: 1; // playstyle: 1 = aggressive (omitted = scaling)
}

const b64urlEncode = (s: string): string => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

/** Compact, URL-safe code for the current board (catalog ids + traits are ASCII). */
export function encodeBuilder(state: BuilderState): string {
  const r: Record<string, 'AD' | 'AP'> = {};
  for (const [id, role] of Object.entries(state.roles)) if (role === 'AD' || role === 'AP') r[id] = role;
  const wire: WireBoard = { u: state.unitIds };
  if (Object.keys(r).length) wire.r = r;
  if (Object.keys(state.emblems).length) wire.e = state.emblems;
  if (state.playstyle === 'aggressive') wire.p = 1;
  return b64urlEncode(JSON.stringify(wire));
}

/** Decode a share-link code back into a validated board, or null if unusable. */
export function decodeBuilder(code: string): BuilderState | null {
  try {
    const wire = JSON.parse(b64urlDecode(code)) as WireBoard | null;
    if (!wire || !Array.isArray(wire.u)) return null;
    const clean = sanitize({
      unitIds: wire.u,
      roles: wire.r,
      emblems: wire.e,
      playstyle: wire.p === 1 ? 'aggressive' : 'scaling',
    });
    return clean.unitIds.length ? clean : null;
  } catch {
    return null;
  }
}

/** Persist the partner board. Silently no-ops if storage is unavailable. */
export function saveBuilder(state: BuilderState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota / disabled — fine to skip */
  }
}

/** Derive the board's dominant item type from its marked carries. */
export function derivePrimaryDamage(damages: readonly string[]): DamageType {
  const dmg = new Set(damages.filter((r): r is 'AD' | 'AP' => r === 'AD' || r === 'AP'));
  return dmg.size === 1 ? [...dmg][0] : 'hybrid'; // 0 carries or mixed = flexes either way
}

/** One trait's active-unit count on the board, and how many of those came from emblems. */
export interface TraitCount {
  trait: string;
  count: number; // total units contributing (innate + emblem)
  emblems: number; // how many of `count` are emblem grants
}

/**
 * Tally trait counts across the board, folding emblems in exactly like the game:
 * an emblem only adds to a trait the unit doesn't already have innately (a second
 * Brawler emblem on a Brawler is wasted), so each unit counts at most once per trait.
 * Sorted by count desc, then name, so the biggest active traits lead.
 */
export function traitBreakdown(state: BuilderState): TraitCount[] {
  const total = new Map<string, number>();
  const fromEmblem = new Map<string, number>();
  for (const id of state.unitIds) {
    const innate = TRAITS_BY_ID.get(id);
    if (!innate) continue;
    const set = new Set(innate);
    for (const e of state.emblems[id] ?? []) {
      if (!set.has(e)) {
        set.add(e);
        fromEmblem.set(e, (fromEmblem.get(e) ?? 0) + 1);
      }
    }
    for (const t of set) total.set(t, (total.get(t) ?? 0) + 1);
  }
  return [...total.entries()]
    .map(([trait, count]): TraitCount => ({ trait, count, emblems: fromEmblem.get(trait) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.trait.localeCompare(b.trait));
}

/**
 * Build a synthetic partner Comp from builder state, or null when the board is
 * empty (so the page can show a prompt instead of bogus recommendations).
 */
export function buildCustomComp(state: BuilderState): Comp | null {
  const units = state.unitIds
    .map((id) => NAME_BY_ID.get(id))
    .filter((n): n is string => Boolean(n));
  if (units.length === 0) return null;

  const carries = state.unitIds
    .filter((id) => state.roles[id] === 'AD' || state.roles[id] === 'AP')
    .map((id) => ({ name: NAME_BY_ID.get(id)!, damageType: state.roles[id] as DamageType, items: [] as string[] }));

  const primaryDamage = derivePrimaryDamage(carries.map((c) => c.damageType));
  const name = carries.length ? carries.map((c) => c.name).join(' + ') : 'Custom board';

  return {
    id: CUSTOM_COMP_ID,
    name,
    traits: [],
    carries,
    frontline: [],
    units,
    primaryDamage,
    playstyle: state.playstyle,
    tempo: 'tempo',
    levelStrategy: 'Custom board',
    contested: 'low',
    avgPlace: 2.5,
    top4: 50,
    first: 25,
    augments: [],
  };
}
