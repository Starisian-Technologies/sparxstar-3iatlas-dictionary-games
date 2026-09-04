export { default as GameShell } from './components/GameShell.jsx';
export { default as AccessoryBar } from './components/AccessoryBar.jsx';
export { default as SessionComplete } from './components/SessionComplete.jsx';
export { useGameSet } from './hooks/useGameSet.js';
export { useGameSession } from './hooks/useGameSession.js';
export { useProgressSync } from './hooks/useProgressSync.js';
export { openDB, getRecord, putRecord, getAllRecords, deleteRecord } from './hooks/idbUtils.js';
export { PRODUCTION_GAMES } from './constants.js';
/*
 * `createDictionaryApiClient` and `DictionaryApiError` are GONE, not moved.
 *
 * They existed to call the Dictionary REST API from a browser, carrying either
 * an ephemeral page token or — worse, and the reason the type contract warned
 * about it — a consumer API key. The Dictionary API is private: no browser,
 * anonymous user, or unregistered application may call it, and the Dictionary
 * Node treats a browser-shaped header on a credentialed request as a
 * PRIORITY_1 security event.
 *
 * A host that needs dictionary content mounts <GameShell /> with `bffPath`
 * pointing at a server-side BFF that holds a credential (this repo ships one
 * in `server/`). Re-exporting a browser client for a private API would be
 * publishing the exact capability the architecture removes.
 */
