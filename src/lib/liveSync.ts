// ---------------------------------------------------------------------------
// Live duo-link — share a board in real time with a friend via a Firebase
// Realtime Database (REST API, no SDK). A "room" is one shared document:
//
//   /rooms/<roomId> = {
//     v: 1,
//     createdAt: <ms>,
//     members: { <clientId>: { name?, code, at } }
//   }
//
// `code` is the same base64url board string the static share link uses
// (customComp.encodeBuilder), so the wire format is identical everywhere. Each
// client writes ONLY its own `/members/<clientId>` subpath, so two people
// editing at once never clobber each other — RTDB merges the disjoint writes.
// Everything degrades gracefully: any network/parse failure resolves to a safe
// empty result, and with no RTDB_URL configured every call is a no-op.
// ---------------------------------------------------------------------------

import { liveEnabled, rtdbBase } from './liveConfig';

export interface Member {
  name?: string; // optional display name
  code: string; // encodeBuilder() board code
  at: number; // last-updated, client epoch ms
}

export interface Room {
  v: number;
  createdAt: number;
  members: Record<string, Member>;
}

// No ambiguous characters (0/O/1/I) so codes are easy to read out loud / type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomId(len: number): string {
  const out: string[] = [];
  const g = globalThis.crypto;
  if (g?.getRandomValues) {
    const a = new Uint8Array(len);
    g.getRandomValues(a);
    for (let i = 0; i < len; i++) out.push(ALPHABET[a[i] % ALPHABET.length]);
  } else {
    // Fallback: only reached in ancient/headless contexts; vary by index.
    for (let i = 0; i < len; i++) out.push(ALPHABET[(i * 7 + out.length * 13) % ALPHABET.length]);
  }
  return out.join('');
}

/** A short, human-shareable room code (≈1 in a billion collision at hobby scale). */
export const newRoomCode = (): string => randomId(6);

const CLIENT_ID_KEY = 'dutft.client-id.v1';

/** Stable per-browser id so a member keeps the same slot across refreshes. */
export function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = randomId(12);
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return randomId(12);
  }
}

const roomUrl = (roomId: string): string => `${rtdbBase()}/rooms/${encodeURIComponent(roomId)}.json`;
const memberUrl = (roomId: string, cid: string): string =>
  `${rtdbBase()}/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(cid)}.json`;

async function putJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Create (or reset) a room seeded with my member entry. Returns false on failure. */
export function createRoom(roomId: string, me: Member): Promise<boolean> {
  if (!liveEnabled()) return Promise.resolve(false);
  const room: Room = { v: 1, createdAt: Date.now(), members: { [clientId()]: me } };
  return putJson(roomUrl(roomId), room);
}

/** Write my latest board into the room (only my member subpath — never clobbers others). */
export function pushMember(roomId: string, me: Member): Promise<boolean> {
  if (!liveEnabled()) return Promise.resolve(false);
  return putJson(memberUrl(roomId, clientId()), me);
}

/** Read the whole room, or null when it doesn't exist / on any error. */
export async function fetchRoom(roomId: string, signal?: AbortSignal): Promise<Room | null> {
  if (!liveEnabled()) return null;
  try {
    const res = await fetch(roomUrl(roomId), { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as Room | null;
    if (!data || typeof data !== 'object' || typeof (data as Room).members !== 'object') return null;
    return data as Room;
  } catch {
    return null;
  }
}

/** Remove my member entry on leave (best-effort). */
export async function leaveRoom(roomId: string): Promise<void> {
  if (!liveEnabled()) return;
  try {
    await fetch(memberUrl(roomId, clientId()), { method: 'DELETE' });
  } catch {
    /* best-effort */
  }
}
