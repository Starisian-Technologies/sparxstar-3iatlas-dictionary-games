/**
 * statsClient — what this client must never do, and what it must pass through.
 *
 * The properties worth pinning here are almost all negative. The engine owns
 * every rank, total and tie (NODE-ADR-011), so the failure mode this file
 * guards against is not a wrong calculation — it is a calculation existing at
 * all, or a request that quietly asks the engine for the wrong population.
 */
import {
    DICTIONARY_GAME_TYPE,
    StatsError,
    fetchAccountStats,
    fetchLeaderboard,
} from '../statsClient.js';

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

/** The single query string the client actually requested. */
function requestedUrl() {
    return new URL(window.fetch.mock.calls[0][0], 'https://engine.test');
}

beforeEach(() => {
    window.fetch = jest.fn();
});

afterEach(() => {
    delete window.fetch;
});

describe('fetchLeaderboard — the request', () => {
    it('asks for one registered game type when the Dictionary board is chosen', async () => {
        window.fetch.mockResolvedValue(jsonResponse({ entries: [] }));

        await fetchLeaderboard({
            engineUrl: 'https://engine.test/api/v1',
            token: 't',
            scope: 'game',
            gameType: DICTIONARY_GAME_TYPE,
        });

        const url = requestedUrl();
        expect(url.searchParams.get('scope')).toBe('game');
        expect(url.searchParams.get('game_type')).toBe('dictionary_quiz');
    });

    it('sends NO game_type for the all-games board', async () => {
        /*
         * The point of the assertion. An absent `game_type` is what the engine
         * reads as "every registered game", so a game registered later appears
         * on this board with no change here. Sending a list of the types this
         * client happens to know about would produce a board that stopped being
         * "all games" the moment the platform gained one — and would look
         * correct until then.
         */
        window.fetch.mockResolvedValue(jsonResponse({ entries: [] }));

        await fetchLeaderboard({
            engineUrl: 'https://engine.test/api/v1',
            token: 't',
            scope: 'all_games',
            gameType: null,
        });

        const url = requestedUrl();
        expect(url.searchParams.get('scope')).toBe('all_games');
        expect(url.searchParams.has('game_type')).toBe(false);
    });

    it('never sends an account id, a class or a school', async () => {
        /*
         * The board's population comes from the caller's own account on the
         * server. A class id in the query string would be a class id the client
         * could change, and an account id would make the request identify
         * someone the response is careful not to name.
         */
        window.fetch.mockResolvedValue(jsonResponse({ entries: [] }));

        await fetchLeaderboard({
            engineUrl: 'https://engine.test/api/v1',
            token: 't',
            language: 'mnk',
            cursor: 'abc',
        });

        const keys = [...requestedUrl().searchParams.keys()];
        expect(keys).not.toContain('account_id');
        expect(keys).not.toContain('class_id');
        expect(keys).not.toContain('school_id');
    });

    it('echoes the cursor back verbatim rather than parsing it', async () => {
        /* The cursor is the engine's keyset token. Decoding, re-encoding or
         * "fixing" it here would couple this client to a format it has no
         * business knowing, and a client-built cursor is how a paging client
         * starts skipping rows. */
        window.fetch.mockResolvedValue(jsonResponse({ entries: [] }));
        const cursor = 'eyJ4cCI6NDIsInNjcmVlbl9uYW1lIjoiQSJ9';

        await fetchLeaderboard({ engineUrl: 'https://engine.test/api/v1', token: 't', cursor });

        expect(requestedUrl().searchParams.get('cursor')).toBe(cursor);
    });

    it('does not double a slash when the engine base ends in one', async () => {
        window.fetch.mockResolvedValue(jsonResponse({ entries: [] }));

        await fetchLeaderboard({ engineUrl: 'https://engine.test/api/v1/', token: 't' });

        expect(requestedUrl().pathname).toBe('/api/v1/leaderboard');
    });

    it('strips a whole run of trailing slashes, not just the last one', async () => {
        /*
         * Several slashes is still one boundary. The linear implementation this
         * asserts against replaced `/\/+$/`, which CodeQL flags as polynomial —
         * though measured against V8 that regex handled 50,000 slashes in 0ms,
         * so the change is about not carrying a quadratic-in-principle pattern
         * rather than about a slowdown. This test pins the behaviour, which is
         * the part a future rewrite could actually get wrong; there is no
         * timing assertion here because there is no timing claim to make.
         */
        window.fetch.mockResolvedValue(jsonResponse({ entries: [] }));

        await fetchLeaderboard({
            engineUrl: `https://engine.test/api/v1${'/'.repeat(5000)}`,
            token: 't',
        });

        expect(requestedUrl().pathname).toBe('/api/v1/leaderboard');
    });
});

describe('fetchLeaderboard — the response', () => {
    it('returns the engine payload unmodified, ties and all', async () => {
        /*
         * Deliberately awkward input: two rows share rank 2, and the ranks are
         * NOT the row positions. A client that renumbered, re-sorted or
         * "corrected" any of it would fail here — which is the whole point, as
         * a tie is exactly where a client-side rank and the engine's diverge.
         */
        const payload = {
            window: 'weekly',
            scope: 'all_games',
            entries: [
                { rank: 1, screen_name: 'A', xp: 90, is_self: false, tied: false, movement: 'up' },
                { rank: 2, screen_name: 'B', xp: 50, is_self: false, tied: true, movement: 'down' },
                { rank: 2, screen_name: 'C', xp: 50, is_self: true, tied: true, movement: 'new' },
                {
                    rank: 4,
                    screen_name: 'D',
                    xp: 10,
                    is_self: false,
                    tied: false,
                    movement: 'unchanged',
                },
            ],
            next_cursor: null,
            self_context: null,
        };
        window.fetch.mockResolvedValue(jsonResponse(payload));

        const result = await fetchLeaderboard({
            engineUrl: 'https://engine.test/api/v1',
            token: 't',
        });

        expect(result).toEqual(payload);
        expect(result.entries.map((e) => e.rank)).toEqual([1, 2, 2, 4]);
    });
});

describe('errors', () => {
    it('reports an expired session distinctly from an unreachable server', async () => {
        window.fetch.mockResolvedValue(jsonResponse({}, 401));
        await expect(
            fetchLeaderboard({ engineUrl: 'https://engine.test/api/v1', token: 't' })
        ).rejects.toMatchObject({ code: 'unauthorized' });

        window.fetch.mockResolvedValue(jsonResponse({}, 503));
        await expect(
            fetchLeaderboard({ engineUrl: 'https://engine.test/api/v1', token: 't' })
        ).rejects.toMatchObject({ code: 'unavailable' });
    });

    it('does not put the response body in the error message', async () => {
        /* This request carries a bearer token, and an error body can echo the
         * headers it was sent. The status code is the only thing lifted out. */
        window.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ echoed: 'Bearer super-secret-token' }),
        });

        await expect(
            fetchLeaderboard({
                engineUrl: 'https://engine.test/api/v1',
                token: 'super-secret-token',
            })
        ).rejects.toThrow(/^Server returned 500\.$/);
    });

    it('re-throws an abort instead of turning it into an error to display', async () => {
        /* A component unmounting mid-flight must not paint a failure over a
         * screen the player has already left. */
        const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
        window.fetch.mockRejectedValue(abort);

        await expect(
            fetchLeaderboard({ engineUrl: 'https://engine.test/api/v1', token: 't' })
        ).rejects.toBe(abort);
    });

    it('refuses a self-stats call with no account id rather than guessing one', () => {
        expect(() =>
            fetchAccountStats({
                engineUrl: 'https://engine.test/api/v1',
                token: 't',
                accountId: null,
            })
        ).toThrow(StatsError);
        expect(window.fetch).not.toHaveBeenCalled();
    });
});

describe('fetchAccountStats', () => {
    it('addresses the owner-only route with the account it was given', async () => {
        window.fetch.mockResolvedValue(jsonResponse({ account_id: 'acc-1' }));

        await fetchAccountStats({
            engineUrl: 'https://engine.test/api/v1',
            token: 't',
            accountId: 'acc-1',
        });

        expect(requestedUrl().pathname).toBe('/api/v1/account/acc-1/stats');
        expect(window.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
    });
});
