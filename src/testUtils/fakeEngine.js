/**
 * A test double for the RLC node-engine's `POST /events/batch` intake.
 *
 * This is not a stub that records calls — it is a working model of the two
 * independent idempotency mechanisms the engine actually implements, so a test
 * can assert what a player was *paid* rather than merely what was *sent*. Both
 * mechanisms are needed and neither substitutes for the other:
 *
 *   1. `processed_events` — keyed on `event_id`. Claim-then-confirm: an event
 *      whose id was already confirmed is silently skipped (not counted as
 *      accepted, not reported as failed). This is what makes re-flushing an
 *      unconfirmed outbox safe.
 *      → node-engine `src/services/batch.ts`, `processBatch`.
 *
 *   2. `game_question_awards` — keyed on
 *      `(game_type, run_id, question_id, account_id)`, inserted
 *      `ON CONFLICT DO NOTHING`. The first report of a question wins the award;
 *      every later report settles to zero, *including one arriving under a
 *      brand-new event_id*. A new run means a new `run_id`, so the same
 *      question may legitimately be paid again in a later play-through.
 *      → node-engine `src/services/gameResults.ts`, `claimAward`, and
 *        `src/games/manifests.ts` (NODE-ADR-009).
 *
 * Mechanism 1 alone would not stop a refresh from paying twice — a refresh
 * mints a new event_id. Mechanism 2 alone would not stop a partially-confirmed
 * batch from double-applying non-question-scoped work. The tests that use this
 * double exercise both.
 *
 * Modelled faithfully; deliberately not modelled: persistence, transactions,
 * the myCred webhook, rate limiting, and real token verification.
 */

/** dictionary_quiz scoring table (node-engine `src/games/manifests.ts`). */
const DICTIONARY_QUIZ_XP = { correct: 10, learning: 5, incorrect: 0, skipped: 0 };

/** Only `dictionary_quiz` is registered for this client, and it is
 *  question-scoped — every event must identify its run and its question. */
const MANIFESTS = {
    dictionary_quiz: { xp: DICTIONARY_QUIZ_XP, questionScoped: true },
};

const SOLO_RUN_PREFIX = 'solo:';
const RUN_ID_MAX = 128;

/**
 * Create a fake engine.
 *
 * @param {object} [opts]
 * @param {string} [opts.accountId]  Account the suite token resolves to.
 * @param {string} [opts.token]      The only bearer token accepted.
 * @returns {{
 *   fetch: Function,
 *   xpFor: (accountId?: string) => number,
 *   awards: Map<string, object>,
 *   requests: Array<object>,
 * }}
 */
export function createFakeEngine({ accountId = 'acct-1', token = 'suite-token' } = {}) {
    /** event_id -> 'confirmed'. Mirrors `processed_events`. */
    const processedEvents = new Set();
    /** `${game_type}|${run_id}|${question_id}|${account_id}` -> claim row. */
    const awards = new Map();
    /** account_id -> lifetime xp. */
    const ledger = new Map();
    /** Every request body the client sent, for assertions about the wire. */
    const requests = [];

    /** The engine namespaces a solo run key so it cannot collide with a
     *  classroom session's, and returns '' for anything unusable. */
    function soloRunKey(raw) {
        if (typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        if (!trimmed) return '';
        const key = `${SOLO_RUN_PREFIX}${trimmed}`;
        return key.length <= RUN_ID_MAX ? key : '';
    }

    /** `validateEnvelope` — throws the engine's own reason strings. */
    function validateEnvelope(payload, runKey) {
        if (!payload.game_type) throw new Error('invalid_payload');
        if (!payload.outcome) throw new Error('invalid_payload');
        const attempts = typeof payload.attempts === 'number' ? payload.attempts : 0;
        const timeMs = typeof payload.time_ms === 'number' ? payload.time_ms : 0;
        if (attempts < 0 || timeMs < 0) throw new Error('invalid_payload');

        const manifest = MANIFESTS[payload.game_type];
        if (!manifest) throw new Error('unsupported_game_type');

        const xp = manifest.xp[payload.outcome];
        if (xp === undefined) throw new Error('unsupported_outcome');

        if (manifest.questionScoped) {
            if (!runKey || runKey.length > RUN_ID_MAX) throw new Error('run_id_required');
            if (!payload.deal_id) throw new Error('question_id_required');
        }
        return xp;
    }

    /** `claimAward` — ON CONFLICT DO NOTHING on the four-part key. */
    function claimAward(payload, runKey, xp) {
        const key = `${payload.game_type}|${runKey}|${payload.deal_id}|${accountId}`;
        if (awards.has(key)) return { grant: 0, duplicate: true };
        awards.set(key, {
            outcome: payload.outcome,
            xp_awarded: xp,
            attempts: payload.attempts,
            time_ms: payload.time_ms,
        });
        return { grant: xp, duplicate: false };
    }

    /**
     * A `fetch` implementation to install as `window.fetch`. Answers
     * `POST {base}/events/batch` and nothing else.
     */
    async function fakeFetch(url, init = {}) {
        if (!String(url).endsWith('/events/batch')) {
            return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) };
        }
        if (init.headers?.Authorization !== `Bearer ${token}`) {
            return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
        }

        const body = JSON.parse(init.body);
        requests.push(body);

        if (!Array.isArray(body.events)) {
            return { ok: false, status: 400, json: async () => ({ error: 'events_required' }) };
        }
        if (body.events.length > 200) {
            return { ok: false, status: 400, json: async () => ({ error: 'batch_too_large' }) };
        }

        let accepted = 0;
        const failed = [];

        for (const ev of body.events) {
            // Only game.result is permitted for a suite (solo) principal.
            if (!ev?.event_id || ev.event_type !== 'game.result') {
                if (ev?.event_id) {
                    failed.push({ event_id: ev.event_id, reason: 'unsupported_event_type' });
                }
                continue;
            }

            // Mechanism 1: an already-confirmed event_id is silently skipped —
            // neither accepted again nor reported as failed.
            if (processedEvents.has(ev.event_id)) continue;

            try {
                const payload = ev.payload ?? {};
                const runKey = soloRunKey(payload.session_id);
                const xp = validateEnvelope(payload, runKey);
                // Mechanism 2: the per-question claim.
                const { grant } = claimAward(payload, runKey, xp);
                ledger.set(accountId, (ledger.get(accountId) ?? 0) + grant);
                processedEvents.add(ev.event_id);
                accepted += 1;
            } catch (err) {
                failed.push({ event_id: ev.event_id, reason: err.message });
            }
        }

        return { ok: true, status: 200, json: async () => ({ accepted, failed }) };
    }

    return {
        fetch: fakeFetch,
        xpFor: (id = accountId) => ledger.get(id) ?? 0,
        awards,
        requests,
    };
}
