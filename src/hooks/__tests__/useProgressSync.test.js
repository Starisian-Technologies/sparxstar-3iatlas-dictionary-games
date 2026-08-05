/**
 * useProgressSync — Phase 3 sync-layer tests.
 *
 * Two things this suite must prove:
 *   1. Guest/local-only stays true: with no engineUrl and/or no getSuiteToken
 *      (or one that resolves to nothing), syncNow() never touches the network
 *      and the outbox is left exactly as it was.
 *   2. When both are supplied (the "suite token present" case — fully built,
 *      testable via injection, per the Phase 3 brief), syncNow() translates
 *      queued `game_result` outbox events into the engine's `game.result`
 *      wire shape, POSTs them to `${engineUrl}/events/batch` with a Bearer
 *      token, and drains only the events the server didn't report as failed.
 *      The aiwa_game_* bonus events are never sent.
 */
import { renderHook } from '../../testUtils/renderHook.js';
import { useProgressSync } from '../useProgressSync.js';
import * as idbUtils from '../idbUtils.js';

jest.mock('../idbUtils.js', () => {
    const store = new Map(); // `${storeName}:${key}` -> record

    return {
        __store: store,
        getRecord: jest.fn(async (storeName, key) => store.get(`${storeName}:${key}`) ?? null),
        putRecord: jest.fn(async (storeName, record) => {
            store.set(`${storeName}:${record.key}`, record);
            return true;
        }),
    };
});

function getOutbox() {
    return idbUtils.__store.get('progress-outbox:progress-outbox:pending')?.events ?? [];
}

beforeEach(() => {
    idbUtils.__store.clear();
    jest.clearAllMocks();
    window.fetch = jest.fn();
});

afterEach(() => {
    delete window.fetch;
});

describe('useProgressSync — guest/local-only path', () => {
    it('does not call fetch when neither engineUrl nor getSuiteToken is supplied', async () => {
        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
        });

        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'w1',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 1200,
        });

        await result.current.syncNow();

        expect(window.fetch).not.toHaveBeenCalled();
        expect(getOutbox()).toHaveLength(1); // nothing drained — still local-only
    });

    it('does not call fetch when getSuiteToken resolves to null (no token minted yet)', async () => {
        const getSuiteToken = jest.fn().mockResolvedValue(null);
        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            engineUrl: 'https://engine.example/api/v1',
            getSuiteToken,
        });

        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'w1',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 500,
        });
        await result.current.syncNow();

        expect(getSuiteToken).toHaveBeenCalled();
        expect(window.fetch).not.toHaveBeenCalled();
        expect(getOutbox()).toHaveLength(1);
    });

    it('does not throw and leaves the outbox untouched if getSuiteToken() itself throws', async () => {
        const getSuiteToken = jest.fn().mockRejectedValue(new Error('token store unavailable'));
        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            engineUrl: 'https://engine.example/api/v1',
            getSuiteToken,
        });

        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'w1',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 500,
        });
        await expect(result.current.syncNow()).resolves.toBeUndefined();

        expect(window.fetch).not.toHaveBeenCalled();
        expect(getOutbox()).toHaveLength(1);
    });
});

describe('useProgressSync — authenticated sync path (suite token injected)', () => {
    it('POSTs only game_result events, mapped to game.result, with a Bearer token', async () => {
        window.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ accepted: 2, failed: [] }),
        });
        const getSuiteToken = jest.fn().mockResolvedValue('fake-participant-token');

        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            engineUrl: 'https://engine.example/api/v1',
            getSuiteToken,
        });

        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'w1',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 1200,
        });
        await result.current.addEvent({ type: 'aiwa_game_streak_3' }); // bonus signal — must stay local-only
        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'w2',
            game: 'letter_reveal',
            outcome: 'learning',
            attempts: 5,
            time_ms: 4300,
        });

        await result.current.syncNow();

        expect(window.fetch).toHaveBeenCalledTimes(1);
        const [url, opts] = window.fetch.mock.calls[0];
        expect(url).toBe('https://engine.example/api/v1/events/batch');
        expect(opts.method).toBe('POST');
        expect(opts.headers.Authorization).toBe('Bearer fake-participant-token');

        const body = JSON.parse(opts.body);
        expect(body.events).toHaveLength(2); // the two game_result events, not the bonus event
        expect(body.events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    event_type: 'game.result',
                    payload: {
                        game_type: 'dictionary_quiz',
                        outcome: 'correct',
                        attempts: 1,
                        time_ms: 1200,
                    },
                }),
                expect.objectContaining({
                    event_type: 'game.result',
                    payload: {
                        game_type: 'dictionary_quiz',
                        outcome: 'learning',
                        attempts: 5,
                        time_ms: 4300,
                    },
                }),
            ])
        );
        // Every event carries a stable event_id for idempotent replay.
        body.events.forEach((e) => expect(typeof e.event_id).toBe('string'));

        // Both game_result events accepted -> drained; the bonus event never sent, stays queued locally.
        const remaining = getOutbox();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].type).toBe('aiwa_game_streak_3');
    });

    it('keeps failed events queued for retry and drains only accepted ones', async () => {
        const getSuiteToken = jest.fn().mockResolvedValue('fake-participant-token');
        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            engineUrl: 'https://engine.example/api/v1',
            getSuiteToken,
        });

        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'ok',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 900,
        });
        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'bad',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 900,
        });

        const queuedIds = getOutbox().map((e) => e.event_id);

        window.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                accepted: 1,
                failed: [{ event_id: queuedIds[1], reason: 'session_unavailable' }],
            }),
        });

        await result.current.syncNow();

        const remaining = getOutbox();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].event_id).toBe(queuedIds[1]);
    });

    it('leaves the outbox untouched on a non-OK response, so a full retry happens next time', async () => {
        const getSuiteToken = jest.fn().mockResolvedValue('fake-participant-token');
        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            engineUrl: 'https://engine.example/api/v1',
            getSuiteToken,
        });

        await result.current.addEvent({
            type: 'game_result',
            word_uuid: 'w1',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 900,
        });
        window.fetch.mockResolvedValue({ ok: false, status: 401 });

        await result.current.syncNow();

        expect(getOutbox()).toHaveLength(1);
    });

    it('is a no-op when the outbox has no game_result events (only bonus signals queued)', async () => {
        const getSuiteToken = jest.fn().mockResolvedValue('fake-participant-token');
        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            engineUrl: 'https://engine.example/api/v1',
            getSuiteToken,
        });

        await result.current.addEvent({ type: 'aiwa_game_return_visit' });
        await result.current.syncNow();

        expect(window.fetch).not.toHaveBeenCalled();
        expect(getOutbox()).toHaveLength(1);
    });
});
