/**
 * Ephemeral page-token helpers for same-origin reads against the dictionary
 * REST API.
 *
 * The dictionary issues a short-lived page token (`GET /page-token`) that
 * same-origin browser clients send as `X-Page-Token` (tech spec §9, "Auth
 * model (Webster)"). Those tokens expire, so any read that carries one has to
 * be able to refresh and retry — otherwise a session that has been open for a
 * while starts failing the moment its token ages out, and the failure looks
 * like an empty result rather than an auth problem.
 *
 * Both helpers read and write `window.sparxstarDictionarySettings.pageToken`,
 * which is where the host page publishes the token it rendered with, so a
 * refresh benefits every later call rather than just the one that triggered
 * it.
 *
 * SECURITY NOTE: this is the *page-token* path only. It is deliberately
 * unrelated to the suite/Bearer token used by `useProgressSync`, which is
 * never read from storage — see the security note in `useProgressSync.js`.
 * A page token is a public, unauthenticated, same-origin read credential;
 * it conveys no learner identity.
 */

/** Current page token as published by the host page, or '' if there is none. */
export function currentPageToken() {
    if (typeof window === 'undefined') return '';
    return window.sparxstarDictionarySettings?.pageToken ?? '';
}

/**
 * Refresh the ephemeral page token by calling `GET /page-token`, storing the
 * result on `window.sparxstarDictionarySettings.pageToken`.
 *
 * @param {string} restUrl Base REST URL (`sparxstar/v1/dictionary`).
 * @returns {Promise<string>} The new token, or '' if the refresh failed.
 */
export async function refreshPageToken(restUrl) {
    try {
        const res = await fetch(`${restUrl}/page-token`);
        if (!res.ok) return '';
        const json = await res.json();
        const token = json?.data?.token ?? '';
        if (token && typeof window !== 'undefined' && window.sparxstarDictionarySettings) {
            window.sparxstarDictionarySettings.pageToken = token;
        }
        return token;
    } catch {
        return '';
    }
}

/**
 * `fetch()` a dictionary endpoint with the current page token, refreshing the
 * token and retrying **exactly once** on a 401.
 *
 * Any caller-supplied `headers` are preserved; `X-Page-Token` is set last so
 * the live token always wins over a stale one passed in by a caller.
 *
 * @param {string} url      Absolute request URL.
 * @param {string} restUrl  Base REST URL, used to reach `/page-token`.
 * @param {RequestInit} [init]  Passed through to `fetch` (`signal`, etc).
 * @returns {Promise<Response>} The first non-401 response, or the retry's.
 */
export async function fetchWithPageToken(url, restUrl, init = {}) {
    const send = (token) =>
        fetch(url, {
            ...init,
            headers: { ...(init.headers ?? {}), 'X-Page-Token': token },
        });

    const res = await send(currentPageToken());
    if (res.status !== 401) return res;

    /*
     * One refresh, one retry. A second 401 is handed back as-is: at that point
     * the token is not what's wrong (wrong origin, revoked key, server-side
     * auth change), and retrying again would only multiply the failed calls.
     * The retry runs even when the refresh returned '' — matching the
     * behaviour this replaced, and letting the server produce the real error
     * rather than this layer guessing at one.
     */
    const refreshed = await refreshPageToken(restUrl);
    return send(refreshed);
}
