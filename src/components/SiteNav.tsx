import type { Route } from '../lib/router';
import { cx } from '../lib/cx';

function NavTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'seg-btn',
        active ? 'bg-nebula/25 text-white ring-1 ring-nebula/50' : 'hover:bg-white/5',
      )}
    >
      {children}
    </a>
  );
}

export function SiteNav({ route }: { route: Route }) {
  const onChampions = route.name === 'champions' || route.name === 'champion';
  return (
    <nav className="no-print mb-6 flex items-center justify-between gap-3">
      <a href="#/" className="group inline-flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-nebula/20 font-display text-sm font-black text-nebula ring-1 ring-nebula/40 transition group-hover:bg-nebula/30">
          ◆
        </span>
        <span className="font-display text-sm font-bold tracking-wide text-white">
          Double Up <span className="text-nebula">TFT</span>
        </span>
      </a>
      <div className="flex gap-1 rounded-xl border border-white/10 bg-cosmos-900/60 p-1">
        <NavTab href="#/" active={route.name === 'home'}>
          Recommender
        </NavTab>
        <NavTab href="#/champions" active={onChampions}>
          Champions
        </NavTab>
        <NavTab href="#/lab" active={route.name === 'lab'}>
          Lab
        </NavTab>
      </div>
    </nav>
  );
}
