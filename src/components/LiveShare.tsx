import { useCallback, useEffect, useMemo, useState } from 'react';
import { cx } from '../lib/cx';
import { liveHref } from '../lib/router';
import {
  fetchRoom,
  pushMember,
  createRoom,
  leaveRoom,
  clientId,
  newRoomCode,
  type Room,
} from '../lib/liveSync';
import { decodeBuilder, buildCustomComp } from '../lib/customComp';
import type { BuilderState } from '../lib/customComp';

// ---------------------------------------------------------------------------
// Live duo link — a small panel that mirrors YOUR board into a shared room and
// shows your friend's board live (polled every few seconds), with one click to
// compare against it. Each side writes only its own member slot, so concurrent
// edits never clobber. Rendered only when liveEnabled() (parent gates it), so
// hooks here always run. Degrades to nothing on any network failure.
// ---------------------------------------------------------------------------

const ROOM_KEY = 'dutft.live-room.v1';
const NAME_KEY = 'dutft.live-name.v1';
const POLL_MS = 4000;

interface Props {
  myCode: string; // encoded board (customComp.encodeBuilder) to broadcast
  onCompare: (state: BuilderState, who: string) => void; // load a friend's board as the partner
  onActivate?: () => void; // fired when a room becomes active (focus the shared "my board")
  initialRoom?: string; // from #/live/<code>
}

const readLS = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export function LiveShare({ myCode, onCompare, onActivate, initialRoom }: Props) {
  const myId = clientId();
  const [roomId, setRoomId] = useState<string | null>(() => initialRoom ?? readLS(ROOM_KEY));
  const [name, setName] = useState<string>(() => readLS(NAME_KEY) ?? '');
  const [joinInput, setJoinInput] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [online, setOnline] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [busy, setBusy] = useState(false);

  // Persist room + name across refreshes (the whole point of "stay linked").
  useEffect(() => {
    try {
      if (roomId) localStorage.setItem(ROOM_KEY, roomId);
      else localStorage.removeItem(ROOM_KEY);
    } catch {
      /* ignore */
    }
  }, [roomId]);
  useEffect(() => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
  }, [name]);

  // A link landed us in a room: join it and focus the board we'll be sharing.
  useEffect(() => {
    if (initialRoom) {
      setRoomId(initialRoom);
      onActivate?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoom]);

  // Poll the room so a refresh (or just waiting) shows the partner's latest board.
  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setOnline(false);
      return;
    }
    let active = true;
    const ac = new AbortController();
    const tick = async () => {
      const r = await fetchRoom(roomId, ac.signal);
      if (!active) return;
      setOnline(r != null);
      if (r) {
        setRoom(r);
        setLastSync(Date.now());
      }
    };
    void tick();
    const iv = setInterval(() => void tick(), POLL_MS);
    return () => {
      active = false;
      ac.abort();
      clearInterval(iv);
    };
  }, [roomId]);

  // Broadcast my board whenever it changes (debounced) — writes only my slot.
  useEffect(() => {
    if (!roomId) return;
    const t = setTimeout(() => {
      void pushMember(roomId, { name: name.trim() || undefined, code: myCode, at: Date.now() });
    }, 700);
    return () => clearTimeout(t);
  }, [roomId, myCode, name]);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    const id = newRoomCode();
    const ok = await createRoom(id, { name: name.trim() || undefined, code: myCode, at: Date.now() });
    setBusy(false);
    if (ok) {
      setRoomId(id);
      onActivate?.();
    } else setError('Could not reach the live server — check your connection and try again.');
  }, [name, myCode, onActivate]);

  const join = useCallback(async () => {
    const id = joinInput.trim().toUpperCase();
    if (!id) return;
    setBusy(true);
    setError(null);
    const r = await fetchRoom(id);
    setBusy(false);
    if (!r) {
      setError(`No live session "${id}" — double-check the code with your duo.`);
      return;
    }
    setRoomId(id);
    setJoinInput('');
    onActivate?.();
    void pushMember(id, { name: name.trim() || undefined, code: myCode, at: Date.now() });
  }, [joinInput, name, myCode, onActivate]);

  const leave = useCallback(async () => {
    const id = roomId;
    setRoomId(null);
    setRoom(null);
    if (id) await leaveRoom(id);
    try {
      if (location.hash.startsWith('#/live/')) history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    } catch {
      /* ignore */
    }
  }, [roomId]);

  const copy = async (kind: 'code' | 'link') => {
    if (!roomId) return;
    const text = kind === 'code' ? roomId : `${location.origin}${location.pathname}${liveHref(roomId)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the value is still visible to copy by hand */
    }
  };

  // Everyone in the room except me, freshest first, with their decoded board.
  const others = useMemo(() => {
    if (!room?.members) return [];
    return Object.entries(room.members)
      .filter(([id]) => id !== myId)
      .map(([id, m]) => {
        const state = decodeBuilder(m.code ?? '');
        const comp = state ? buildCustomComp(state) : null;
        return { id, name: (m.name || '').trim() || 'Your duo', at: m.at ?? 0, state, comp };
      })
      .sort((a, b) => b.at - a.at);
  }, [room, myId]);

  const syncAge = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 1000)) : null;

  return (
    <section className="glass mt-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">
          Live duo link {roomId && <span className="ml-1 align-middle text-xs font-normal text-slate-400">· room {roomId}</span>}
        </h2>
        {roomId && (
          <span
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
              online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300',
            )}
          >
            <span className={cx('h-2 w-2 rounded-full', online ? 'bg-emerald-400' : 'bg-amber-400')} />
            {online ? (syncAge != null ? `live · synced ${syncAge}s ago` : 'live') : 'reconnecting…'}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        Syncs your board from the <span className="font-semibold text-slate-300">Build my board</span> tab above; tap a
        duo&apos;s board to compare against it.
      </p>

      {!roomId ? (
        <div className="mt-3">
          <p className="text-sm text-slate-300">
            Create a live session and send the code to your duo. You each build your own board and see the other&apos;s
            update in real time — no refresh, no accounts.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Your name (optional)
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 24))}
                placeholder="e.g. Brian"
                className="w-full rounded-lg border border-white/10 bg-cosmos-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 sm:w-44"
              />
            </label>
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="seg-btn bg-nebula/25 text-white ring-1 ring-nebula/50 hover:bg-nebula/35 disabled:opacity-50"
            >
              {busy ? 'Starting…' : '⚡ Start live session'}
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-xs uppercase tracking-wide text-slate-500">or join with a code</span>
            <div className="flex gap-2">
              <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 8))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder="ABC123"
                className="w-32 rounded-lg border border-white/10 bg-cosmos-900/60 px-3 py-2 font-mono text-sm tracking-widest text-white placeholder:text-slate-600"
              />
              <button type="button" onClick={join} disabled={busy || !joinInput.trim()} className="seg-btn hover:bg-white/5 disabled:opacity-50">
                Join
              </button>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-white/5 px-3 py-1.5 font-mono text-base tracking-widest text-nebula">{roomId}</code>
            <button type="button" onClick={() => copy('code')} className="seg-btn hover:bg-white/5">
              {copied === 'code' ? '✓ Copied' : '⧉ Copy code'}
            </button>
            <button type="button" onClick={() => copy('link')} className="seg-btn hover:bg-white/5">
              {copied === 'link' ? '✓ Copied' : '🔗 Copy link'}
            </button>
            <button type="button" onClick={leave} className="seg-btn ml-auto text-slate-400 hover:bg-white/5 hover:text-rose-300">
              Leave
            </button>
          </div>

          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wide text-slate-500">Your duo&apos;s boards</h3>
            {others.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">
                Waiting for someone to join with code <span className="font-mono text-slate-300">{roomId}</span>… share it and
                their board will appear here live.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {others.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{o.name}</div>
                      <div className="truncate text-xs text-slate-400">
                        {o.comp ? `${o.comp.units.length} units · ${o.comp.name}` : 'no units yet'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => o.state && onCompare(o.state, o.name)}
                      disabled={!o.state}
                      className="seg-btn bg-nebula/20 text-white ring-1 ring-nebula/40 hover:bg-nebula/30 disabled:opacity-40"
                    >
                      Compare ↓
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      )}
    </section>
  );
}
