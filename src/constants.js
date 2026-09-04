/**
 * Package-level constants. Neutral by design: nothing here may import from
 * `src/site/`, because `src/hooks/` and `src/components/` import from here and
 * the package must not depend on the deployable website.
 */

/**
 * Default base path of the games BFF.
 *
 * A RELATIVE path, and deliberately not configurable. The Dictionary API is
 * private: the browser addresses this site's own origin, which Nginx proxies to
 * the server-side BFF holding the credential. A host that mounts the package
 * against a BFF on a different path passes `bffPath` explicitly.
 *
 * It lives HERE rather than in `src/site/config.js` because `useGameSet` needs
 * it, and a hook importing from the site layer reverses the one-way dependency
 * the package boundary depends on (AGENTS.md; tech spec §4).
 */
export const DICTIONARY_BFF_PATH = '/api/dictionary';

export const PRODUCTION_GAMES = new Set([
    'listen_write',
    'arrange_word',
    'complete_sentence',
    'letter_reveal',
]);
