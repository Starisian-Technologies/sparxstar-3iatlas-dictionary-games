/**
 * useProgressSync — queues game progress events in IndexedDB and, once a
 * bearer token is available, flushes them to the RLC node-engine's
 * `POST {engineUrl}/events/batch` (GAME-SERVICE-INTAKE-SPEC-v1.0 Phase 2/3).
 *
 * The network path is gated on two things this hook never invents itself:
 *
 *   - `engineUrl` — the node-engine's base URL (the same base the engine
 *     mounts `/events/batch` under, e.g. an origin ending in `/api/v1`).
 *   - `getSuiteToken` — a caller-supplied function returning the bearer
 *     token to send as `Authorization`. It is looked up fresh on every
 *     sync attempt (never cached, never read from localStorage — see the
 *     SECURITY NOTE below) so the host app controls entirely how/whether a
 *     token is minted and stored.
 *
 * Neither is supplied by anything in this repo today — there is no suite
 * token issuer wired up for this class of client (docs/dictionary-games-tech-spec.md
 * §11). Until a host app passes both, syncNow() resolves immediately without
 * making a network call, and progress accumulates in the IndexedDB outbox
 * exactly as before. This makes the sync path fully buildable and
 * integration-testable (inject a fake `getSuiteToken` in tests) while
 * staying genuinely dormant in production.
 *
 * The event shape written to the outbox mirrors what this repo's old
 * WordPress `/progress/sync` handler parsed (now retired, but its shape is
 * the only verified precedent): `{ type, word_uuid?, game?, domain?, ts }`,
 * plus an `event_id` (used for idempotent replay) and, for `game_result`
 * events specifically, `outcome`, `attempts`, `time_ms`. This is not a
 * contract — just the ad-hoc shape addEvent() calls happen to use.
 *
 * Only `game_result` events are ever translated to the engine's `game.result`
 * wire vocabulary and sent over the network. The `aiwa_game_*` bonus events
 * (streak, first-practice, return-visit, session-complete) stay local-only —
 * the engine's dictionaryQuizManifest has no scoring/settlement path for
 * them, and sending them would be scope creep beyond OQ-3.
 *
 * SECURITY NOTE: This hook never reads a token from localStorage itself —
 * that would expose it to any injected script (XSS), undermining the
 * platform's token-integrity guarantee. `getSuiteToken` is the host app's
 * responsibility; how it stores/mints the token is out of scope here.
 */

import { useCallback, useEffect } from 'react';
import { getRecord, putRecord } from './idbUtils.js';

const OUTBOX_KEY = 'progress-outbox:pending';
const BATCH_MAX = 200; // matches the engine's `batch_too_large` cap (spec §3.10)
let addEventQueue = Promise.resolve();

function genEventId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID (older browsers, some
    // test runners) — not cryptographically strong, but only needs to be
    // unique enough to dedupe one client's own outbox events.
    return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @param {object} opts
 * @param {string} opts.restUrl        Dictionary's own base REST URL. Reserved
 *   for future use — the sync path below talks to the engine, not the dictionary.
 * @param {string} [opts.engineUrl]    Node-engine base URL (e.g. the origin
 *   `/events/batch` is mounted under). No default — omitted means sync stays
 *   local-only, same as today.
 * @param {Function} [opts.getSuiteToken]  () => (string|null|Promise<string|null>).
 *   Returns the bearer token for the batch endpoint, or a falsy value if none
 *   is available yet. Omitted means sync stays local-only, same as today.
 * @returns {{ addEvent: Function, syncNow: Function, syncing: boolean }}
 */
export function useProgressSync({ restUrl: _restUrl, engineUrl, getSuiteToken }) {
    /**
     * Add a progress event to the outbox.
     *
     * @param {object} event  e.g. { type: 'aiwa_game_word_correct', word_uuid: '...', game: 'listen_write' }
     *   or { type: 'game_result', word_uuid, game, outcome, attempts, time_ms }.
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
                events: [...events, { event_id: genEventId(), ...event, ts: Date.now() }],
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
     * Flush queued `game_result` events to the engine's batch endpoint.
     *
     * No-ops (resolves immediately) unless both `engineUrl` and
     * `getSuiteToken` are supplied AND getSuiteToken() actually returns a
     * token — i.e. this stays a guest/local-only client until a host app
     * wires up real auth. Everything else in the outbox (the aiwa_game_*
     * bonus events) is left untouched; they are never sent over the wire.
     *
     * Idempotent: each outbox event carries a stable event_id assigned when
     * it was queued, so re-running syncNow() (e.g. on 'online' reconnect
     * after a partial success) safely re-sends anything not yet confirmed —
     * the engine's batch claim/confirm dedupes on event_id server-side
     * (src/services/batch.ts). Events the server reports as failed stay
     * queued for the next attempt; only accepted (or already-confirmed
     * duplicate) events are removed from the outbox.
     */
    const syncNow = useCallback(async () => {
        if (!engineUrl || typeof getSuiteToken !== 'function') return;

        let token;
        try {
            token = await getSuiteToken();
        } catch (error) {
            console.warn('useProgressSync: getSuiteToken() threw; skipping sync.', error);
            return;
        }
        if (!token) return; // no token yet — stay local-only

        const outbox =
            typeof getRecord === 'function' ? await getRecord('progress-outbox', OUTBOX_KEY) : null;
        const events = outbox?.events ?? [];
        const pending = events.filter((e) => e.type === 'game_result').slice(0, BATCH_MAX);
        if (pending.length === 0) return;

        const batchEvents = pending.map((e) => ({
            event_id: e.event_id,
            event_type: 'game.result',
            payload: {
                // 'dictionary_quiz' is the placeholder game_type the engine's
                // manifest is registered under (GAME-SERVICE-INTAKE-SPEC-v1.0 OQ-4) —
                // not a per-minigame id. e.game (e.g. 'listen_write') stays local.
                game_type: 'dictionary_quiz',
                outcome: e.outcome,
                attempts: e.attempts,
                time_ms: e.time_ms,
            },
        }));

        let result;
        try {
            const resp = await fetch(`${engineUrl}/events/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ events: batchEvents }),
            });
            if (!resp.ok) {
                console.warn(`useProgressSync: sync failed with status ${resp.status}`);
                return;
            }
            result = await resp.json();
        } catch (error) {
            console.warn('useProgressSync: sync request failed; will retry later.', error);
            return;
        }

        const failedIds = new Set((result?.failed ?? []).map((f) => f.event_id));
        const sentIds = new Set(pending.map((e) => e.event_id));
        const remaining = events.filter((e) => !sentIds.has(e.event_id) || failedIds.has(e.event_id));

        if (typeof putRecord === 'function') {
            await putRecord('progress-outbox', { key: OUTBOX_KEY, events: remaining }).then((ok) => {
                if (!ok) {
                    console.warn(
                        'useProgressSync: could not persist post-sync outbox state; already-synced events may resend.'
                    );
                }
            });
        }
    }, [engineUrl, getSuiteToken]);

    /* Re-attempt sync on reconnect. Stays a no-op until engineUrl and
     * getSuiteToken are both supplied by the host app. */
    useEffect(() => {
        const handler = () => syncNow();
        window.addEventListener('online', handler);
        return () => window.removeEventListener('online', handler);
    }, [syncNow]);

    return { addEvent, syncNow, syncing: false };
}
