/**
 * Game Service event contract — the frozen payload shape from
 * 3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0 §3: "the client
 * syncNow() POSTs the existing frozen event schema — word_uuid, game_type,
 * outcome, attempts, xp, timestamp, production-vs-recognition flag — to the
 * Game Service instead of WordPress."
 *
 * This module only builds that payload from a completed useGameSession
 * session. It performs no network I/O. useProgressSync.syncNow() stays a
 * no-op (OQ-G1: no approved suite-token source yet — the suite Identity
 * Service referenced by the decision doc does not exist as of this
 * writing). Once a token source lands, syncNow() becomes a drop-in:
 *
 *   const events = buildGameServiceBatch(session);
 *   if (events.length) {
 *       await fetch(gameServiceUrl, {
 *           method: 'POST',
 *           headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suiteToken}` },
 *           body: JSON.stringify({ events }),
 *       });
 *   }
 *
 * @module gameServiceEventContract
 */

import { PRODUCTION_GAMES } from '../constants.js';

/**
 * Build one frozen-schema event from a useGameSession result entry.
 *
 * The production-vs-recognition flag is not yet named by an accepted
 * contract (GAME-SERVICE-INTAKE-SPEC-v1.0 is unwritten as of this writing) —
 * `production_vs_recognition` here is this repo's best-effort field name and
 * may need to be renamed once that spec lands.
 *
 * @param {{ wordUuid: string, outcome: 'correct'|'learning', attempts: number, xp: number, ts: number }} result
 * @param {string} gameType
 * @returns {{ word_uuid: string, game_type: string, outcome: string, attempts: number, xp: number, timestamp: number, production_vs_recognition: 'production'|'recognition' }}
 */
export function buildGameServiceEvent(result, gameType) {
    return {
        word_uuid: result.wordUuid,
        game_type: gameType,
        outcome: result.outcome,
        attempts: result.attempts,
        xp: result.xp,
        timestamp: result.ts,
        production_vs_recognition: PRODUCTION_GAMES.has(gameType) ? 'production' : 'recognition',
    };
}

/**
 * Build the full frozen-schema event batch for a session, ready to POST as
 * `{ events: [...] }` once the Game Service auth path exists.
 *
 * @param {{ gameType: string, results: Array<{ wordUuid: string, outcome: string, attempts: number, xp: number, ts: number }> }|null} session
 * @returns {object[]}
 */
export function buildGameServiceBatch(session) {
    if (!session || !Array.isArray(session.results)) return [];
    return session.results.map((result) => buildGameServiceEvent(result, session.gameType));
}
