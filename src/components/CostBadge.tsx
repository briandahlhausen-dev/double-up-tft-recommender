import { costStyle } from '../lib/cost';
import { cx } from '../lib/cx';

/** Small gold-coin-style cost pill, colored by TFT rarity. */
export function CostBadge({ cost, className }: { cost: number; className?: string }) {
  const s = costStyle(cost);
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-display text-[11px] font-bold leading-none ring-1',
        s.bg,
        s.text,
        s.ring,
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {cost}
    </span>
  );
}
