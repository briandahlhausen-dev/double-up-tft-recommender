// TFT rarity palette, keyed by champion cost. Used to color portrait rings and
// cost badges so the grid reads at a glance: gray→green→blue→purple→gold.

export interface CostStyle {
  text: string;
  ring: string;
  bg: string;
  border: string;
  dot: string;
  glow: string;
}

const COST_STYLE: Record<number, CostStyle> = {
  1: { text: 'text-slate-200', ring: 'ring-slate-400/50', bg: 'bg-slate-400/10', border: 'border-slate-400/40', dot: 'bg-slate-300', glow: 'shadow-[0_0_0_1px_rgba(148,163,184,0.25)]' },
  2: { text: 'text-emerald-300', ring: 'ring-emerald-400/50', bg: 'bg-emerald-400/10', border: 'border-emerald-400/40', dot: 'bg-emerald-400', glow: 'shadow-[0_0_12px_rgba(52,211,153,0.25)]' },
  3: { text: 'text-sky-300', ring: 'ring-sky-400/50', bg: 'bg-sky-400/10', border: 'border-sky-400/40', dot: 'bg-sky-400', glow: 'shadow-[0_0_12px_rgba(56,189,248,0.3)]' },
  4: { text: 'text-fuchsia-300', ring: 'ring-fuchsia-400/50', bg: 'bg-fuchsia-400/10', border: 'border-fuchsia-400/40', dot: 'bg-fuchsia-400', glow: 'shadow-[0_0_14px_rgba(232,121,249,0.35)]' },
  5: { text: 'text-amber-300', ring: 'ring-amber-400/60', bg: 'bg-amber-400/10', border: 'border-amber-400/50', dot: 'bg-amber-400', glow: 'shadow-[0_0_16px_rgba(251,191,36,0.4)]' },
};

export function costStyle(cost: number): CostStyle {
  return COST_STYLE[cost] ?? COST_STYLE[1];
}
