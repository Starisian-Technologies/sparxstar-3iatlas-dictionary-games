/**
 * useGameSession — manages the current game session in IndexedDB.
 *
 * Session is persisted on every word result so the app can resume
 * from the last checkpoint after a crash or browser close.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getRecord, putRecord, deleteRecord } from './idbUtils.js';
import { PRODUCTION_GAMES } from '../constants.js';

const SESSION_KEY = 'game-session:current';
const LEARNED_KEY = 'learned-words:production';

const safeGetRecord = async (storeName, key) => {
    if (typeof getRecord === 'function') {
        return getRecord(storeName, key);
    }
    return null;
};

/**
 * @returns {{
 *   session: object|null,
 *   learnedCount: number,
 *   initSession: Function,
 *   recordResult: Function,
 *   completeSession: Function,
 *   clearSession: Function,
 * }}
 */
export function useGameSession() {
    const [session, setSession] = useState(null);
    const [learnedCount, setLearnedCount] = useState(0);

    /*
     * sessionRef mirrors `session` state but is updated synchronously inside
     * callbacks before any async work. This prevents stale-closure bugs when
     * recordResult or completeSession are called in rapid succession (e.g. a
     * double-tap or the final onResult + onComplete pair in DomainFlash) before
     * React has had a chance to re-render and update the `session` closure.
     */
    const sessionRef = useRef(null);

    /* Load any in-progress session and learned-word count on mount. */
    useEffect(() => {
        let cancelled = false;

        async function load() {
            const [saved, learnedRecord] = await Promise.all([
                safeGetRecord('game-sessions', SESSION_KEY),
                safeGetRecord('learned-words', LEARNED_KEY),
            ]);

            if (cancelled) return;

            if (saved && saved.completedAt === null) {
                sessionRef.current = saved;
                setSession(saved);
            }
            if (learnedRecord && Array.isArray(learnedRecord.uuids)) {
                setLearnedCount(learnedRecord.uuids.length);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    /* Safe wrappers — defined before any callback that uses them to avoid TDZ. */
    const safePutRecord = useCallback(async (...args) => {
        if (typeof putRecord !== 'function') return false;
        return putRecord(...args);
    }, []);

    const safeDeleteRecord = useCallback(async (...args) => {
        if (typeof deleteRecord !== 'function') return;
        return deleteRecord(...args);
    }, []);

    /**
     * Start a new session, replacing any existing one.
     *
     * @param {object} opts
     * @param {string} opts.gameType
     * @param {string} opts.langSource
     * @param {string} opts.domain
     * @param {Array}  opts.words  Shuffled game-set slice
     */
    const initSession = useCallback(
        async ({ gameType, langSource, domain, words }) => {
            const newSession = {
                key: SESSION_KEY,
                gameType,
                langSource,
                domain,
                words,
                currentIndex: 0,
                results: [],
                xpEarned: 0,
                startedAt: Date.now(),
                completedAt: null,
            };
            await safePutRecord('game-sessions', newSession);
            sessionRef.current = newSession;
            setSession(newSession);
        },
        [safePutRecord]
    );

    /**
     * Record the outcome for one word.
     *
     * learnedCount ("words you can write") is only incremented for
     * production games (listen_write, arrange_word, complete_sentence,
     * letter_reveal) where the player demonstrated orthographic output.
     * Recognition-only games (domain_flash, meaning_match) do not
     * contribute to this count.
     *
     * @param {string} wordUuid
     * @param {'correct'|'learning'} outcome
     * @param {number} attempts  Number of attempts (1, 2, or 3)
     * @param {number} xp        XP earned for this word
     */

    const recordResult = useCallback(
        async (wordUuid, outcome, attempts, xp) => {
            const current = sessionRef.current;
            if (!current) return null;

            const result = { wordUuid, outcome, attempts, xp, ts: Date.now() };
            const updated = {
                ...current,
                currentIndex: current.currentIndex + 1,
                results: [...current.results, result],
                xpEarned: current.xpEarned + xp,
            };

            /* Update ref synchronously before any awaits so that concurrent
             * calls (e.g. rapid onResult invocations before re-render) always
             * build from the latest known state, not the stale closure. */
            sessionRef.current = updated;

            /* Only count toward "words you can write" for production games. */
            const isProductionGame =
                PRODUCTION_GAMES != null &&
                typeof PRODUCTION_GAMES.has === 'function' &&
                PRODUCTION_GAMES.has(current.gameType);
            if (outcome === 'correct' && isProductionGame) {
                const learnedRecord = await safeGetRecord('learned-words', LEARNED_KEY);
                const existing = learnedRecord?.uuids ?? [];
                if (!existing.includes(wordUuid)) {
                    const next = [...existing, wordUuid];
                    await safePutRecord('learned-words', { key: LEARNED_KEY, uuids: next });
                    setLearnedCount(next.length);
                }
            }

            await safePutRecord('game-sessions', updated);
            setSession(updated);
            return updated;
        },
        [safePutRecord]
    );

    /**
     * Mark the session as complete and persist the timestamp.
     *
     * Reads from sessionRef (not React state) so it always operates on the
     * session object last written by recordResult, even if React has not yet
     * re-rendered after the final word result.
     */
    const completeSession = useCallback(async () => {
        const current = sessionRef.current;
        if (!current) return;

        const completed = { ...current, completedAt: Date.now() };
        sessionRef.current = completed;
        await safePutRecord('game-sessions', completed);
        setSession(completed);
    }, [safePutRecord]);

    /**
     * Remove the current session from storage (e.g. after sync).
     */
    const clearSession = useCallback(async () => {
        await safeDeleteRecord('game-sessions', SESSION_KEY);
        sessionRef.current = null;
        setSession(null);
    }, [safeDeleteRecord]);

    return { session, learnedCount, initSession, recordResult, completeSession, clearSession };
}
