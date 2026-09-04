/**
 * The website's four deployment endpoints — resolved once, used twice.
 *
 * Two artifacts have to agree about which origins this site may talk to:
 *
 *   1. the JS bundle, which is compiled with these URLs baked in
 *      (`webpack.site.config.js` → `src/site/config.js`);
 *   2. the CSP `connect-src` in the Nginx headers snippet, which is what the
 *      browser enforces at runtime
 *      (`scripts/generate-csp-headers.cjs` → `deploy/nginx/games-security-headers.conf`).
 *
 * They were separately hard-coded, which was fine for production and wrong
 * everywhere else: a staging build overriding `GAMES_DICTIONARY_URL` produced
 * a bundle that called staging and a policy that only permitted production, so
 * every request was blocked by a CSP violation. The symptom is a blank-ish app
 * with console errors and nothing pointing at the real cause.
 *
 * Deriving both from this one module removes the class of bug rather than the
 * instance: an override cannot reach one artifact without reaching the other.
 *
 * NONE OF THESE IS A SECRET. They are public addresses, visible in the
 * browser's network tab on first load.
 */

'use strict';

/**
 * Production. A plain build needs no environment at all.
 *
 * NOTE the absence of a dictionary endpoint. The browser no longer addresses
 * the Dictionary API: it calls this site's own `/api/dictionary/*`, which Nginx
 * proxies to the server-side BFF holding the credential. So the dictionary
 * origin is not compiled into the bundle AND is not permitted by the CSP's
 * `connect-src` — a direct call from the page is now blocked by policy, not
 * merely absent from the code.
 *
 * `GAMES_DICTIONARY_URL` was REMOVED rather than repointed. A CI job still
 * passing it now fails the build (unknown build arg) instead of quietly
 * restoring a direct browser path to a private API.
 */
const DEFAULTS = {
    /** Node-engine base. `/events/batch` is mounted under it, so the `/api/v1`
     *  suffix belongs to the base rather than to the client's paths. */
    GAMES_ENGINE_URL: 'https://rlc-api.sparxstar.com/api/v1',
    /** 3iAtlas Identity Service origin — the suite-token issuer. */
    GAMES_IDENTITY_URL: 'https://id.sparxstar.com',
    /** This site's own public origin. */
    GAMES_SITE_URL: 'https://games.sparxstar.com',
};

/**
 * Resolve the endpoints from an environment, falling back to production.
 *
 * Throws rather than returning something malformed: a bad endpoint otherwise
 * surfaces as an opaque CORS or CSP error in a deployed browser, which is a
 * far worse place to find a typo than a failed build.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<keyof typeof DEFAULTS, string>}
 */
function resolveEndpoints(env = process.env) {
    /** @type {Record<string, string>} */
    const resolved = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
        const value = env[key] || fallback;
        if (!/^https:\/\/[^/]+/.test(value) || value.endsWith('/')) {
            throw new Error(
                `${key} must be an https:// URL with no trailing slash (got ${JSON.stringify(value)})`
            );
        }
        resolved[key] = value;
    }
    return /** @type {any} */ (resolved);
}

/**
 * The scheme+host of a URL, which is what a CSP source expression wants — a
 * path would be ignored at best and misread at worst.
 *
 * @param {string} url
 * @returns {string}
 */
function originOf(url) {
    return new URL(url).origin;
}

/**
 * The distinct origins the page issues cross-origin requests to, in a stable
 * order so a regenerated headers file is byte-identical.
 *
 * The site's own origin is covered by `'self'` and is deliberately not listed —
 * which is also what covers every `/api/dictionary/*` call, since those are
 * same-origin by construction.
 *
 * The dictionary origin is NOT here. That is the CSP half of the BFF change:
 * even if some future code in the bundle tried to call the Dictionary API
 * directly, the browser would refuse the connection.
 *
 * @param {Record<string, string>} endpoints From resolveEndpoints().
 * @returns {string[]}
 */
function connectOrigins(endpoints) {
    const selfOrigin = originOf(endpoints.GAMES_SITE_URL);
    const origins = [
        originOf(endpoints.GAMES_IDENTITY_URL),
        originOf(endpoints.GAMES_ENGINE_URL),
    ].filter((origin) => origin !== selfOrigin);
    return [...new Set(origins)].sort();
}

module.exports = { DEFAULTS, resolveEndpoints, originOf, connectOrigins };
