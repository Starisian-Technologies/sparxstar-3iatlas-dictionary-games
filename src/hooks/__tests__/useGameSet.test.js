/**
 * useGameSet — the browser half of the private-Dictionary contract.
 *
 * This file used to assert that the hook called the Dictionary REST API
 * directly, with an ephemeral page token and a 3-day IndexedDB cache. All
 * three of those are now the things it asserts CANNOT happen:
 *
 *   - The request is SAME-ORIGIN, to the games BFF. The Dictionary API is
 *     private; no browser may call it.
 *   - No page token, no API key, no credential of any kind leaves the browser.
 *   - Nothing is persisted. Game words carry rights and consent restrictions
 *     and can be withdrawn, and a client-side cache is a place a withdrawn
 *     word outlives its withdrawal on a device nobody can reach.
 *
 * The pull-only invariant it always defended is unchanged and still checked:
 * GET only, no body, no write path toward the dictionary.
 */
import { act } from 'react';
import { renderHook } from '../../testUtils/renderHook.js';
import { MAX_PACK_SIZE, useGameSet } from '../useGameSet.js';

const BFF = '/api/dictionary';

/*
 * DELIBERATELY NOT MOCKED: `idbUtils`.
 *
 * The old suite mocked it to force a cache miss. This one imports the hook
 * against the real module and asserts nothing is written — a mock would hide
 * exactly the regression worth catching, namely someone reintroducing a
 * persistent copy of rights-restricted content.
 */
import * as idbUtils from '../idbUtils.js';

beforeEach(() => {
    // window.fetch and global.fetch are the same object under this repo's
    // jest-environment-jsdom setup, so mocking window.fetch is sufficient and
    // keeps this browser-env file eslint-clean.
    window.fetch = jest.fn();
    jest.spyOn(idbUtils, 'putRecord');
});

afterEach(() => {
    delete window.fetch;
    jest.restoreAllMocks();
});

function flushMicrotasks() {
    return act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function okPack(words) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { words } }),
    };
}

/** One word in the shape the BFF actually returns (the Dictionary's GamePack). */
function packWord(overrides = {}) {
    return {
        entry_id: 'entry-1',
        header_word: 'baa',
        ipa_pronunciation: 'baː',
        domain_code: '1.3',
        english_lemma: 'river',
        french_lemma: 'rivière',
        english_definition: 'a large natural stream',
        audio_url: null,
        example: { sentence: 'Baa be jan.', translation_en: 'The river is far.' },
        ...overrides,
    };
}

describe('useGameSet — GET {bffPath}/game-set (private dictionary, via the BFF)', () => {
    it('fetches words from the same-origin BFF and never issues a write request', async () => {
        window.fetch.mockResolvedValue(okPack([packWord()]));

        const props = { bffPath: BFF, language: 'mnk', domain: '', limit: 20 };
        const { result, rerender } = renderHook(useGameSet, props);

        await flushMicrotasks();
        rerender({ ...props });

        expect(window.fetch).toHaveBeenCalledTimes(1);
        const [url, opts] = window.fetch.mock.calls[0];

        // Relative, so same-origin by construction. The dictionary's own
        // address does not appear in the bundle at all.
        expect(url).toBe('/api/dictionary/game-set?language=mnk&size=20');
        expect(url.startsWith('/')).toBe(true);
        expect(url).not.toMatch(/^https?:/);

        // Pull-only: GET, no body, no method override.
        expect(opts.method ?? 'GET').toBe('GET');
        expect(opts.body).toBeUndefined();

        expect(result.current.error).toBeNull();
    });

    it('sends no credential — no page token, no API key, no cookies', async () => {
        window.fetch.mockResolvedValue(okPack([]));

        renderHook(useGameSet, { bffPath: BFF, language: 'mnk' });
        await flushMicrotasks();

        const [, opts] = window.fetch.mock.calls[0];
        const headerNames = Object.keys(opts.headers ?? {}).map((name) => name.toLowerCase());

        expect(headerNames).not.toContain('x-page-token');
        expect(headerNames).not.toContain('x-api-key');
        expect(headerNames).not.toContain('authorization');
        // Same-origin would otherwise attach cookies by default.
        expect(opts.credentials).toBe('omit');
    });

    it('never calls /page-token — the route does not exist and the flow is retired', async () => {
        window.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

        const { result } = renderHook(useGameSet, { bffPath: BFF, language: 'mnk' });
        await flushMicrotasks();
        await flushMicrotasks();

        // Exactly one request, and no token refresh behind it. A 401 from the
        // BFF is a service problem the player cannot fix by re-authenticating.
        expect(window.fetch).toHaveBeenCalledTimes(1);
        for (const [url] of window.fetch.mock.calls) {
            expect(url).not.toContain('page-token');
        }
        expect(result.current.error).toBe('HTTP 401');
    });

    it('persists nothing — a withdrawn word must not outlive its withdrawal', async () => {
        window.fetch.mockResolvedValue(okPack([packWord()]));

        renderHook(useGameSet, { bffPath: BFF, language: 'mnk' });
        await flushMicrotasks();

        expect(idbUtils.putRecord).not.toHaveBeenCalled();
    });

    it('asks for audio-verified entries only when the game needs audio', async () => {
        window.fetch.mockResolvedValue(okPack([]));

        renderHook(useGameSet, { bffPath: BFF, language: 'mnk', audioVerifiedOnly: true });
        await flushMicrotasks();

        const [url] = window.fetch.mock.calls[0];
        // `audio_verified` asks for entries that HAVE consented, verified audio
        // — not for audio to be added to any entry, which is what the retired
        // `include_audio` parameter meant.
        expect(url).toContain('audio_verified=true');
        expect(url).not.toContain('include_audio');
    });

    it('passes a domain filter through and omits it when empty', async () => {
        window.fetch.mockResolvedValue(okPack([]));

        renderHook(useGameSet, { bffPath: BFF, language: 'mnk', domain: '1.3' });
        await flushMicrotasks();
        expect(window.fetch.mock.calls[0][0]).toContain('domain=1.3');

        window.fetch.mockClear();
        renderHook(useGameSet, { bffPath: BFF, language: 'mnk', domain: '' });
        await flushMicrotasks();
        expect(window.fetch.mock.calls[0][0]).not.toContain('domain=');
    });

    it('makes no request at all without a language', async () => {
        renderHook(useGameSet, { bffPath: BFF, language: null });
        await flushMicrotasks();
        expect(window.fetch).not.toHaveBeenCalled();
    });

    it('clamps the pack size to the BFF ceiling rather than provoking a 400', async () => {
        window.fetch.mockResolvedValue(okPack([]));

        renderHook(useGameSet, { bffPath: BFF, language: 'mnk', limit: 5000 });
        await flushMicrotasks();

        // The BFF refuses an over-cap size; a caller passing a large number is
        // a product question about pack size, not something to show a player.
        //
        // Asserted against the exported constant, not a literal. This said
        // `size=50` while the BFF's own GAMES_MAX_PACK_SIZE allowed 100, so the
        // test pinned a ceiling that disagreed with the service and there was
        // nothing to catch the disagreement.
        expect(window.fetch.mock.calls[0][0]).toContain(`size=${MAX_PACK_SIZE}`);
    });

    it('reports a failure without inventing an empty word list', async () => {
        window.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

        const { result } = renderHook(useGameSet, { bffPath: BFF, language: 'mnk' });
        await flushMicrotasks();

        expect(result.current.error).toBe('HTTP 503');
        expect(result.current.words).toEqual([]);
        expect(result.current.loading).toBe(false);
    });
});

/**
 * The regression this file did not previously catch.
 *
 * The hook used to hand the BFF's GamePack straight to the components, which
 * read a different set of field names — so every prompt rendered blank and
 * every result carried `word_uuid: undefined`. The suite above tested the hook
 * against a BFF response and the BFF suite tested the BFF against a Dictionary
 * response; nothing tested the pair, which is exactly where the break lived.
 */
describe('useGameSet — hands components THEIR shape, not the pack shape', () => {
    it('adapts GamePack field names to the ones the components read', async () => {
        window.fetch.mockResolvedValue(okPack([packWord()]));

        const { result } = renderHook(useGameSet, { bffPath: BFF, language: 'mnk' });
        await flushMicrotasks();

        const [word] = result.current.words;

        // What the components read.
        expect(word.uuid).toBe('entry-1');
        expect(word.headword).toBe('baa');
        expect(word.ipa).toBe('baː');
        expect(word.domain).toBe('1.3');
        expect(word.translation_en).toBe('river');
        expect(word.translation_fr).toBe('rivière');
        expect(word.example_sentences).toEqual([
            { sentence: 'Baa be jan.', translation_en: 'The river is far.' },
        ]);

        // And the raw pack names are gone, so nothing downstream can start
        // depending on both spellings at once.
        expect(word.entry_id).toBeUndefined();
        expect(word.header_word).toBeUndefined();
    });

    it('carries a withheld definition through as withheld, never reconstructed', async () => {
        /*
         * This assertion changed with the field-usage audit, and the reason is
         * in `src/api/__tests__/gamePackAdapter.test.js`: the rights mechanism
         * is the EMPTY STRING set upstream, not the absence of the field. The
         * adapter now carries `english_definition` because 62.3% of sampled
         * entries have one that no game could previously show — but an empty
         * value stays empty and is never backfilled.
         */
        window.fetch.mockResolvedValue(
            okPack([packWord({ english_definition: '', french_definition: '' })])
        );

        const { result } = renderHook(useGameSet, { bffPath: BFF, language: 'mnk' });
        await flushMicrotasks();

        const [word] = result.current.words;
        expect(word.english_definition).toBe('');
        expect(word.french_definition).toBe('');
        // The gloss comes from the lemma, which is never rights-gated.
        expect(word.translation_en).toBe('river');
    });
});
