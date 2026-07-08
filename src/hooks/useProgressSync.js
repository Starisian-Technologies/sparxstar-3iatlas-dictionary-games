/**
 * useProgressSync — queues game progress events in IndexedDB.
 *
 * Events are held in IndexedDB until a suite-token source exists. Per
 * 3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0 §3, the sync target is
 * the RLC Node Engine (promoted to the suite's 3iAtlas Game Service), not
 * WordPress — but the suite Identity Service that mints the required token
 * has not been built yet (own repo, not yet created; see decision doc §2,
 * §7 OQ-I3/OQ-I4), so syncNow() is intentionally a no-op for the network
 * POST until that token source exists. Events are written to the outbox on
 * a best-effort basis — writes may fail if IndexedDB is unavailable (e.g.
 * quota exceeded or private-browsing mode), and failures are logged as
 * warnings.
 *
 * The frozen wire schema syncNow() will eventually POST is already
 * implemented in `api/gameServiceEventContract.js` (`buildGameServiceBatch`)
 * — see that module for the drop-in call once a token source lands.
 *
 * SECURITY NOTE: Reading a suite/Helios Bearer token from localStorage would
 * expose it to any injected script (XSS), undermining the platform's
 * token-integrity guarantee. The network sync path MUST NOT ship until an
 * approved token-delivery mechanism exists.
 *
 * // TODO: Wire buildGameServiceBatch() into a real POST once the suite
 * // Identity Service (or an approved interim token source) exists.
 */

import { useCallback, useEffect } from 'react';
import { getRecord, putRecord } from './idbUtils.js';

const OUTBOX_KEY = 'progress-outbox:pending';
let addEventQueue = Promise.resolve();

/**
 * @param {object} _opts  Reserved — restUrl will be used once Helios auth is wired up.
 * @returns {{ addEvent: Function, syncNow: Function, syncing: boolean }}
 */
export function useProgressSync({ restUrl: _restUrl }) {
    /**
     * Add a progress event to the outbox.
     *
     * @param {object} event  e.g. { type: 'aiwa_game_word_correct', word_uuid: '...', game: 'listen_write' }
     */
    const addEvent = useCallback((event) => {
        const appendEvent = async () => {
            const outbox =
                typeof getRecord === 'function'
                    ? await getRecord('progress-outbox', OUTBOX_KEY)
                    : null;
            const events = outbox?.events ?? [];

            if (typeof putRecord !== 'function') {
                console.warn('putRecord is unavailable; skipping progress outbox write.');
                return;
            }

            await putRecord('progress-outbox', {
                key: OUTBOX_KEY,
                events: [...events, { ...event, ts: Date.now() }],
            }).then((ok) => {
                if (!ok) {
                    console.warn(
                        'useProgressSync: outbox write failed (storage unavailable); event may be lost.'
                    );
                }
            });
        };

        const queuedAppend = addEventQueue.then(appendEvent, appendEvent);
        addEventQueue = queuedAppend.catch(() => {});
        return queuedAppend;
    }, []);

    /**
     * Network sync is intentionally disabled until the suite Identity
     * Service (or an approved interim token source) exists. Events
     * accumulate in the IndexedDB outbox on a best-effort basis (writes may
     * fail if storage is unavailable; failures are logged).
     *
     * // TODO: POST buildGameServiceBatch(session) to the Game Service once
     * // a suite token source is available.
     */
    const syncNow = useCallback(async () => {
        /* No-op: network POST is blocked until a suite token source is
         * approved (3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0 §2, §7).
         * The IndexedDB outbox is the durable store for now. */
    }, []);

    /* Re-attempt sync on reconnect — currently a no-op; wired up for when
     * a token source lands so the listener is already in place. */
    useEffect(() => {
        const handler = () => syncNow();
        window.addEventListener('online', handler);
        return () => window.removeEventListener('online', handler);
    }, [syncNow]);

    return { addEvent, syncNow, syncing: false };
}
