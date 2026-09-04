/**
 * Deployment configuration for the games.sparxstar.com website build.
 *
 * Every value is a `process.env.*` read that webpack's DefinePlugin replaces
 * with a string literal at build time (`webpack.site.config.js`). Nothing is
 * read from the network, from `window`, or from a config file the browser
 * fetches: the built bundle is a static artifact and its endpoints are fixed
 * when it is built. That is deliberate — it means the Nginx image ships no
 * runtime configuration and therefore has nowhere to hold a secret.
 *
 * NONE OF THESE IS A SECRET. They are public endpoint addresses that appear in
 * the browser's network tab the moment the page loads. No dictionary
 * credential appears here or anywhere else in the bundle, and none can: as of
 * the BFF, the browser does not address the Dictionary API at all. It calls
 * this site's own `/api/dictionary/*` routes, which Nginx proxies to the
 * server-side BFF (`server/`), and the BFF holds the credential.
 *
 * Overriding at build time (all optional; the defaults are production):
 *
 *   GAMES_ENGINE_URL=…      pnpm run build:site
 *   GAMES_IDENTITY_URL=…
 *   GAMES_SITE_URL=…
 */

/**
 * RLC node-engine base. `/events/batch` is mounted under it, so the `/api/v1`
 * suffix is part of the base rather than something the client appends —
 * the engine mounts its router at `/api/v1` (node-engine `src/app.ts`).
 */
export const ENGINE_URL = process.env.GAMES_ENGINE_URL;

/**
 * 3iAtlas Identity Service origin. The suite-token issuer, and the only
 * authentication authority in the platform. Routes used by this site are all
 * relative to it: `/auth/v1/login`, `/auth/v1/validate`, `/auth/v1/logout`.
 * No trailing slash.
 */
export const IDENTITY_URL = process.env.GAMES_IDENTITY_URL;

/**
 * This site's own public origin. Used for canonical links and, more
 * importantly, as the value that must appear in the Identity Service's and the
 * engine's CORS allowlists — both services answer CORS from an exact-match
 * origin list (`UI_ORIGIN`/`UI_ORIGINS`), never a wildcard.
 */
export const SITE_URL = process.env.GAMES_SITE_URL;

/**
 * The games BFF, SAME-ORIGIN and therefore not configurable.
 *
 * A relative path, deliberately — not an origin, and not a build-time
 * override. Three things follow from that, all of them the point:
 *
 *   1. The browser never learns the Dictionary API's address, so it cannot be
 *      pointed at it by a bug, a copied snippet, or a console.
 *   2. There is no cross-origin request, so no CORS negotiation and no
 *      preflight — and the site's CSP `connect-src` no longer needs to permit
 *      the dictionary origin at all.
 *   3. A `GAMES_DICTIONARY_URL` build arg cannot make the bundle address the
 *      Dictionary directly. The variable is gone rather than repointed, so an
 *      old override in a CI job fails the build instead of quietly restoring
 *      the direct path.
 *
 * The Dictionary API is private. Only the BFF holds a credential for it, and
 * the BFF runs on this origin behind Nginx — see `docs/dictionary-games-bff.md`.
 */
export const DICTIONARY_BFF_PATH = '/api/dictionary';

/**
 * The interface language of the site chrome. The *source* language (the
 * language being learned) is chosen by the player at runtime from
 * `/languages`, and is not a deployment setting.
 */
export const UI_LANGUAGE = 'en';
