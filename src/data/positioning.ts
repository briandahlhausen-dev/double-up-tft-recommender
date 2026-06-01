import type { BoardSlot } from '../types';

// ---------------------------------------------------------------------------
// Hand-authored recommended positioning for each curated comp.
//
// TFT board, from the player's perspective: 4 rows x 7 columns.
//   row 0 = front line (engages the enemy first)   …   row 3 = backline
//   col 0 = far left                                …   col 6 = far right
//
// Principles applied across the boards: tanks spread along the front to soak
// engage; the primary carry tucked into a back corner where it lives longest;
// assassins parked on a flank to dive the enemy backline; supports/rerollers
// kept mid-back. Unit names match comps.ts DISPLAY names exactly (the board
// joins to the champion catalog by name).
//
// This is structural guidance, not crawled stats — positioning isn't something
// the snapshot measures, so it's authored here rather than machine-written.
// ---------------------------------------------------------------------------

const at = (unit: string, row: number, col: number): BoardSlot => ({ unit, row, col });

export const POSITIONING: Record<string, BoardSlot[]> = {
  'darkstar-karma': [
    at('The Mighty Mech', 0, 1),
    at("Cho'Gath", 0, 2),
    at('Mordekaiser', 0, 3),
    at('Pantheon', 0, 4),
    at('Lissandra', 1, 3),
    at('Jhin', 2, 5),
    at('Karma', 3, 0),
    at("Kai'Sa", 3, 6),
  ],
  'nova-brawler-viktor': [
    at('Maokai', 0, 1),
    at('Ornn', 0, 2),
    at('Aatrox', 0, 3),
    at('Gragas', 0, 4),
    at('Rhaast', 1, 5),
    at('Morgana', 2, 2),
    at('Viktor', 3, 0),
    at('Miss Fortune', 3, 6),
  ],
  'vanguard-vex': [
    at('Nunu & Willump', 0, 2),
    at('Shen', 0, 3),
    at('Aatrox', 0, 4),
    at('Akali', 0, 6),
    at('Morgana', 1, 3),
    at('Fiora', 1, 5),
    at('Vex', 3, 0),
    at('Graves', 3, 1),
  ],
  'marauder-yi-kindred': [
    at('Tahm Kench', 0, 1),
    at('Maokai', 0, 2),
    at('Gragas', 0, 3),
    at('Urgot', 0, 4),
    at('Akali', 0, 6),
    at("Bel'Veth", 1, 5),
    at('Master Yi', 2, 5),
    at('Kindred', 3, 0),
  ],
  'brawler-reroll-gragas': [
    at('Tahm Kench', 0, 1),
    at('Maokai', 0, 2),
    at('Pantheon', 0, 3),
    at('Urgot', 0, 4),
    at('Pyke', 0, 6),
    at('Gragas', 1, 2),
    at('Master Yi', 2, 5),
    at('Viktor', 3, 0),
  ],
  'fateweaver-rogue-reroll': [
    at('Jax', 0, 2),
    at('Aatrox', 0, 3),
    at('Gwen', 0, 4),
    at('Talon', 0, 6),
    at('Rhaast', 1, 3),
    at('Morgana', 2, 1),
    at('Twisted Fate', 2, 5),
    at('Caitlyn', 3, 0),
  ],
  'space-groove-snipers': [
    at('Blitzcrank', 0, 1),
    at('Nunu & Willump', 0, 2),
    at('Ornn', 0, 3),
    at('Jax', 0, 4),
    at('Xayah', 3, 0),
    at('Samira', 3, 6),
  ],
  'replicator-nova-mf': [
    at('Nunu & Willump', 0, 1),
    at('Maokai', 0, 2),
    at('Aatrox', 0, 3),
    at('Jax', 0, 4),
    at('Pantheon', 0, 6),
    at('Lulu', 2, 1),
    at('Nami', 2, 2),
    at('Miss Fortune', 3, 0),
  ],
  'bastion-meeple-cait': [
    at('Poppy', 0, 1),
    at('Aatrox', 0, 2),
    at('Ornn', 0, 3),
    at('Rammus', 0, 4),
    at('Shen', 0, 5),
    at('Jax', 1, 1),
    at('Corki', 2, 5),
    at('Caitlyn', 3, 0),
  ],
  'meeple-reroll': [
    at('Poppy', 0, 2),
    at('Rammus', 0, 3),
    at('Riven', 0, 4),
    at('Fizz', 1, 4),
    at('Milio', 2, 1),
    at('Bard', 2, 2),
    at('Meepsie', 3, 1),
    at('Corki', 3, 6),
  ],
};
