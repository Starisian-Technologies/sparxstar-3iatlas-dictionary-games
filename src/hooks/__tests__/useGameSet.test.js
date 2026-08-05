/**
 * useGameSet — content-plane regression check for Phase 3.
 *
 * Phase 3 only touches the progress-sync layer (useProgressSync.js,
 * GameShell.jsx's onResult wiring, the 6 game components' timing
 * instrumentation). This file was never touched by that diff — this test
 * exists to prove the dictionary's GET {restUrl}/game-set pull still works
 * exactly as before, and that it is genuinely read-only: no request other
 * than GET /game-set (and, on a 401, GET /page-token) is ever made.
 */
import { act } from 'react';
import { renderHook } from '../../testUtils/renderHook.js';
import { useGameSet } from '../useGameSet.js';

jest.mock('../idbUtils.js', () => ({
    getRecord: jest.fn(async () => null), // force a network fetch (no cache hit)
    putRecord: jest.fn(async () => true),
}));

beforeEach(() => {
    global.fetch = jest.fn();
    window.fetch = global.fetch;
});

afterEach(() => {
    delete global.fetch;
    delete window.fetch;
});

function flushMicrotasks() {
    return act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('useGameSet — GET {restUrl}/game-set (pull-only content plane)', () => {
    it('fetches words from GET /game-set and never issues a write request', async () => {
        window.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                data: { words: [{ uuid: 'w1', headword: 'test' }] },
            }),
        });

        const { result, rerender } = renderHook(useGameSet, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            langSource: 'mandinka',
            domain: '',
            limit: 20,
            includeAudio: false,
        });

        await flushMicrotasks();
        rerender({
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            langSource: 'mandinka',
            domain: '',
            limit: 20,
            includeAudio: false,
        });

        expect(window.fetch).toHaveBeenCalledTimes(1);
        const [url, opts] = window.fetch.mock.calls[0];
        expect(url).toBe(
            'https://dict.example/wp-json/sparxstar/v1/dictionary/game-set?lang_source=mandinka&limit=20&include_audio=false'
        );
        // GET only — no method override, no body. This is the read-only/
        // pull-only invariant: no write path toward the dictionary anywhere
        // in the sync-layer diff.
        expect(opts.method ?? 'GET').toBe('GET');
        expect(opts.body).toBeUndefined();

        expect(result.current.words).toEqual([{ uuid: 'w1', headword: 'test' }]);
        expect(result.current.error).toBeNull();
    });

    it('retries once against a refreshed page token on 401, still GET-only', async () => {
        window.fetch
            .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ data: { token: 'new-token' } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true, data: { words: [] } }),
            });

        renderHook(useGameSet, {
            restUrl: 'https://dict.example/wp-json/sparxstar/v1/dictionary',
            langSource: 'mandinka',
        });

        await flushMicrotasks();
        await flushMicrotasks();

        expect(window.fetch).toHaveBeenCalledTimes(3);
        expect(window.fetch.mock.calls[1][0]).toBe(
            'https://dict.example/wp-json/sparxstar/v1/dictionary/page-token'
        );
        window.fetch.mock.calls.forEach(([, opts]) => {
            expect(opts?.method ?? 'GET').toBe('GET');
        });
    });
});
