/**
 * usePronounce — on-demand TTS pronunciation for a single headword.
 *
 * Calls GET <restUrl>/pronounce?word=<headword>, receives audio/wav, and
 * plays it through the Web Audio API / HTMLAudioElement.
 *
 * The hook caches the object URL for each headword in a module-level Map
 * so that repeated plays within a page session never re-fetch (the server
 * also caches permanently, but this avoids even the round-trip on replay).
 *
 * Usage:
 *   const { play, loading, error } = usePronounce({ restUrl, word: 'akwaaba' });
 *   // then: <button onClick={play} disabled={loading}>▶</button>
 *
 * @param {object} opts
 * @param {string} opts.restUrl  Base REST URL (sparxstar/v1/dictionary)
 * @param {string} opts.word     The headword to pronounce
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// Module-level cache: headword → object URL for WAV blob.
// Shared across all hook instances so the second component to render the
// same word gets the audio immediately without any network request.
const _audioCache = new Map();

export function usePronounce({ restUrl, word }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const audioRef = useRef(null);
    const abortRef = useRef(null);

    // Revoke object URLs when the component unmounts to avoid memory leaks.
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort();
            if (audioRef.current) audioRef.current.pause();
        };
    }, []);

    const play = useCallback(async () => {
        if (!word || !restUrl) return;
        if (loading) return;

        // Pause any audio currently playing from this instance.
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }

        // Serve from in-page cache if available (no re-fetch, no re-synthesis).
        const cached = _audioCache.get(word);
        if (cached) {
            if (!audioRef.current) audioRef.current = new Audio();
            audioRef.current.src = cached;
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
            return;
        }

        setLoading(true);
        setError(null);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const pageToken =
                typeof window !== 'undefined'
                    ? window.sparxstarDictionarySettings?.pageToken ?? ''
                    : '';

            const url = `${restUrl}/pronounce?word=${encodeURIComponent(word)}`;
            const res = await fetch(url, {
                headers: { 'X-Page-Token': pageToken },
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);

            // Store in module cache so future plays are instant.
            _audioCache.set(word, objectUrl);

            if (!audioRef.current) audioRef.current = new Audio();
            audioRef.current.src = objectUrl;
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});

            setLoading(false);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            setError(err?.message ?? 'Pronunciation unavailable');
            setLoading(false);
        }
    }, [restUrl, word, loading]);

    return { play, loading, error };
}
