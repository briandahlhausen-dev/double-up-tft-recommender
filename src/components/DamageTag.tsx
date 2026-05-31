import type { DamageType } from '../types';
import { cx } from '../lib/cx';

/** Amber = AD, cyan = AP, violet = hybrid. The split should read at a glance. */
export function DamageTag({ type, className }: { type: DamageType; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1',
        type === 'AD' && 'bg-ad/15 text-ad-light ring-ad/40',
        type === 'AP' && 'bg-ap/15 text-ap-light ring-ap/40',
        type === 'hybrid' && 'bg-nebula/15 text-violet-200 ring-nebula/40',
        className,
      )}
    >
      {type}
    </span>
  );
}
