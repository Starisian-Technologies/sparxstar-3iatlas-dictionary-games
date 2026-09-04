/**
 * GameShell — the per-language domain filter.
 *
 * This suite exists for one defect class: state that outlives the thing it
 * describes. Domain codes are per-language, so a domain list (and a selection
 * made from it) belongs to exactly one `sourceLanguage`. The effect that loads
 * the list used to write it only on SUCCESS, which meant switching language
 * left the previous language's domains on screen — and left `selectedDomain`
 * holding one of them, which then went out as the `domain=` filter on the new
 * language's game-set request. The player would see an empty pack and no
 * indication why.
 *
 * The assertion that matters is therefore not on the rendered list but on the
 * OUTBOUND REQUEST: after a language change, no stale domain may reach the BFF.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import GameShell from '../GameShell.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/*
 * The session and outbox hooks persist to IndexedDB, which jsdom does not
 * provide. Mocked to the same "empty store" shape the hook suites use — this
 * file is about the domain effect, not about persistence.
 */
jest.mock('../../hooks/idbUtils.js', () => ({
    openDB: jest.fn(async () => null),
    getRecord: jest.fn(async () => null),
    putRecord: jest.fn(async () => undefined),
    deleteRecord: jest.fn(async () => undefined),
    getAllRecords: jest.fn(async () => []),
    clearStore: jest.fn(async () => undefined),
}));

const BFF = '/api/dictionary';
const LANGUAGES = [
    { slug: 'mnk', name: 'Mandinka' },
    { slug: 'wol', name: 'Wolof' },
];

/** Route the mock by URL, so each test only states what it cares about. */
function routeFetch({ domains, domainsOk = true }) {
    return jest.fn(async (url) => {
        if (String(url).includes('/domains')) {
            if (!domainsOk) return { ok: false, status: 503, json: async () => ({}) };
            return { ok: true, status: 200, json: async () => ({ ok: true, data: { domains } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { words: [] } }) };
    });
}

function mount(props) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<GameShell {...props} />));
    return {
        container,
        rerender: (next) => act(() => root.render(<GameShell {...next} />)),
        unmount: () => act(() => root.unmount()),
    };
}

function settle() {
    return act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** Drive a React-controlled <select> the way a player would. */
function choose(select, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    act(() => {
        setter.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function gameSetUrls(fetchMock) {
    return fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => u.includes('/game-set'));
}

function baseProps(overrides = {}) {
    return {
        bffPath: BFF,
        language: 'en',
        sourceLanguage: 'mnk',
        languages: LANGUAGES,
        onSourceLanguage: jest.fn(),
        onBrowse: jest.fn(),
        ...overrides,
    };
}

afterEach(() => {
    delete window.fetch;
    document.body.innerHTML = '';
    jest.restoreAllMocks();
});

describe('GameShell — a domain selection never outlives its language', () => {
    it('drops the previous language’s selection even when the new list fails to load', async () => {
        /*
         * The failure case is the one that shipped. On success the new list
         * simply replaced the old one and the mismatch was invisible; on
         * failure the old list — and the old selection — stayed indefinitely.
         */
        window.fetch = routeFetch({ domains: [{ slug: '1.3', name: 'Water', count: 4 }] });

        const props = baseProps();
        const view = mount(props);
        await settle();

        const select = view.container.querySelector('select');
        expect(select).not.toBeNull();
        choose(select, '1.3');
        await settle();

        // The filter is in force for THIS language.
        expect(gameSetUrls(window.fetch).at(-1)).toContain('domain=1.3');

        // Now the language changes and the new language's domains do not load.
        window.fetch = routeFetch({ domains: [], domainsOk: false });
        view.rerender(baseProps({ sourceLanguage: 'wol' }));
        await settle();
        await settle();

        for (const url of gameSetUrls(window.fetch)) {
            expect(url).toContain('language=wol');
            expect(url).not.toContain('domain=');
        }
    });

    it('shows no stale domains once the language changes', async () => {
        window.fetch = routeFetch({ domains: [{ slug: '1.3', name: 'Water', count: 4 }] });

        const view = mount(baseProps());
        await settle();

        expect(view.container.textContent).toContain('Water');

        window.fetch = routeFetch({ domains: [], domainsOk: false });
        view.rerender(baseProps({ sourceLanguage: 'wol' }));
        await settle();
        await settle();

        // "All domains" is the honest empty state; "Water" is a domain of a
        // language that is no longer selected.
        expect(view.container.textContent).not.toContain('Water');
    });

    it('asks for domains per language, and asks again when it changes', async () => {
        window.fetch = routeFetch({ domains: [] });

        const view = mount(baseProps());
        await settle();

        view.rerender(baseProps({ sourceLanguage: 'wol' }));
        await settle();

        const domainUrls = window.fetch.mock.calls
            .map(([url]) => String(url))
            .filter((u) => u.includes('/domains'));

        expect(domainUrls).toEqual([
            '/api/dictionary/domains?language=mnk',
            '/api/dictionary/domains?language=wol',
        ]);
    });
});

/**
 * The regression the derivation could have introduced, and did not.
 *
 * Resume restores the domain and the language from a saved session, but the
 * language is the PARENT's state — `onSourceLanguage` lands on a later render.
 * A domain tagged with whatever language happened to be selected at the moment
 * of restore would therefore evaporate as soon as the resumed language
 * arrived, silently widening a filtered session to the whole corpus.
 */
describe('GameShell — resuming a saved session keeps its domain filter', () => {
    it('restores the domain against the session’s own language, not the current one', async () => {
        const idb = require('../../hooks/idbUtils.js');
        idb.getRecord.mockImplementation(async (store) =>
            store === 'game-sessions'
                ? {
                      runId: 'run-1',
                      completedAt: null,
                      currentIndex: 0,
                      gameType: 'domain_flash',
                      domain: '1.3',
                      langSource: 'wol',
                      words: [{ uuid: 'w1', headword: 'baa', translation_en: 'river' }],
                  }
                : null
        );

        window.fetch = routeFetch({ domains: [{ slug: '1.3', name: 'Water', count: 4 }] });

        /*
         * The parent owns `sourceLanguage`, so the request is only recorded
         * here and applied on the next render — the same one-render lag the
         * real site has, and the lag this test exists to survive.
         */
        const requested = [];
        const onSourceLanguage = jest.fn((slug) => requested.push(slug));

        const props = baseProps({ sourceLanguage: 'mnk', onSourceLanguage });
        const view = mount(props);
        await settle();

        expect(requested).toContain('wol');
        view.rerender({ ...props, sourceLanguage: 'wol' });
        await settle();

        const urls = gameSetUrls(window.fetch).filter((u) => u.includes('language=wol'));
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
            expect(url).toContain('domain=1.3');
        }
    });
});
