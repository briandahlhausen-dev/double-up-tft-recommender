import type { Comp, DamageType } from '../types';

// ---------------------------------------------------------------------------
// Shared Item Economy — given the #1 recommendation vs the partner comp, work
// out which component shards route to whom. In Double Up you share a carousel
// pool and pass items, so keeping AD/AP off each other's toes is real value.
// ---------------------------------------------------------------------------

const SHARD_LIST: Record<DamageType, string[]> = {
  AD: ['B.F. Sword', 'Recurve Bow'],
  AP: ['Needlessly Large Rod', 'Tear of the Goddess'],
  hybrid: ['B.F. Sword', 'Recurve Bow', 'Needlessly Large Rod', 'Tear of the Goddess'],
};

const TANK_SHARDS = ["Giant's Belt", 'Negatron Cloak', 'Chain Vest'];

const ACCENT: Record<DamageType, 'ad' | 'ap' | 'neutral'> = {
  AD: 'ad',
  AP: 'ap',
  hybrid: 'neutral',
};

export interface EconomyColumn {
  owner: 'you' | 'partner' | 'shared';
  title: string;
  shards: string[];
  accent: 'ad' | 'ap' | 'neutral';
}

export interface ItemEconomy {
  columns: EconomyColumn[];
  note: string;
  collision: boolean;
}

function shortName(c: Comp): string {
  return c.name.split('—')[0].split('/')[0].trim();
}

function carryName(c: Comp): string {
  return c.carries[0]?.name ?? shortName(c);
}

export function itemEconomy(mine: Comp, partner: Comp): ItemEconomy {
  const md = mine.primaryDamage;
  const pd = partner.primaryDamage;

  const columns: EconomyColumn[] = [
    { owner: 'you', title: `You · ${shortName(mine)} (${md})`, shards: SHARD_LIST[md], accent: ACCENT[md] },
    { owner: 'partner', title: `Partner · ${shortName(partner)} (${pd})`, shards: SHARD_LIST[pd], accent: ACCENT[pd] },
    { owner: 'shared', title: 'Shared · frontline', shards: [...TANK_SHARDS, 'Sparring Gloves (flex)'], accent: 'neutral' },
  ];

  const hybrid = md === 'hybrid' || pd === 'hybrid';
  const collision = !hybrid && md === pd;

  let note: string;
  if (collision) {
    note = `Collision — both boards itemise ${md}. Agree early on who completes ${carryName(mine)} vs ${carryName(partner)} first; the other slow-rolls components or pivots a slot to the off-stat so you aren't both starved.`;
  } else if (hybrid) {
    const flexer = md === 'hybrid' ? `Your ${shortName(mine)}` : `Your partner's ${shortName(partner)}`;
    note = `${flexer} runs hybrid, so it bends around the pure-damage carry. Give the single-type board first pick of its shards, then build the hybrid carry from whatever's left.`;
  } else {
    note = `Clean split — you scoop ${SHARD_LIST[md].join(' & ')} for ${carryName(mine)}, your partner takes ${SHARD_LIST[pd].join(' & ')} for ${carryName(partner)}. Belts, Cloaks and Chains flow to whichever frontline needs to stabilise shared HP.`;
  }

  return { columns, note, collision };
}
