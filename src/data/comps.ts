import type { Comp } from '../types';
import { COMP_STATS } from './stats';

// ---------------------------------------------------------------------------
// SEED DATASET — Diamond+ Double Up, patches 17.3–17.4
// (metatft / tactics.tools / metabot). Treat values as a snapshot; they shift
// every patch. This module is the single source of truth for comp STRUCTURE:
// add or edit a comp here and the app picks it up with no other code changes.
//
// The avgPlace / top4 / first / contested values below are SEED FALLBACKS.
// When the data pipeline (npm run import / npm run refresh) writes real numbers
// into stats.ts, those override the seeds per comp id — see the overlay at the
// bottom of this file. Comps with no entry in stats.ts keep their seed numbers.
// ---------------------------------------------------------------------------
const BASE_COMPS: Comp[] = [
  {
    id: 'darkstar-karma',
    name: 'Dark Star — Karma & Kai\'Sa',
    traits: ['Dark Star', 'Voyager', 'Brawler'],
    carries: [
      { name: 'Karma', damageType: 'AP', items: ['Jeweled Gauntlet', 'Rabadon\'s Deathcap', 'Spear of Shojin'] },
      { name: 'Kai\'Sa', damageType: 'AD', items: ['Infinity Edge', 'Striker\'s Flail', 'Spear of Shojin'] },
    ],
    frontline: ['Cho\'Gath', 'Mordekaiser', 'Pantheon', 'The Mighty Mech'],
    units: ['Cho\'Gath', 'Lissandra', 'Mordekaiser', 'Pantheon', 'Kai\'Sa', 'Karma', 'The Mighty Mech', 'Jhin'],
    primaryDamage: 'AP',
    playstyle: 'scaling',
    tempo: 'fast8',
    levelStrategy: 'Fast 8 / Lvl 7 reroll',
    contested: 'severe',
    avgPlace: 3.5,
    top4: 60,
    first: 18,
    augments: ['Dark Star trait', 'AP combat', 'Econ'],
  },
  {
    id: 'nova-brawler-viktor',
    name: 'N.O.V.A. / Brawler — Viktor + Ornn',
    traits: ['N.O.V.A.', 'Brawler', 'Conduit', 'Psionic', 'Bastion'],
    carries: [
      { name: 'Viktor', damageType: 'AP', items: ['Sympathetic Implant', 'Jeweled Gauntlet', 'Rabadon\'s Deathcap'] },
      { name: 'Ornn', damageType: 'AP', items: ['Gargoyle Stoneplate', 'Sunfire Cape', 'Warmog\'s Armor'] },
    ],
    frontline: ['Ornn', 'Aatrox', 'Gragas', 'Maokai'],
    units: ['Aatrox', 'Gragas', 'Maokai', 'Miss Fortune', 'Ornn', 'Rhaast', 'Viktor', 'Morgana'],
    primaryDamage: 'AP',
    playstyle: 'scaling',
    tempo: 'fast8',
    levelStrategy: 'Fast 8',
    contested: 'moderate',
    avgPlace: 3.24,
    top4: 76,
    first: 24,
    augments: ['N.O.V.A. / Conduit trait', 'AP combat', 'Econ (Timebreaker)'],
  },
  {
    id: 'vanguard-vex',
    name: 'Vanguard — Vex & Nunu',
    traits: ['Vanguard', 'Replicator', 'Eradicator'],
    carries: [
      { name: 'Vex', damageType: 'AP', items: ['Rabadon\'s Deathcap', 'Nashor\'s Tooth', 'Red Buff'] },
    ],
    frontline: ['Aatrox', 'Akali', 'Nunu & Willump', 'Shen', 'Morgana'],
    units: ['Aatrox', 'Akali', 'Nunu & Willump', 'Vex', 'Fiora', 'Graves', 'Morgana', 'Shen'],
    primaryDamage: 'AP',
    playstyle: 'scaling',
    tempo: 'fast8',
    levelStrategy: 'Fast 8',
    contested: 'low',
    avgPlace: 2.39,
    top4: 70,
    first: 20,
    augments: ['Vanguard trait', 'AP combat', 'Fast-8 econ'],
  },
  {
    id: 'marauder-yi-kindred',
    name: 'Marauder — Master Yi & Kindred',
    traits: ['Marauder', 'Brawler'],
    carries: [
      { name: 'Kindred', damageType: 'AD', items: ['Guinsoo\'s Rageblade', 'Last Whisper', 'Kraken\'s Fury'] },
      { name: 'Master Yi', damageType: 'AD', items: ['Edge of Night', 'Quicksilver', 'Infinity Edge'] },
    ],
    frontline: ['Gragas', 'Maokai', 'Urgot', 'Tahm Kench'],
    units: ['Gragas', 'Maokai', 'Urgot', 'Kindred', 'Master Yi', 'Akali', 'Bel\'Veth', 'Tahm Kench'],
    primaryDamage: 'AD',
    playstyle: 'scaling',
    tempo: 'fast8',
    levelStrategy: 'Fast 8 (item dependent)',
    contested: 'moderate',
    avgPlace: 2.34,
    top4: 72,
    first: 22,
    augments: ['Marauder trait', 'AD combat', 'Fast-8 econ'],
  },
  {
    id: 'brawler-reroll-gragas',
    name: 'Brawler Reroll — Gragas & Master Yi',
    traits: ['Brawler', 'Dark Star', 'Psionic'],
    carries: [
      { name: 'Gragas', damageType: 'AP', items: ['Sympathetic Implant', 'Jeweled Gauntlet', 'Hand of Justice'] },
      { name: 'Master Yi', damageType: 'AD', items: ['Giant Slayer', 'Quicksilver', 'Infinity Edge'] },
    ],
    frontline: ['Cho\'Gath', 'Pantheon', 'Maokai', 'Urgot'],
    units: ['Gragas', 'Pantheon', 'Maokai', 'Urgot', 'Master Yi', 'Pyke', 'Viktor', 'Tahm Kench'],
    primaryDamage: 'hybrid',
    playstyle: 'aggressive',
    tempo: 'reroll',
    levelStrategy: 'Lvl 6 reroll',
    contested: 'high',
    avgPlace: 2.24,
    top4: 65,
    first: 20,
    augments: ['Reroll augment', 'Brawler trait', 'Hybrid combat'],
  },
  {
    id: 'fateweaver-rogue-reroll',
    name: 'Fateweaver / Rogue Reroll — Caitlyn',
    traits: ['Rogue', 'Fateweaver', 'Bastion'],
    carries: [
      { name: 'Caitlyn', damageType: 'AD', items: ['Deathblade', 'Guinsoo\'s Rageblade', 'Kraken\'s Fury'] },
    ],
    frontline: ['Aatrox', 'Jax', 'Talon'],
    units: ['Aatrox', 'Caitlyn', 'Talon', 'Twisted Fate', 'Gwen', 'Jax', 'Rhaast', 'Morgana'],
    primaryDamage: 'AD',
    playstyle: 'aggressive',
    tempo: 'reroll',
    levelStrategy: 'Lvl 6–7 reroll',
    contested: 'moderate',
    avgPlace: 3.51,
    top4: 68,
    first: 22,
    augments: ['Reroll augment', 'Rogue / Fateweaver trait', 'AD combat'],
  },
  {
    id: 'space-groove-snipers',
    name: 'Space Groove Snipers — Xayah & Samira',
    traits: ['Space Groove', 'Sniper', 'Bastion', 'Vanguard'],
    carries: [
      { name: 'Xayah', damageType: 'AD', items: ['Guinsoo\'s Rageblade', 'Last Whisper', 'Giant Slayer'] },
      { name: 'Samira', damageType: 'AD', items: ['Deathblade', 'Infinity Edge', 'Spear of Shojin'] },
    ],
    frontline: ['Jax', 'Ornn', 'Nunu & Willump', 'Blitzcrank'],
    units: ['Jax', 'Ornn', 'Samira', 'Nunu & Willump', 'Xayah', 'Blitzcrank'],
    primaryDamage: 'AD',
    playstyle: 'aggressive',
    tempo: 'tempo',
    levelStrategy: 'Lvl 8 tempo push',
    contested: 'low',
    avgPlace: 3.69,
    top4: 58,
    first: 19,
    augments: ['Space Groove / Sniper emblem', 'AD attack-speed & crit', 'Econ on win-streak'],
  },
  {
    id: 'replicator-nova-mf',
    name: 'Replicator / N.O.V.A. — Miss Fortune',
    traits: ['Replicator', 'N.O.V.A.', 'Brawler', 'Bastion'],
    carries: [
      { name: 'Miss Fortune', damageType: 'AD', items: ['Infinity Edge', 'Giant Slayer', 'Spear of Shojin'] },
    ],
    frontline: ['Aatrox', 'Jax', 'Maokai', 'Nunu & Willump'],
    units: ['Aatrox', 'Jax', 'Lulu', 'Maokai', 'Miss Fortune', 'Nami', 'Nunu & Willump', 'Pantheon'],
    primaryDamage: 'AD',
    playstyle: 'scaling',
    tempo: 'fast8',
    levelStrategy: 'Fast 8',
    contested: 'moderate',
    avgPlace: 3.62,
    top4: 67,
    first: 19,
    augments: ['Replicator / N.O.V.A. trait', 'AD combat', 'Econ'],
  },
  {
    id: 'bastion-meeple-cait',
    name: 'Bastion / Meeple — Caitlyn',
    traits: ['Bastion', 'Meeple', 'N.O.V.A.', 'Fateweaver'],
    carries: [
      { name: 'Caitlyn', damageType: 'AD', items: ['Guinsoo\'s Rageblade', 'Giant Slayer', 'Kraken\'s Fury'] },
    ],
    frontline: ['Aatrox', 'Poppy', 'Ornn', 'Rammus', 'Shen'],
    units: ['Aatrox', 'Caitlyn', 'Poppy', 'Jax', 'Ornn', 'Corki', 'Rammus', 'Shen'],
    primaryDamage: 'AD',
    playstyle: 'scaling',
    tempo: 'fast8',
    levelStrategy: 'Fast 8',
    contested: 'moderate',
    avgPlace: 3.82,
    top4: 63,
    first: 20,
    augments: ['Bastion trait', 'AD combat', 'Econ'],
  },
  {
    id: 'meeple-reroll',
    name: 'Meeple Reroll — Fizz / Corki',
    traits: ['Meeple', 'Rogue', 'Fateweaver', 'Voyager'],
    carries: [
      { name: 'Fizz', damageType: 'AP', items: ['Jeweled Gauntlet', 'Nashor\'s Tooth', 'Hand of Justice'] },
      { name: 'Corki', damageType: 'AD', items: ['Deathblade', 'Last Whisper', 'Giant Slayer'] },
    ],
    frontline: ['Poppy', 'Rammus', 'The Mighty Mech', 'Shen'],
    units: ['Meepsie', 'Milio', 'Fizz', 'Corki', 'Rammus', 'Riven', 'Bard', 'Poppy'],
    primaryDamage: 'hybrid',
    playstyle: 'aggressive',
    tempo: 'reroll',
    levelStrategy: 'Lvl 7 reroll',
    contested: 'severe',
    avgPlace: 4.31,
    top4: 49,
    first: 16,
    augments: ['Reroll augment', 'Meeple trait', 'Hybrid combat'],
  },
];

// Overlay machine-written performance stats onto the hand-authored structure.
// A comp with no stats entry keeps its seed avgPlace/top4/first/contested.
export const COMPS: Comp[] = BASE_COMPS.map((comp) => {
  const stats = COMP_STATS[comp.id];
  if (!stats) return comp;
  return {
    ...comp,
    avgPlace: stats.avgPlace,
    top4: stats.top4,
    first: stats.first,
    contested: stats.contested,
  };
});
