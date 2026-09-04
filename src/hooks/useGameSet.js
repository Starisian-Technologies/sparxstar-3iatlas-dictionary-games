/**
 * useGameSet — fetches a game word set from the games BFF.
 *
 * ==================== WHAT CHANGED, AND WHY IT MATTERS ==================
 *
 * This hook used to call the Dictionary REST API directly, carrying an
 * ephemeral page token, and cache the result in IndexedDB for three days. All
 * three of those are gone:
 *
 *   THE DICTIONARY API IS PRIVATE. No browser, anonymous user, or unregistered
 *   application may call it. The request now goes SAME-ORIGIN to
 *   `/api/dictionary/game-set`, which Nginx proxies to the server-side BFF; the
 *   BFF authenticates itself to the Identity Node and calls the Dictionary with
 *   a five-minute service token. No credential of any kind reaches this file.
 *
 *   THE PAGE-TOKEN FLOW IS RETIRED. The Dictionary Node has no `/page-token`
 *   route — the WordPress original's browser-read credential does not exist in
 *   the port, and could not: every endpoint there is authenticated M2M, and a
 *   credential a browser can hold is a credential that has left the server.
 *
 *   THE PERSISTENT CACHE IS GONE. This is the substantive one, so it is worth
 *   being explicit: game words carry rights, licence and consent restrictions,
 *   and a word can be WITHDRAWN from the corpus. A three-day IndexedDB copy is
 *   a place a withdrawn word survives its withdrawal by up to three days, on a
 *   device nobody can reach. Caching returns when withdrawal behaviour is
 *   defined and honoured — a TTL is not a withdrawal mechanism.
 *
 *   What remains is a per-mount in-memory result, which is just React state:
 *   it lives as long as the component and cannot outlive the tab.
 *
 * Usage:
 *   const { words, loading, error } = useGameSet({ language, domain, limit });
 */

import { useState, useEffect } from 'react';
// From the NEUTRAL package module, never from `src/site/` — a hook importing
// the site layer reverses the one-way dependency the package boundary rests on.
import { DICTIONARY_BFF_PATH } from '../constants.js';
import { adaptGamePackWords } from '../api/gamePackAdapter.js';

/**
 * @param {object} opts
 * @param {string} opts.language     ISO 639-3 code (required), e.g. 'mnk'
 * @param {string} [opts.domain]     Domain code (optional)
 * @param {number} [opts.limit]      Max words, default 20
 * @param {boolean} [opts.audioVerifiedOnly] Only entries with verified audio
 * @param {string} [opts.bffPath]    Override the BFF base (tests only)
 * @returns {{ words: Array, loading: boolean, error: string|null }}
 */
export function useGameSet({
    language,
    domain = '',
    limit = 20,
    audioVerifiedOnly = false,
    bffPath = DICTIONARY_BFF_PATH,
}) {
    const [words, setWords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /*
     * The BFF refuses an over-cap size rather than clamping it, and so does the
     * Dictionary behind it. Clamping here keeps a caller passing a large number
     * from turning into a 400 the player sees — the ceiling is a product
     * decision about pack size, not an input-validation failure.
     */
    const normalizedLimit = Math.min(50, Math.max(1, limit));

    useEffect(() => {
        if (!language) {
            setWords([]);
            setLoading(false);
            setError(null);
            return undefined;
        }

        const controller = new AbortController();
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams({
                    language,
                    size: String(normalizedLimit),
                });
                if (domain) params.set('domain', domain);
                if (audioVerifiedOnly) params.set('audio_verified', 'true');

                /*
                 * `credentials: 'omit'`. Same-origin means the browser would
                 * otherwise attach cookies by default, and this deployment
                 * never authenticates a player to the BFF with one — the BFF
                 * serves public game content and holds its own credential for
                 * the upstream. Sending nothing keeps that true by construction.
                 */
                const res = await fetch(`${bffPath}/game-set?${params}`, {
                    credentials: 'omit',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const json = await res.json();

                /*
                 * ADAPTED, not passed through. The Dictionary's GamePack uses
                 * `entry_id`/`header_word`/`english_lemma`; the game components
                 * read `uuid`/`headword`/`translation_en`. Handing the raw pack
                 * to a component renders a blank prompt and submits
                 * `word_uuid: undefined`, which the engine cannot match to a
                 * session word. The adapter renames and never backfills — see
                 * src/api/gamePackAdapter.js.
                 */
                const data = adaptGamePackWords(json?.data?.words);

                if (!cancelled) {
                    setWords(data);
                    setLoading(false);
                }
            } catch (err) {
                // An aborted request is a re-render or an unmount, not a failure
                // — surfacing it would flash an error banner on every change.
                if (err.name === 'AbortError' || cancelled) return;
                setError(err.message ?? 'Failed to load game set');
                setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [bffPath, language, domain, normalizedLimit, audioVerifiedOnly]);

    return { words, loading, error };
}
