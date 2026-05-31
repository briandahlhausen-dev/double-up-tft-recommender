import { cx } from '../lib/cx';
import { tierStyle } from '../lib/tier';
import type { Tier } from '../lib/tier';

const DIM = {
  sm: 'h-5 w-5 text-[11px]',
  md: 'h-7 w-7 text-sm',
  lg: 'h-10 w-10 text-xl',
} as const;

/** Square graded tier chip (S→D), coloured by the performance heat-map. */
export function TierBadge({
  tier,
  size = 'md',
  className,
}: {
  tier: Tier;
  size?: keyof typeof DIM;
  className?: string;
}) {
  const s = tierStyle(tier);
  return (
    <span
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-md font-display font-black leading-none ring-1',
        DIM[size],
        s.bg,
        s.text,
        s.ring,
        className,
      )}
      title={`Tier ${tier}`}
      aria-label={`Tier ${tier}`}
    >
      {tier}
    </span>
  );
}
