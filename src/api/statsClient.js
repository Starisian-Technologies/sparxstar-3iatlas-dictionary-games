/**
 * statsClient — reads the player's numbers from the RLC node-engine.
 *
 * THIS MODULE COMPUTES NOTHING. Every rank, XP total, tie, rank movement and
 * accuracy figure it returns came off the wire exactly as the engine sent it.
 * There is no sort, no `index + 1`, no local tally and no fallback that invents
 * a number when a request fails — the engine is the sole authority for all of
 * them (NODE-ADR-011), and a second implementation in a browser is a second
 * answer that will eventually disagree with the first.
 *
 * That rule is the whole reason this file is so thin. The temptation is to
 * "helpfully" derive the missing piece — number the rows a board returned,
 * average the outcomes in the local outbox into a percentage, add up the XP the
 * device has queued. Each of those produces a number that looks right on the
 * screen and is wrong the moment a tie, an unsettled event or another player's
 * round enters the picture, and the learner has no way to tell which number
 * they are looking at.
 *
 * Two endpoints, both under the engine's `/api/v1` base (the same base
 * `useProgressSync` posts `/events/batch` to, supplied as `engineUrl`):
 *
 *   GET /account/:id/stats   the caller's own XP, games played, accuracy,
 *                            rank, stars, badges — OWNER-ONLY, so it needs the
 *                            account id the token names
 *   GET /leaderboard         a page of a pseudonymous board
 *
 * A leaderboard row carries `is_self` and no account id, by design: the board
 * is a shared view, and a row that named an account would make every board a
 * screen-name-to-account-id lookup table. Nothing here should ever ask for one.
 */

/**
 * The engine `game_type` this whole suite settles as.
 *
 * RE-STATED, not re-derived: `useProgressSync` sends the same constant when it
 * settles a result, and the two must agree or the board would filter for a type
 * nothing was ever written under. It is duplicated rather than imported because
 * a hook importing from the API layer (or the reverse) is the dependency this
 * package's boundary rules keep one-way; the pairing is pinned by a test
 * instead, which is the thing that would actually catch a divergence.
 */
export const DICTIONARY_GAME_TYPE = 'dictionary_quiz';

/**
 * A stats request that could not be answered.
 *
 * `code` is for the UI to branch on, not for display: 'unauthorized' means the
 * token is gone or rejected (sign in again), 'unavailable' covers everything
 * else — offline, a 5xx, a proxy that ate the request. The distinction is the
 * one the learner can act on.
 */
export class StatsError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'StatsError';
        this.code = code;
    }
}

/**
 * Strip trailing slashes so `${base}/leaderboard` never doubles one.
 *
 * A loop rather than `/\/+$/`, which CodeQL flags as a polynomial regular
 * expression on library input: an anchored `+` is quadratic in the worst case
 * for a backtracking engine given a string that is mostly slashes.
 *
 * Being accurate about what this change is and is not: I measured it, and V8
 * optimizes that exact pattern — 50,000 trailing slashes cost 0ms through the
 * regex. So this is not a fix for a slowdown anyone would observe today, and
 * the first version of this comment claimed it was, which was wrong.
 *
 * It is still worth making. The pattern is quadratic in principle rather than
 * in this engine's current optimizer, the value is only a build-time constant
 * until the next caller passes something else, and a loop that is obviously
 * linear needs neither of those arguments to stay safe.
 */ function base(engineUrl) {
    let value = String(engineUrl);
    while (value.endsWith('/')) value = value.slice(0, -1);
    return value;
}

async function getJson(url, token, signal) {
    let resp;
    try {
        resp = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            signal,
        });
    } catch (error) {
        /* An abort is the caller cancelling, not a failure to report. Re-throw
         * it unchanged so a component unmounting mid-flight does not paint an
         * error over a screen the player has already left. */
        if (error?.name === 'AbortError') throw error;
        throw new StatsError('unavailable', 'Could not reach the server.');
    }

    if (resp.status === 401 || resp.status === 403) {
        throw new StatsError('unauthorized', 'Your session has expired.');
    }
    if (!resp.ok) {
        /* The status code, never the body: an error body can echo request
         * headers, and this request carries a bearer token. */
        throw new StatsError('unavailable', `Server returned ${resp.status}.`);
    }

    try {
        return await resp.json();
    } catch {
        throw new StatsError('unavailable', 'The server sent an unreadable response.');
    }
}

/**
 * The caller's own stats. Owner-only: `accountId` must be the account the
 * token names, or the engine answers 403 and this throws `unauthorized`.
 *
 * Both windows come back in one response because the screen shows both, and
 * two round trips to paint one page is a cost this deployment's connections
 * cannot absorb.
 *
 * @returns {Promise<object>} The engine's `AccountStatsResponse`, unmodified.
 */
export function fetchAccountStats({ engineUrl, token, accountId, signal }) {
    if (!engineUrl || !token || !accountId) {
        throw new StatsError('unavailable', 'Stats are not configured.');
    }
    return getJson(
        `${base(engineUrl)}/account/${encodeURIComponent(accountId)}/stats`,
        token,
        signal
    );
}

/**
 * A page of a leaderboard.
 *
 * NOTE WHAT IS NOT A PARAMETER: the population. Which class, school or
 * school-less board this resolves to comes from the caller's own account on the
 * server; there is no class id to pass and passing one would be a class id the
 * client could change. `scope` chooses a KIND of board, not a group of people.
 *
 * @param {object} opts
 * @param {string} opts.engineUrl  Engine base, e.g. an origin ending `/api/v1`.
 * @param {string} opts.token      Suite bearer token.
 * @param {'weekly'|'all_time'} [opts.window]
 * @param {'game'|'all_games'} [opts.scope]  'game' requires `gameType`;
 *   'all_games' must not carry one — the engine rejects the wrong pairing
 *   rather than quietly ignoring the extra field.
 * @param {string|null} [opts.gameType]
 * @param {string|null} [opts.language] Restrict to one learned language.
 * @param {number} [opts.limit]
 * @param {string|null} [opts.cursor]  `next_cursor` from the previous page.
 * @returns {Promise<object>} The engine's `LeaderboardResponse`, unmodified.
 */
export function fetchLeaderboard({
    engineUrl,
    token,
    window: statsWindow = 'weekly',
    scope = 'all_games',
    gameType = null,
    language = null,
    limit = 25,
    cursor = null,
    signal,
}) {
    if (!engineUrl || !token) {
        throw new StatsError('unavailable', 'Leaderboards are not configured.');
    }

    const params = new URLSearchParams({ window: statsWindow, scope, limit: String(limit) });
    if (gameType) params.set('game_type', gameType);
    if (language) params.set('language', language);
    if (cursor) params.set('cursor', cursor);

    return getJson(`${base(engineUrl)}/leaderboard?${params.toString()}`, token, signal);
}
