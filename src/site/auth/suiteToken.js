/**
 * The suite token holder — memory, and nowhere else.
 *
 * ============================ THE RULE ============================
 * The Identity suite token lives in the module-scoped `token` variable below
 * for the lifetime of the JavaScript realm, and is written to NO persistent
 * store: not `localStorage`, not `sessionStorage`, not IndexedDB, not a cookie,
 * not a URL parameter, not a log line. Closing or reloading the tab destroys
 * it, and the player signs in again.
 * ==================================================================
 *
 * WHY, given WordPad persists its token in `localStorage` and this site does
 * not. The two are not inconsistent decisions about the same risk; they are
 * different risks:
 *
 *   - WordPad needs the token at cold start to unwrap the encryption key for
 *     documents already on the device. Without persistence its offline-first
 *     promise breaks, so it accepts the XSS exposure and pays for it with a
 *     separate key store the token alone cannot open.
 *
 *   - This site needs the token for exactly one thing: attaching
 *     `Authorization` to `POST /events/batch` so finished results can settle.
 *     Losing it on refresh costs a sign-in and nothing else — progress is
 *     already durable in IndexedDB, and the queued results settle after the
 *     next sign-in. There is no offline-first requirement to trade against, so
 *     there is no reason to accept the exposure.
 *
 * A refresh therefore requires signing in again. That is a deliberate,
 * documented consequence (tech spec §12), NOT an oversight to be patched by
 * quietly persisting the token somewhere. A silent renewal needs a refresh-token
 * or cookie-session contract that the Identity Service does not offer today:
 * `/auth/v1/login` mints a bearer and nothing else, and `credentials: false` on
 * its CORS policy means a cookie session is not merely unimplemented but
 * actively refused. Until such a contract exists and is approved, do not invent
 * browser token persistence here.
 *
 * The value is also never logged. A token in a console line is a token in a
 * bug report, a screen share, and a support ticket.
 */

/** The one and only copy. Module scope: not reachable from `window`. */
let token = null;

/** Bumped on every change so React can re-render without ever reading the
 *  token itself into component state. */
let version = 0;
const listeners = new Set();

function notify() {
    version += 1;
    for (const listener of listeners) listener();
}

/**
 * Store the token minted by a successful sign-in.
 *
 * @param {string|null} value
 */
export function setSuiteToken(value) {
    token = typeof value === 'string' && value !== '' ? value : null;
    notify();
}

/**
 * The `getSuiteToken` callback handed to `useProgressSync`.
 *
 * Deliberately a plain synchronous getter: the hook awaits whatever it returns,
 * and having nothing async here means there is no request, no cache, and no
 * retry hiding behind it — the token is present or it is not.
 *
 * @returns {string|null}
 */
export function getSuiteToken() {
    return token;
}

/** Whether a token is currently held. Safe to render from. */
export function hasSuiteToken() {
    return token !== null;
}

/** Forget the token (sign-out, or a session the server rejected). */
export function clearSuiteToken() {
    token = null;
    notify();
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Change counter for `useSyncExternalStore`. Never the token itself. */
export function getVersion() {
    return version;
}
