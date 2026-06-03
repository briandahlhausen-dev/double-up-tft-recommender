// ---------------------------------------------------------------------------
// Shared CommunityDragon TFT data access (no API key needed). Used by the
// champion-catalog generator and the champion-stats aggregator so both pull
// names, costs, traits, items, and image URLs from the same source of truth.
// ---------------------------------------------------------------------------
import { normalizeName } from '../classify';
import type {
  AugmentTier,
  UnitMath,
  ItemMath,
  TraitMath,
  TraitTierMath,
  AbilityScaling,
} from '../../src/types';

const CDRAGON_TFT = 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json';
const GAME_CDN = 'https://raw.communitydragon.org/latest/game/';
export const SET_MUTATOR = 'TFTSet17'; // the base Set 17 (not _PAIRS / _PVEMODE)

// CommunityDragon stores asset paths like "ASSETS/Characters/…/X.TFT_Set17.tex".
// The raw game CDN serves them lowercased with a .png extension.
export function assetUrl(path: string | undefined | null): string {
  if (!path) return '';
  return GAME_CDN + path.toLowerCase().replace(/\.(tex|dds)$/, '.png');
}

export interface CdragonChampion {
  apiName: string;
  name: string;
  cost: number;
  traits: string[];
  tileIcon: string; // HUD square portrait
  squareIcon: string; // splash tile
}
export interface CdragonItem {
  apiName: string;
  name: string;
  icon: string;
  completed: boolean; // a standard 2-component combat item (not a component/emblem/consumable)
}

// A "best item" worth showing is an evergreen completed combat item: the
// TFT_Item_ namespace (no set prefix), built from exactly two components, and
// not a trait Emblem (Spatula/Frying Pan builds). The raw catalog also carries
// thousands of dead items from old sets — those never appear in a Set 17 match,
// so resolving against this flag keeps champion item stats to the real ~48.
function isCompletedItem(apiName: string, composition: string[]): boolean {
  if (!/^TFT_Item_[A-Za-z]/.test(apiName)) return false;
  if (composition.length !== 2) return false;
  if (/emblem/i.test(apiName)) return false;
  if (composition.some((c) => /spatula|fryingpan/i.test(c))) return false;
  return true;
}
export interface Cdragon {
  champions: CdragonChampion[];
  items: Map<string, CdragonItem>; // keyed by exact apiName (match-v1 itemNames)
}

// Playable Set 17 units only: the set's champion list also carries summons,
// PvE monsters, and armory props (cost 8/11, foreign prefixes), so filter to
// the TFT17_ prefix, shop costs 1..5, and units that actually have traits.
function isPlayable(c: any): boolean {
  return /^TFT17_/.test(c.apiName) && c.cost >= 1 && c.cost <= 5 && Array.isArray(c.traits) && c.traits.length > 0;
}

export async function fetchCdragon(): Promise<Cdragon> {
  const res = await fetch(CDRAGON_TFT);
  if (!res.ok) throw new Error(`CommunityDragon fetch failed: ${res.status}`);
  const data = (await res.json()) as any;

  const set = (data.setData as any[]).find((s) => s.mutator === SET_MUTATOR);
  if (!set) throw new Error(`set "${SET_MUTATOR}" not found in CommunityDragon data`);

  const champions: CdragonChampion[] = (set.champions as any[]).filter(isPlayable).map((c) => ({
    apiName: c.apiName,
    name: c.name,
    cost: c.cost,
    traits: (c.traits as string[]).filter((t) => t && t !== 'Choose Trait'),
    tileIcon: c.tileIcon,
    squareIcon: c.squareIcon,
  }));

  const items = new Map<string, CdragonItem>();
  for (const i of data.items as any[]) {
    if (!i.apiName || !i.name || !i.icon) continue;
    const composition: string[] = Array.isArray(i.composition) ? i.composition : [];
    items.set(i.apiName, {
      apiName: i.apiName,
      name: i.name,
      icon: i.icon,
      completed: isCompletedItem(i.apiName, composition),
    });
  }

  return { champions, items };
}

// ---- Augment metadata ----------------------------------------------------
// match-v1 reports the augments a player took as raw apiNames. CommunityDragon
// carries each one in the same `items` array (apiName contains "_Augment_"),
// with a display name + an ASSETS icon path. There is NO explicit rarity field,
// so tier is read from the well-known roman-numeral suffix the art uses
// (…_I / …_II / …_III, or the "Missing-T2/3" placeholders) — null when the icon
// doesn't encode it, so the overlay never invents a rarity it can't prove.
export interface CdragonAugment {
  apiName: string;
  name: string;
  icon: string; // raw ASSETS path — run through assetUrl() before use
  tier: AugmentTier | null;
}

const ROMAN_TIER: Record<string, AugmentTier> = { I: 'silver', II: 'gold', III: 'prismatic' };
const NUM_TIER: Record<string, AugmentTier> = { '1': 'silver', '2': 'gold', '3': 'prismatic' };

export function augmentTierFromIcon(icon: string | undefined | null): AugmentTier | null {
  if (!icon) return null;
  const file = (icon.split('/').pop() ?? '').replace(/\.(tex|dds|png)$/i, '');
  const base = file.split('.')[0]; // drop the ".TFT_Set17…/.TFT_17_3" cdragon tag
  const roman = base.match(/[_-](III|II|I)$/);
  if (roman) return ROMAN_TIER[roman[1]];
  const placeholder = base.match(/[_-]T([123])$/i); // "Missing-T2" art placeholders
  if (placeholder) return NUM_TIER[placeholder[1]];
  return null;
}

/** Map of augment apiName -> display metadata, for resolving crawled augments. */
export async function fetchAugmentMeta(): Promise<Map<string, CdragonAugment>> {
  const res = await fetch(CDRAGON_TFT);
  if (!res.ok) throw new Error(`CommunityDragon fetch failed: ${res.status}`);
  const data = (await res.json()) as any;

  const map = new Map<string, CdragonAugment>();
  for (const i of data.items as any[]) {
    if (!i.apiName || !/_Augment_/i.test(i.apiName) || !i.name || !i.icon) continue;
    map.set(i.apiName, {
      apiName: i.apiName,
      name: i.name,
      icon: i.icon,
      tier: augmentTierFromIcon(i.icon),
    });
  }
  return map;
}

// ---- Theorycraft math extraction ----------------------------------------
// The same cdragon file carries the deep numbers behind every unit: base
// stats, ability scaling variables, completed-item stat effects, and trait
// breakpoint variables. We pull them faithfully (no interpretation here — the
// combat model and the offline AI layer do that downstream). `npm run
// build:math` writes the result to src/data/unit-math.ts.

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Damage scaling read straight from the desc icons; 'none' = flat/utility. */
export function abilityScalingFromDesc(desc: string | undefined | null): AbilityScaling {
  if (!desc) return 'none';
  const ap = /scaleAP/i.test(desc);
  const ad = /scaleAD/i.test(desc);
  if (ap && ad) return 'mixed';
  if (ap) return 'AP';
  if (ad) return 'AD';
  return 'none';
}

export function extractUnitMath(set: any): UnitMath[] {
  return (set.champions as any[])
    .filter(isPlayable)
    .filter((c) => c.stats && c.ability && Array.isArray(c.ability.variables) && c.ability.variables.length)
    .map((c): UnitMath => ({
      apiName: c.apiName,
      name: c.name,
      cost: c.cost,
      traits: (c.traits as string[]).filter((t) => t && t !== 'Choose Trait'),
      stats: {
        hp: Math.round(c.stats.hp),
        armor: Math.round(c.stats.armor),
        magicResist: Math.round(c.stats.magicResist),
        damage: r3(c.stats.damage),
        attackSpeed: r3(c.stats.attackSpeed),
        critChance: r3(c.stats.critChance),
        critMultiplier: r3(c.stats.critMultiplier),
        mana: Math.round(c.stats.mana),
        initialMana: Math.round(c.stats.initialMana),
        range: Math.round(c.stats.range),
      },
      ability: {
        name: c.ability.name ?? '',
        scaling: abilityScalingFromDesc(c.ability.desc),
        // Persist the raw tooltip verbatim — it's the only record of how the
        // variables combine, which the Stage 3 formula layer reads offline.
        desc: typeof c.ability.desc === 'string' ? c.ability.desc : '',
        variables: (c.ability.variables as any[])
          .filter((v) => v && typeof v.name === 'string' && Array.isArray(v.value))
          .map((v) => ({
            name: v.name as string,
            value: (v.value as any[]).map((x) => (typeof x === 'number' && Number.isFinite(x) ? r3(x) : 0)),
          })),
      },
    }));
}

export function extractItemMath(data: any): ItemMath[] {
  const out: ItemMath[] = [];
  for (const i of data.items as any[]) {
    if (!i.apiName || !i.name) continue;
    const composition: string[] = Array.isArray(i.composition) ? i.composition : [];
    if (!isCompletedItem(i.apiName, composition)) continue;
    const effects: Record<string, number> = {};
    if (i.effects && typeof i.effects === 'object') {
      for (const [k, v] of Object.entries(i.effects)) {
        if (typeof v === 'number' && Number.isFinite(v)) effects[k] = r3(v);
      }
    }
    out.push({ apiName: i.apiName, name: i.name, effects });
  }
  return out;
}

export function extractTraitMath(set: any): TraitMath[] {
  const out: TraitMath[] = [];
  for (const t of set.traits as any[]) {
    if (!t.apiName || !t.name || !/^TFT17_/.test(t.apiName) || !Array.isArray(t.effects)) continue;
    const tiers: TraitTierMath[] = (t.effects as any[]).map((e) => {
      const variables: Record<string, number> = {};
      if (e.variables && typeof e.variables === 'object') {
        for (const [k, v] of Object.entries(e.variables)) {
          if (typeof v === 'number' && Number.isFinite(v)) variables[k] = r3(v);
        }
      }
      return { minUnits: Number(e.minUnits ?? 0), maxUnits: Number(e.maxUnits ?? 0), variables };
    });
    out.push({ apiName: t.apiName, name: t.name, tiers });
  }
  return out;
}

/** Fetch cdragon once and extract all three math layers. */
export async function fetchUnitMath(): Promise<{ units: UnitMath[]; items: ItemMath[]; traits: TraitMath[] }> {
  const res = await fetch(CDRAGON_TFT);
  if (!res.ok) throw new Error(`CommunityDragon fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  const set = (data.setData as any[]).find((s) => s.mutator === SET_MUTATOR);
  if (!set) throw new Error(`set "${SET_MUTATOR}" not found in CommunityDragon data`);
  return { units: extractUnitMath(set), items: extractItemMath(data), traits: extractTraitMath(set) };
}

export { normalizeName };
