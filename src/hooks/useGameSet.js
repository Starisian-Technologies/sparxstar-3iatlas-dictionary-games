/**
 * useGameSet — fetches /game-set and caches in IndexedDB with a 3-day TTL.
 *
 * Usage:
 *   const { words, loading, error } = useGameSet({ restUrl, langSource, domain, limit, includeAudio });
 */

import { useState, useEffect } from 'react';
import { getRecord, putRecord } from './idbUtils.js';

/**
 * Refresh the ephemeral page token by calling GET /page-token.
 * Stores the new token in window.sparxstarDictionarySettings.pageToken.
 *
 * @param {string} restUrl Base REST URL (sparxstar/v1/dictionary).
 * @returns {Promise<string>} The new token, or empty string on failure.
 */
async function refreshPageToken(restUrl) {
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

/** 3-day TTL in milliseconds. */
const TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * @param {object} opts
 * @param {string} opts.restUrl       Base REST URL (sparxstar/v1/dictionary)
 * @param {string} opts.langSource    Language taxonomy slug (required)
 * @param {string} [opts.domain]      Domain slug (optional)
 * @param {number} [opts.limit]       Max words, default 20
 * @param {boolean} [opts.includeAudio] Whether to include audio URLs
 * @returns {{ words: Array, loading: boolean, error: string|null }}
 */
export function useGameSet({ restUrl, langSource, domain = '', limit = 20, includeAudio = false }) {
    const [words, setWords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const normalizedLimit = Math.min(50, Math.max(1, limit));

    const cacheKey = `game-set:${langSource}:${domain || 'all'}:${normalizedLimit}:${includeAudio ? 'audio' : 'no-audio'}`;

    useEffect(() => {
        if (!langSource) {
            setWords([]);
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                /* --- Check IndexedDB cache --- */
                const cached =
                    typeof getRecord === 'function' ? await getRecord('game-sets', cacheKey) : null;
                const now = Date.now();

                if (cached && Array.isArray(cached.data) && now - cached.fetchedAt < TTL_MS) {
                    if (!cancelled) {
                        setWords(cached.data);
                        setLoading(false);
                    }
                    return;
                }

                /* --- Fetch from server --- */
                const params = new URLSearchParams({
                    lang_source: langSource,
                    limit: String(normalizedLimit),
                    include_audio: includeAudio ? 'true' : 'false',
                });
                if (domain) params.set('domain', domain);

                const pageToken = typeof window !== 'undefined' ? ( window.sparxstarDictionarySettings?.pageToken ?? '' ) : '';
                let res = await fetch(`${restUrl}/game-set?${params}`, {
                    headers: { 'X-Page-Token': pageToken },
                });

                // On 401, attempt to refresh the token and retry once.
                if (res.status === 401) {
                    const newToken = await refreshPageToken(restUrl);
                    res = await fetch(`${restUrl}/game-set?${params}`, {
                        headers: { 'X-Page-Token': newToken },
                    });
                }

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const json = await res.json();
                const data = Array.isArray(json?.data?.words) ? json.data.words : [];

                if (typeof putRecord === 'function') {
                    try {
                        await putRecord('game-sets', {
                            key: cacheKey,
                            data,
                            fetchedAt: now,
                            ttlMs: TTL_MS,
                        });
                    } catch {
                        // Ignore cache persistence failures so fresh network data still renders.
                    }
                }

                if (!cancelled) {
                    setWords(data);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.message ?? 'Failed to load game set');
                    setLoading(false);
                }
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [restUrl, langSource, domain, limit, normalizedLimit, includeAudio, cacheKey]);

    return { words, loading, error };
}
