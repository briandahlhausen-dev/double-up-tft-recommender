// ---------------------------------------------------------------------------
// Live duo-link config — the ONE seam where the feature is enabled.
//
// Live board sharing talks to a Firebase Realtime Database over its plain REST
// API: no Firebase SDK, no apiKey, no login at runtime. A Realtime Database URL
// is NOT a secret — access is governed entirely by the database `rules`, which
// for this project permit read/write ONLY under `/rooms` (TFT boards, no PII).
// So this value is safe to commit and ship to the client.
//
// To enable: create a free Firebase project, add a Realtime Database, set its
// rules to `{ "rules": { "rooms": { "$room": { ".read": true, ".write": true } } } }`,
// and paste the database URL below. Leave it '' to keep live sharing OFF — the
// UI then falls back to the static share code, and the app stays 100% static.
// ---------------------------------------------------------------------------

export const RTDB_URL = 'https://doubleuptft-10022-default-rtdb.firebaseio.com';

/** True when a database URL is configured, so the live UI should activate. */
export const liveEnabled = (): boolean => RTDB_URL.trim().length > 0;

/** Normalised base (no trailing slash) for building REST paths. */
export const rtdbBase = (): string => RTDB_URL.trim().replace(/\/+$/, '');
