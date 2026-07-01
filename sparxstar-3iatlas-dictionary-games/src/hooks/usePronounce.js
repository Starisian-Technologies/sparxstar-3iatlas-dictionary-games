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

import { useState, useRef, useEffect, useCallback } from "react";

// Module-level cache: headword → WAV Blob.
// Storing the Blob (not an object URL) means no permanent object URL is held
// in memory. A short-lived object URL is created per-play and revoked as
// soon as the audio element fires 'ended' or 'error', so the browser can
// GC the underlying buffer immediately after playback.
const _blobCache = new Map();

/** Create an object URL from a Blob, play it, then revoke it after playback. */
function playBlob(audio, blob) {
  const objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  audio.currentTime = 0;

  const revoke = () => {
    URL.revokeObjectURL(objectUrl);
    audio.removeEventListener("ended", revoke);
    audio.removeEventListener("error", revoke);
  };
  audio.addEventListener("ended", revoke);
  audio.addEventListener("error", revoke);

  audio.play().catch(() => {});
}

export function usePronounce({ restUrl, word }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const abortRef = useRef(null);
  // Synchronous in-flight guard — prevents concurrent fetches without
  // relying on stale `loading` state inside the useCallback closure.
  const loadingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) audioRef.current.pause();
      loadingRef.current = false;
      setLoading(false);
      setError(null);
    };
  }, [word, restUrl]);

  const play = useCallback(async () => {
    if (!word || !restUrl) return;
    // Use the ref, not the state value — always reflects current in-flight
    // status regardless of whether the callback closure is stale.
    if (loadingRef.current) return;

    // Instantiate Audio() synchronously within the user-gesture call stack
    // so iOS Safari permits playback even when audio is served from cache.
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.pause();

    // Serve from in-page Blob cache (no re-fetch, no re-synthesis).
    const cachedBlob = _blobCache.get(word);
    if (cachedBlob) {
      playBlob(audioRef.current, cachedBlob);
      return;
    }

    // Mark in-flight synchronously before any await.
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const pageToken =
        typeof window !== "undefined"
          ? (window.sparxstarDictionarySettings?.pageToken ?? "")
          : "";

      const url = `${restUrl}/pronounce?word=${encodeURIComponent(word)}`;
      const res = await fetch(url, {
        headers: { "X-Page-Token": pageToken },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const blob = await res.blob();

      // Cache the Blob — object URLs are created and revoked per-play.
      _blobCache.set(word, blob);

      if (!audioRef.current) audioRef.current = new Audio();
      playBlob(audioRef.current, blob);

      loadingRef.current = false;
      setLoading(false);
    } catch (err) {
      loadingRef.current = false;
      if (err?.name === "AbortError") return;
      setError(err?.message ?? "Pronunciation unavailable");
      setLoading(false);
    }
  }, [restUrl, word]);

  return { play, loading, error };
}
