import type { Comp } from '../src/types';

// One unit on a player's board, with the items it was holding.
export interface BoardUnit {
  name: string; // normalized champion key (see normalizeName)
  items: string[]; // raw item apiNames as Riot reports them (e.g. "TFT_Item_InfinityEdge")
  tier: number; // star level 1..3
}

// A single player's board, distilled from a Riot match participant.
export interface Board {
  matchId: string;
  placement: number;
  units: BoardUnit[];
  traits: string[]; // normalized active-trait keys (tier_current > 0)
  augments: string[]; // raw augment apiNames, exactly as Riot reports them
}

// Collapse a Riot id or a display name to a comparable key:
//   "TFT14_MissFortune" -> "missfortune"   "Miss Fortune" -> "missfortune"
//   "TFT14_DarkStar"    -> "darkstar"      "N.O.V.A."     -> "nova"
// Stripping the "TFTxx_" prefix means we never hard-depend on the set number.
export function normalizeName(raw: string): string {
  return raw.replace(/^tft\d+[a-z]?_/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface Signature {
  id: string;
  primaryCarry: string; // normalized key of carries[0] — must be present to match
  carryKeys: string[]; // normalized keys of all carries
  traitKeys: string[]; // normalized keys of the comp's defining traits
}

// Derive a classification signature from each comp's hand-authored structure,
// so comps.ts stays the single source of truth (no parallel signature file).
export function buildSignatures(comps: Comp[]): Signature[] {
  return comps.map((c) => ({
    id: c.id,
    primaryCarry: normalizeName(c.carries[0].name),
    carryKeys: c.carries.map((cr) => normalizeName(cr.name)),
    traitKeys: c.traits.map(normalizeName),
  }));
}

// Assign a board to the best-matching comp, or null if none fit.
// A comp only matches when its PRIMARY carry is on the board; among those,
// the most shared carries win, with shared traits as the tiebreaker.
export function classifyBoard(board: Board, signatures: Signature[]): string | null {
  const units = new Set(board.units.map((u) => u.name));
  const traits = new Set(board.traits);

  let bestId: string | null = null;
  let bestScore = 0;

  for (const sig of signatures) {
    if (!units.has(sig.primaryCarry)) continue;
    const carryHits = sig.carryKeys.reduce((n, k) => n + (units.has(k) ? 1 : 0), 0);
    const traitHits = sig.traitKeys.reduce((n, k) => n + (traits.has(k) ? 1 : 0), 0);
    const score = carryHits * 10 + traitHits; // carries dominate; traits break ties
    if (score > bestScore) {
      bestScore = score;
      bestId = sig.id;
    }
  }
  return bestId;
}
