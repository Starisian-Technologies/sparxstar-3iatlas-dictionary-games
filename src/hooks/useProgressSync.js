/**
 * useProgressSync — queues game progress events in IndexedDB.
 *
 * Events are held in IndexedDB until a suite-token source exists. Per
 * 3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0 §3, the intended sync
 * target is the RLC Node Engine (promoted to the suite's 3iAtlas Game
 * Service), not WordPress — but the suite Identity Service that would mint
 * the required token has not been built yet (own repo, not yet created; see
 * decision doc §2, §7 OQ-I3/OQ-I4), and the wire schema the Game Service
 * would accept is not specified anywhere in this repo or the dictionary repo
 * (GAME-SERVICE-INTAKE-SPEC-v1.0 is unwritten; a "frozen event schema"
 * mentioned in the decision doc §3 cites a Fix-2 document,
 * GH-ISSUE-dictionary-PR59-fixes.md, that does not exist in either repo —
 * do not treat that citation as a real, checkable contract). So syncNow()
 * is intentionally a no-op for the network POST until both a token source
 * and an actual intake spec exist. Events are written to the outbox on a
 * best-effort basis — writes may fail if IndexedDB is unavailable (e.g.
 * quota exceeded or private-browsing mode), and failures are logged as
 * warnings.
 *
 * The event shape actually written to the outbox today mirrors what this
 * repo's old WordPress `/progress/sync` handler parsed (now retired, but
 * its shape is the only verified precedent):
 * `{ type, word_uuid?, game?, domain?, ts }`. This is not a contract —
 * just the ad-hoc shape addEvent() calls happen to use below.
 *
 * SECURITY NOTE: Reading a suite/Helios Bearer token from localStorage would
 * expose it to any injected script (XSS), undermining the platform's
 * token-integrity guarantee. The network sync path MUST NOT ship until an
 * approved token-delivery mechanism exists.
 *
 * // TODO: Once a real GAME-SERVICE-INTAKE-SPEC exists, build a payload to
 * // that spec's actual shape and POST it here. Do not do this ahead of the
 * // spec — see note above on the phantom PR59 citation.
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
     * Service (or an approved interim token source) exists AND a real
     * Game-Service intake spec is written. Events accumulate in the
     * IndexedDB outbox on a best-effort basis (writes may fail if storage
     * is unavailable; failures are logged).
     *
     * // TODO: POST the outbox to the Game Service once both a token source
     * // and an actual intake spec exist. See the module docstring above —
     * // there is no frozen wire schema to build against yet.
     */
    const syncNow = useCallback(async () => {
        /* No-op: network POST is blocked until a suite token source is
         * approved and an intake spec exists
         * (3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0 §2, §7).
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
