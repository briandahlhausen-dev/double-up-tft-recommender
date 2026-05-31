import { cx } from '../lib/cx';

const COLOR = {
  ad: '#f59e0b',
  ap: '#22d3ee',
  mix: '#a78bfa',
} as const;

export function MatchRing({
  pct,
  accent,
  size = 64,
}: {
  pct: number;
  accent: 'ad' | 'ap' | 'mix';
  size?: number;
}) {
  const stroke = Math.max(5, size * 0.09);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - clamped / 100);
  const color = COLOR[accent];
  const mid = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cx('shrink-0', accent === 'ad' && 'drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]', accent === 'ap' && 'drop-shadow-[0_0_6px_rgba(34,211,238,0.35)]', accent === 'mix' && 'drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]')}
      role="img"
      aria-label={`${Math.round(clamped)} percent match`}
    >
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${mid} ${mid})`}
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-white font-display font-bold">
        <tspan style={{ fontSize: size * 0.3 }}>{Math.round(clamped)}</tspan>
        <tspan dy={-size * 0.09} className="fill-slate-400" style={{ fontSize: size * 0.15 }}>
          %
        </tspan>
      </text>
    </svg>
  );
}
