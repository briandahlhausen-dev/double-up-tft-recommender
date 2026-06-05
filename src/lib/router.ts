import { useEffect, useState } from 'react';

// Dependency-free hash routing. Keeps the app a single static bundle (no router
// lib) while giving champion detail pages shareable URLs like
// #/champions/missfortune. Anchor tags with hash hrefs navigate natively and
// fire 'hashchange' — we just parse and re-render.

export type Route =
  | { name: 'home'; board?: string; room?: string } // board = encoded partner board from a share link; room = live duo-link code
  | { name: 'champions' }
  | { name: 'champion'; id: string }
  | { name: 'lab' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'champions') {
    return parts[1] ? { name: 'champion', id: decodeURIComponent(parts[1]) } : { name: 'champions' };
  }
  if (parts[0] === 'lab') {
    return { name: 'lab' };
  }
  if (parts[0] === 'board' && parts[1]) {
    return { name: 'home', board: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'live' && parts[1]) {
    return { name: 'home', room: decodeURIComponent(parts[1]) };
  }
  return { name: 'home' };
}

/** Build a shareable URL for a partner board (encoded via customComp.encodeBuilder). */
export const boardHref = (code: string): string => `#/board/${encodeURIComponent(code)}`;

/** Build a shareable URL for a live duo-link room. */
export const liveHref = (roomId: string): string => `#/live/${encodeURIComponent(roomId)}`;

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const championHref = (id: string): string => `#/champions/${encodeURIComponent(id)}`;
