import type { Comp, BoardSlot, DamageType } from '../types';
import { CHAMPIONS } from '../data/champions';
import { costStyle } from '../lib/cost';
import { cx } from '../lib/cx';

// ---------------------------------------------------------------------------
// The positioning diagram: a TFT board (4 rows x 7 hexes) with each unit dropped
// on its recommended hex. Row 0 is the front line (top, facing the enemy); row 3
// is your backline. Hex rim is the unit's cost color; carries get a damage-typed
// rim + star so the protected backline reads instantly.
// ---------------------------------------------------------------------------

const CHAMP_BY_NAME = new Map(CHAMPIONS.map((c) => [c.name, c] as const));
const ROWS = 4;
const COLS = 7;

// Pointy-top hexagon; alternate rows shift half a hex for the honeycomb look.
const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const CARRY_RIM: Record<DamageType, string> = { AD: 'bg-ad', AP: 'bg-ap', hybrid: 'bg-nebula' };

export function HexBoard({ comp, slots }: { comp: Comp; slots: BoardSlot[] }) {
  const carryDmg = new Map(comp.carries.map((c) => [c.name, c.damageType] as const));
  const byCell = new Map(slots.map((s) => [`${s.row}-${s.col}`, s] as const));

  return (
    <div>
      <div className="mb-1.5 text-center font-display text-[9px] uppercase tracking-[0.2em] text-slate-500">
        ↑ enemy side
      </div>
      <div className="flex flex-col items-center gap-1">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className={cx('flex gap-1', row % 2 === 1 && 'ml-[1.25rem] sm:ml-[1.5rem]')}>
            {Array.from({ length: COLS }, (_, col) => {
              const slot = byCell.get(`${row}-${col}`);
              if (!slot) {
                return (
                  <div key={col} className="relative h-9 w-9 sm:h-11 sm:w-11">
                    <div className="absolute inset-0 bg-white/[0.05]" style={{ clipPath: HEX }} />
                    <div className="absolute inset-[1.5px] bg-cosmos-900/70" style={{ clipPath: HEX }} />
                  </div>
                );
              }
              const champ = CHAMP_BY_NAME.get(slot.unit);
              const dmg = carryDmg.get(slot.unit);
              const rim = dmg ? CARRY_RIM[dmg] : costStyle(champ?.cost ?? 0).dot;
              return (
                <div
                  key={col}
                  className="relative h-9 w-9 sm:h-11 sm:w-11"
                  title={`${slot.unit}${dmg ? ` — ${dmg} carry` : ''}`}
                >
                  <div className={cx('absolute inset-0', rim)} style={{ clipPath: HEX }} />
                  <div
                    className={cx('absolute overflow-hidden', dmg ? 'inset-[2.5px]' : 'inset-[2px]')}
                    style={{ clipPath: HEX }}
                  >
                    {champ ? (
                      <img
                        src={champ.portrait}
                        alt={slot.unit}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-cosmos-800 text-[8px] font-semibold text-slate-300">
                        {slot.unit.slice(0, 3)}
                      </span>
                    )}
                  </div>
                  {dmg && (
                    <span
                      className={cx(
                        'absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-black text-white ring-1 ring-cosmos-950',
                        CARRY_RIM[dmg],
                      )}
                      aria-hidden
                    >
                      ★
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-center font-display text-[9px] uppercase tracking-[0.2em] text-slate-500">
        your backline ↓
      </div>
    </div>
  );
}
