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
 * Until a caller passes both, syncNow() resolves immediately without making a
 * network call and progress accumulates in the IndexedDB outbox — which is
 * exactly what a GUEST is: a player nobody has signed in, whose results stay on
 * the device. The bundled website (`src/site/`) supplies both only after an
 * adult signs in against the Identity Service, so guest play and authenticated
 * play are the same code path with and without a token, not two code paths.
 *
 * The event shape written to the outbox is
 * `{ event_id, type, word_uuid?, game?, domain?, ts }`, plus — for
 * `game_result` events specifically — `run_id`, `outcome`, `attempts` and
 * `time_ms`. `run_id` and `word_uuid` are not decoration: they become the
 * wire's `session_id` and `deal_id`, which is what the engine keys its
 * per-question award claim on. An event missing either cannot settle at all
 * (see isSettleable).
 *
 * Only `game_result` events are ever translated to the engine's `game.result`
 * wire vocabulary and sent over the network. The `aiwa_game_*` bonus events
 * (streak, first-practice, return-visit, session-complete) stay local-only —
 * the engine's dictionaryQuizManifest has no scoring/settlement path for
 * them, and sending them would be scope creep beyond OQ-3.
 *
 * SECURITY NOTE: This hook never reads a token from localStorage itself —
 * that would expose it to any injected script (XSS), undermining the
 * platform's token-integrity guarantee. `getSuiteToken` is the caller's
 * responsibility. The bundled website holds the token in a module-scoped
 * variable and nowhere else (`src/site/auth/suiteToken.js`), which is why a
 * refresh there requires signing in again — see tech spec §12. The token is
 * also never logged: the warnings below report status codes and counts, never
 * the Authorization header or a response body that might echo it.
 */

import { useCallback, useEffect, useRef } from 'react';
import { getRecord, putRecord } from './idbUtils.js';
import { newEventId } from '../ids.js';

const OUTBOX_KEY = 'progress-outbox:pending';
const BATCH_MAX = 200; // matches the engine's `batch_too_large` cap (spec §3.10)

/**
 * The engine's `game_type` for every game in this suite.
 *
 * Not a per-minigame id: `listen_write`, `arrange_word` and the rest all settle
 * as `dictionary_quiz`, which is the one manifest the engine registers for this
 * client (node-engine `src/games/manifests.ts`). The specific minigame stays in
 * the local outbox event's `game` field and is never sent — the engine has no
 * per-minigame scoring path, and inventing game_types it has no manifest for
 * would get every event rejected as `unsupported_game_type`.
 */
const GAME_TYPE = 'dictionary_quiz';

/**
 * Outcomes the `dictionary_quiz` manifest scores. An outcome outside this set
 * is rejected by the engine (`scoringXpForOutcome` throws rather than silently
 * scoring an unknown result), so sending one produces an event that fails on
 * every flush forever.
 */
const VALID_OUTCOMES = new Set(['correct', 'learning', 'incorrect', 'skipped']);

/** The engine stores `run_id` in a varchar(128) and prefixes solo runs with
 *  `solo:` before writing, so the value this client sends must leave room. */
const MAX_RUN_ID_LENGTH = 128 - 'solo:'.length;

/**
 * Can this queued `game_result` ever settle?
 *
 * `dictionary_quiz` is question-scoped, so the engine refuses an event that
 * cannot identify both its run and its question — `run_id_required` and
 * `question_id_required` are hard 400s, not warnings. An event that fails these
 * checks would be re-sent and re-refused on every single flush, growing the
 * outbox without bound and burying genuinely retryable failures. Screening them
 * out here costs nothing: the durable record of the result is the local session
 * in `game-sessions` (tech spec §5), not the outbox, so a dropped event loses a
 * reward claim, never the learner's progress.
 *
 * @param {object} e Queued outbox event.
 * @returns {boolean}
 */
function isSettleable(e) {
    if (!e.event_id) return false;
    if (typeof e.run_id !== 'string' || !e.run_id || e.run_id.length > MAX_RUN_ID_LENGTH) {
        return false;
    }
    if (typeof e.word_uuid !== 'string' || !e.word_uuid) return false;
    if (!VALID_OUTCOMES.has(e.outcome)) return false;
    return true;
}

/** Clamp a measurement to the non-negative finite integer the engine accepts
 *  (it rejects negatives outright and defaults a non-number to 0). */
function measurement(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
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
    /* Per-instance write queue — kept in a ref (not module scope) so two
     * mounted hook instances never interleave each other's outbox writes. */
    const addEventQueueRef = useRef(Promise.resolve());

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
                events: [...events, { event_id: newEventId(), ...event, ts: Date.now() }],
            }).then((ok) => {
                if (!ok) {
                    console.warn(
                        'useProgressSync: outbox write failed (storage unavailable); event may be lost.'
                    );
                }
            });
        };

        const queuedAppend = addEventQueueRef.current.then(appendEvent, appendEvent);
        addEventQueueRef.current = queuedAppend.catch(() => {});
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
        const rawEvents = outbox?.events ?? [];

        // Defensive backfill: every event queued by addEvent() carries an
        // event_id, but an outbox written by an older build (before event_id
        // existed) could still have entries without one. Assign and persist
        // ids for those before building the batch — otherwise multiple
        // undefined event_ids collapse into one Set entry below, and an
        // accepted event could accidentally drain unrelated queued events
        // that happen to also be missing an id.
        let backfilled = false;
        const events = rawEvents.map((e) => {
            if (e.event_id) return e;
            backfilled = true;
            return { ...e, event_id: newEventId() };
        });
        if (backfilled && typeof putRecord === 'function') {
            await putRecord('progress-outbox', { key: OUTBOX_KEY, events });
        }

        /* Screen out anything the engine can only ever refuse, and drop it from
         * the outbox rather than re-offering it forever (see isSettleable). */
        const allResults = events.filter((e) => e.type === 'game_result');
        const unsettleable = allResults.filter((e) => !isSettleable(e));
        if (unsettleable.length > 0) {
            console.warn(
                `useProgressSync: discarding ${unsettleable.length} malformed game_result event(s) the engine cannot settle.`
            );
        }
        const unsettleableIds = new Set(unsettleable.map((e) => e.event_id));

        // Drop permanently-unsettleable events immediately so they don't linger on repeated failures.
        if (unsettleable.length > 0 && typeof putRecord === 'function') {
            await putRecord('progress-outbox', {
                key: OUTBOX_KEY,
                events: events.filter((e) => !unsettleableIds.has(e.event_id)),
            });
        }

        const pending = allResults.filter(isSettleable).slice(0, BATCH_MAX);
        if (pending.length === 0) return;
                    events: events.filter((e) => !unsettleableIds.has(e.event_id)),
                });
            }
            return;
        }

        /*
         * The `game.result` wire shape (node-engine `GameResultInput`,
         * GAME-SERVICE-INTAKE-SPEC-v1.0 §1–§2). Two identifiers do the
         * idempotency work, and they are deliberately different things:
         *
         *   event_id  — transport-level. The engine's `processed_events` table
         *               dedupes on it, so re-flushing an event it already
         *               applied is silently skipped. Assigned once at queue
         *               time and never regenerated, which is what makes a
         *               retry a replay rather than a second submission.
         *
         *   session_id + deal_id — settlement-level. Together with game_type
         *               and the account they form the engine's per-question
         *               award claim. A refresh that somehow re-queued the same
         *               result under a NEW event_id still cannot be paid twice,
         *               because the claim row for (dictionary_quiz, this run,
         *               this word, this account) is already taken. Replaying
         *               the same word in a *new* run is a different claim, and
         *               settles again — which is the intended behaviour.
         *
         * No xp or score is sent: the engine derives the award from
         * game_type + outcome (Reward Rail Contract §3), and a client-supplied
         * amount would be ignored at best.
         */
        const batchEvents = pending.map((e) => ({
            event_id: e.event_id,
            event_type: 'game.result',
            payload: {
                game_type: GAME_TYPE,
                /* The run this result belongs to. The engine namespaces it
                 * (`solo:<run_id>`) so a solo run can never collide with a
                 * classroom session's key. */
                session_id: e.run_id,
                /* The question within that run. For this suite a "question" is
                 * a dictionary entry, so the entry UUID is the stable question
                 * id — the same word in the same run is the same deal. */
                deal_id: e.word_uuid,
                /* Retained alongside deal_id: it is the same value today, but
                 * deal_id is the engine's idempotency key and word_uuid is the
                 * dictionary's own identifier. Keeping both means a later
                 * change to how a question is keyed (a sentence id, a
                 * per-prompt id) does not silently re-point the entry
                 * reference. An unread field is ignored, not rejected. */
                word_uuid: e.word_uuid,
                outcome: e.outcome,
                attempts: measurement(e.attempts),
                time_ms: measurement(e.time_ms),
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
        const remaining = events.filter(
            (e) =>
                !unsettleableIds.has(e.event_id) &&
                (!sentIds.has(e.event_id) || failedIds.has(e.event_id))
        );

        if (typeof putRecord === 'function') {
            await putRecord('progress-outbox', { key: OUTBOX_KEY, events: remaining }).then(
                (ok) => {
                    if (!ok) {
                        console.warn(
                            'useProgressSync: could not persist post-sync outbox state; already-synced events may resend.'
                        );
                    }
                }
            );
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
