import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export function SiteFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="mt-10 border-t border-white/10 pt-5 text-center text-xs text-slate-500">
      {children}
      <p className={cx(Boolean(children) && 'mt-1.5')}>Not affiliated with Riot Games. Built for duo queue planning.</p>
    </footer>
  );
}
