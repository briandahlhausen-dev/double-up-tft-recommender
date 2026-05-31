import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPS } from '../src/data/comps';
import type { Contested } from '../src/types';
import { writeStatsFile, type CompStats } from './lib/write-stats';

// ---------------------------------------------------------------------------
// INTERIM, NO-API-KEY IMPORTER
//
// Reads a hand-filled JSON snapshot of comp performance numbers and writes
// src/data/stats.ts. Use this today while a production Riot key is in approval:
// read the numbers off any stats site, drop them in a JSON file, run it.
//
//   npm run import                      # reads scripts/data-in.json
//   npm run import -- path/to/file.json # reads a custom path
//
// Input shape (see scripts/data-in.example.json):
//   { "<comp-id>": { "avgPlace": 3.24, "top4": 76, "first": 24, "contested": "moderate" } }
//
// This is a FULL REPLACE: any comp absent from the file falls back to its seed
// numbers in comps.ts. Unknown comp ids and out-of-range values are hard errors.
// ---------------------------------------------------------------------------

const CONTESTED_VALUES: Contested[] = ['low', 'moderate', 'high', 'severe'];
const VALID_IDS = new Set(COMPS.map((c) => c.id));

function fail(msg: string): never {
  console.error(`✖ import failed: ${msg}`);
  process.exit(1);
}

function num(compId: string, field: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`"${compId}".${field} must be a number (got ${JSON.stringify(value)})`);
  }
  if (value < min || value > max) {
    fail(`"${compId}".${field} = ${value} is out of range ${min}..${max}`);
  }
  return value;
}

function main(): void {
  const inputArg = process.argv[2] ?? 'scripts/data-in.json';
  const inputPath = resolve(process.cwd(), inputArg);

  let raw: string;
  try {
    raw = readFileSync(inputPath, 'utf8');
  } catch {
    fail(`could not read ${inputPath}. Copy scripts/data-in.example.json to scripts/data-in.json and edit it.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`${inputPath} is not valid JSON — ${(e as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail('top-level JSON must be an object keyed by comp id');
  }

  const input = parsed as Record<string, Record<string, unknown>>;
  const stats: Record<string, CompStats> = {};

  for (const [compId, entry] of Object.entries(input)) {
    if (!VALID_IDS.has(compId)) {
      fail(`unknown comp id "${compId}". Valid ids: ${[...VALID_IDS].join(', ')}`);
    }
    if (typeof entry !== 'object' || entry === null) {
      fail(`"${compId}" must map to an object`);
    }
    const contested = entry.contested as Contested;
    if (!CONTESTED_VALUES.includes(contested)) {
      fail(`"${compId}".contested must be one of ${CONTESTED_VALUES.join(' | ')} (got ${JSON.stringify(entry.contested)})`);
    }
    stats[compId] = {
      avgPlace: num(compId, 'avgPlace', entry.avgPlace, 1, 8),
      top4: num(compId, 'top4', entry.top4, 0, 100),
      first: num(compId, 'first', entry.first, 0, 100),
      contested,
      sampleSize: typeof entry.sampleSize === 'number' ? entry.sampleSize : 0,
    };
  }

  const count = Object.keys(stats).length;
  if (count === 0) fail('no comps in input — nothing to write');

  const written = writeStatsFile(stats, 'manual-import');
  console.log(`✓ wrote ${count} comp${count === 1 ? '' : 's'} → ${written}`);
  const untouched = COMPS.filter((c) => !stats[c.id]).map((c) => c.id);
  if (untouched.length) {
    console.log(`  (${untouched.length} not in file, using seed numbers: ${untouched.join(', ')})`);
  }
}

main();
