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
 * the browser's network tab the moment the page loads. The dictionary consumer
 * API key in particular is NOT here and must never be: it would be readable by
 * anyone who opens the bundle. The site uses the ephemeral page-token flow
 * instead (tech spec §9), and any endpoint that genuinely needs the consumer
 * key has to be proxied server-side by whoever holds it.
 *
 * Overriding at build time (all optional; the defaults are production):
 *
 *   GAMES_ENGINE_URL=…      pnpm run build:site
 *   GAMES_IDENTITY_URL=…
 *   GAMES_SITE_URL=…
 *   GAMES_DICTIONARY_URL=…
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
 * Webster dictionary REST namespace — the full base including the WordPress
 * `/wp-json` prefix and the `sparxstar/v1/dictionary` namespace, no trailing
 * slash. This is the base every path in `src/api/dictionary-api.d.ts` hangs
 * off (`/game-set`, `/domains`, `/page-token`, …).
 */
export const DICTIONARY_REST_URL = process.env.GAMES_DICTIONARY_URL;

/**
 * The interface language of the site chrome. The *source* language (the
 * language being learned) is chosen by the player at runtime from
 * `/languages`, and is not a deployment setting.
 */
export const UI_LANGUAGE = 'en';
