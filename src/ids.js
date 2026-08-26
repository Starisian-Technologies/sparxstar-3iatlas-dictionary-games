/**
 * Identifier helpers shared by the session and progress-sync layers.
 *
 * Two distinct identifiers are minted here, and the engine treats them very
 * differently (GAME-SERVICE-INTAKE-SPEC-v1.0; node-engine
 * `src/services/batch.ts` and `src/services/gameResults.ts`):
 *
 *   - **Event id** — the transport-level idempotency key. The engine's
 *     `processed_events` table dedupes on it, so re-sending the *same* queued
 *     event (a retry, a reconnect flush) is a no-op server-side. A fresh id is
 *     minted once, when the event is queued, and never regenerated.
 *
 *   - **Run id** — the identifier of one play-through, sent as the
 *     `game.result` payload's `session_id`. The engine namespaces it (`solo:`)
 *     and uses it as the `run_id` half of the per-question award claim
 *     `(game_type, run_id, question_id, account_id)`. It must be stable for
 *     the whole run and unique across runs: reusing one lets a replay settle
 *     against an already-claimed question, and minting a fresh one per event
 *     would pay for the same question repeatedly.
 *
 * Both are plain v4 UUIDs. The engine caps `run_id` at 128 characters
 * including its own `solo:` prefix, so a 36-character UUID has ample room.
 */

/**
 * Mint a random identifier.
 *
 * Prefers `crypto.randomUUID()`. The fallback is for environments without it
 * (older browsers, some test runners); it is not cryptographically strong, but
 * these identifiers are collision-avoidance keys for one client's own events
 * and runs, not secrets.
 *
 * @returns {string}
 */
function randomId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/** Mint a transport-level idempotency key for one outbox event. */
export function newEventId() {
    return `evt-${randomId()}`;
}

/** Mint the run identifier for one play-through (the wire's `session_id`). */
export function newRunId() {
    return `run-${randomId()}`;
}
