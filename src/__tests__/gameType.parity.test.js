/**
 * The write side and the read side must name the same game.
 *
 * `useProgressSync` settles every Dictionary Games result under one engine
 * `game_type`, and `statsClient` filters the Dictionary board by one. If those
 * two strings ever drift apart the board filters for a type nothing was written
 * under — and the failure is silent: a valid request, a 200 response, and an
 * empty board that looks exactly like a week nobody played.
 *
 * The constant is duplicated rather than shared because the package's
 * dependency rules keep hooks and the API layer from importing each other. This
 * test is what makes that duplication safe: it reads the value the hook
 * actually puts on the wire, not a second copy of the literal.
 */
import { DICTIONARY_GAME_TYPE } from '../api/statsClient.js';
import { renderHook } from '../testUtils/renderHook.js';
import { useProgressSync } from '../hooks/useProgressSync.js';

jest.mock('../hooks/idbUtils.js', () => {
    const store = new Map();
    return {
        __store: store,
        getRecord: jest.fn(async (storeName, key) => store.get(`${storeName}:${key}`) ?? null),
        putRecord: jest.fn(async (storeName, record) => {
            store.set(`${storeName}:${record.key}`, record);
            return true;
        }),
    };
});

beforeEach(() => {
    window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ accepted: [], failed: [] }),
    });
});

afterEach(() => {
    delete window.fetch;
});

it('settles results under the same game_type the Dictionary board filters by', async () => {
    const { result } = renderHook(useProgressSync, {
        engineUrl: 'https://engine.test/api/v1',
        getSuiteToken: () => 'token',
    });

    await result.current.addEvent({
        type: 'game_result',
        run_id: 'run-a',
        word_uuid: 'word-1',
        game: 'listen_write',
        outcome: 'correct',
        attempts: 1,
        time_ms: 900,
    });
    await result.current.syncNow();

    const body = JSON.parse(window.fetch.mock.calls[0][1].body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].payload.game_type).toBe(DICTIONARY_GAME_TYPE);
});
