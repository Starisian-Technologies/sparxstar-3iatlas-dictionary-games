/**
 * GameShell — EVERY PHASE HAS A WAY OUT.
 *
 * The isolated component tests prove `GameNav` and `SessionComplete` each offer
 * an exit. They do not prove `GameShell` renders one in every phase, and that
 * is the defect that shipped: the components were fine, the `playing` branch
 * simply never rendered an exit control at all.
 *
 * So this suite drives the real `GameShell` through its real phase machine and
 * asserts on rendered output in each phase. A test asserting that `onHome` was
 * passed would not have caught the original bug either, because the original
 * `onBrowse` was also passed correctly — to an empty function.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import GameShell from '../GameShell.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../hooks/idbUtils.js', () => ({
    openDB: jest.fn(async () => null),
    getRecord: jest.fn(async () => null),
    putRecord: jest.fn(async () => undefined),
    deleteRecord: jest.fn(async () => undefined),
    getAllRecords: jest.fn(async () => []),
    clearStore: jest.fn(async () => undefined),
}));

const BFF = '/api/dictionary';

/** Enough real words that a round can actually start. */
const WORDS = Array.from({ length: 4 }, (_, i) => ({
    entry_id: `w${i}`,
    header_word: ['kenta', 'tankata', 'njemboo', 'saluno'][i],
    english_lemma: ['healthy', 'protected', 'shade', 'daily'][i],
    ipa_pronunciation: 'kenta',
    difficulty: 'A1',
    domain_code: '1.1',
    part_of_speech: 'n',
}));

/*
 * A stored session holds ADAPTED words (`headword`), not the BFF's raw
 * `header_word` shape — `initSession` persists what the adapter produced.
 */
const STORED_WORDS = WORDS.map((w, i) => ({
    uuid: `u${i}`,
    headword: w.header_word,
    translation_en: w.english_lemma,
    ipa: w.ipa_pronunciation,
    difficulty: w.difficulty,
    domain: w.domain_code,
}));

function routeFetch() {
    return jest.fn(async (url) => {
        const u = String(url);
        if (u.includes('/domains')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ ok: true, data: { domains: [] } }),
            };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { words: WORDS } }) };
    });
}

function mount(props) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<GameShell {...props} />));
    return {
        container,
        unmount: () => {
            act(() => root.unmount());
            /* Remove the container too: `unmount()` tears down React but leaves
             * the node attached, so successive tests accumulate detached DOM and
             * a document-wide query can match a previous test's markup. */
            container.remove();
        },
    };
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

const findButton = (container, text) =>
    Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.trim().includes(text)
    );

function baseProps(overrides = {}) {
    return {
        bffPath: BFF,
        language: 'en',
        sourceLanguage: 'mnk',
        languages: [{ slug: 'mnk', name: 'Mandinka' }],
        onSourceLanguage: jest.fn(),
        ...overrides,
    };
}

afterEach(() => {
    delete window.fetch;
    jest.clearAllMocks();
});

describe('every phase offers Games Home', () => {
    it('setup', async () => {
        window.fetch = routeFetch();
        const { container, unmount } = mount(baseProps());
        await settle();
        expect(findButton(container, 'Games Home')).toBeDefined();
        unmount();
    });

    it('playing', async () => {
        window.fetch = routeFetch();
        const { container, unmount } = mount(baseProps());
        await settle();

        const start = findButton(container, 'Start');
        expect(start).toBeDefined();
        await act(async () => {
            start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await settle();

        /* The regression: this phase rendered Level and Adaptive and no exit. */
        expect(findButton(container, 'Games Home')).toBeDefined();
        expect(findButton(container, 'Restart')).toBeDefined();
        unmount();
    });
});

describe('leaving mid-round is confirmed, not silent', () => {
    it('goes straight home when nothing has been answered yet', async () => {
        window.fetch = routeFetch();
        const { container, unmount } = mount(baseProps());
        await settle();

        await act(async () => {
            findButton(container, 'Start').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );
        });
        await settle();
        expect(findButton(container, 'Games Home')).toBeDefined();

        await act(async () => {
            findButton(container, 'Games Home').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );
        });
        await settle();

        /*
         * No results yet, so no confirmation — asking about work that does not
         * exist is noise. Back on setup, which is the game chooser.
         */
        expect(container.textContent).not.toContain('Leave this game?');
        expect(findButton(container, 'Start')).toBeDefined();
        unmount();
    });
});

describe('the dead Browse control is gone', () => {
    it('renders no Browse button when the host supplies no handler', async () => {
        window.fetch = routeFetch();
        const { container, unmount } = mount(baseProps());
        await settle();
        expect(findButton(container, 'Browse')).toBeUndefined();
        unmount();
    });
});

describe('the exit cannot itself become a trap (Qodo review, #23)', () => {
    it('still leaves when deleting the stored session FAILS', async () => {
        /*
         * The irony this catches. `leaveToHome` awaited `clearSession()` before
         * changing phase, and `clearSession` propagates an IndexedDB deletion
         * failure — so on a device where storage is unavailable the await
         * rejected and the phase never changed. The control added to fix a trap
         * was itself a dead exit, precisely when a player most needed it.
         */
        const idb = require('../../hooks/idbUtils.js');
        idb.deleteRecord.mockRejectedValueOnce(new Error('QuotaExceededError'));

        window.fetch = routeFetch();
        const { container, unmount } = mount(baseProps());
        await settle();

        await act(async () => {
            findButton(container, 'Start').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );
        });
        await settle();
        expect(findButton(container, 'Restart')).toBeDefined(); /* we are playing */

        await act(async () => {
            findButton(container, 'Games Home').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );
        });
        await settle();

        /* Back on the chooser despite the storage failure. */
        expect(findButton(container, 'Start')).toBeDefined();
        unmount();
    });

    it('does not drag the player back into a session it could not delete', async () => {
        /*
         * The resume effect auto-re-enters any session that is not marked
         * complete. If leaving cannot delete the record — or a result write
         * lands after the delete and re-persists it — that effect would pull
         * the player straight back into the game they just left.
         */
        const idb = require('../../hooks/idbUtils.js');
        idb.deleteRecord.mockRejectedValueOnce(new Error('storage gone'));
        /* A stored, incomplete session is exactly what the resume effect looks for. */
        idb.getRecord.mockImplementation(async (store) =>
            store === 'game-sessions'
                ? {
                      key: 'game-session:current',
                      runId: 'r1',
                      gameType: 'arrange_word',
                      langSource: 'mnk',
                      domain: '',
                      words: STORED_WORDS,
                      currentIndex: 0,
                      results: [],
                      xpEarned: 0,
                      startedAt: Date.now(),
                      completedAt: null,
                  }
                : null
        );

        window.fetch = routeFetch();
        const { container, unmount } = mount(baseProps());
        await settle();

        /* The stored session resumes on mount — correct behaviour after a reload. */
        expect(findButton(container, 'Games Home')).toBeDefined();

        await act(async () => {
            findButton(container, 'Games Home').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );
        });
        await settle();
        await settle();

        /* And having LEFT deliberately, they stay left. */
        expect(findButton(container, 'Start')).toBeDefined();
        idb.getRecord.mockResolvedValue(null);
        unmount();
    });
});
