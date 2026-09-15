/**
 * GameShell — the session is the length the player chose.
 *
 * The unit tests in `src/__tests__/session.length.test.js` prove the SELECTOR
 * honours the count. They cannot prove the shell asks it for the right one,
 * passes it the right candidates, or shows the player anything when the corpus
 * falls short — and the shell is where all three went wrong:
 *
 *   - the deck was dealt from the raw pack, then each game re-filtered it at
 *     play time, so a ten-word round became however many words survived;
 *   - a round shorter than the one asked for simply started;
 *   - a game with nothing to play announced that AFTER Start, as
 *     "No words are available for this game yet".
 *
 * So this suite drives the real shell and reads the real session it persists.
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

/**
 * Forty playable Mandinka-shaped words — enough for the longest session.
 *
 * Built from real orthographic units so the segmenter and the literacy bands
 * see what they would see in production. Lengths are spread across the bands
 * on purpose: a corpus that is all one length cannot show that widening
 * reaches for the shortest words first.
 */
const STEMS = ['kaŋ', 'saŋ', 'baŋ', 'faŋ', 'taŋ', 'maŋ', 'jaŋ', 'naŋ'];
const WORDS = Array.from({ length: 40 }, (_, i) => ({
    entry_id: `w${i}`,
    header_word: i < 8 ? STEMS[i] : `${STEMS[i % 8]}${'a'.repeat(1 + (i % 3))}`,
    english_lemma: `meaning ${i}`,
    ipa_pronunciation: 'x',
    difficulty: 'A1',
    domain_code: '1.1',
    part_of_speech: 'n',
    audio_url: 'https://audio.example.test/w.mp3',
    example: { sentence: `${i < 8 ? STEMS[i] : STEMS[i % 8]} sentence`, translation_en: 'x' },
}));

function routeFetch(words = WORDS) {
    return jest.fn(async (url) => {
        const u = String(url);
        if (u.includes('/domains')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ ok: true, data: { domains: [] } }),
            };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { words } }) };
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
            container.remove();
        },
    };
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

const findButton = (container, text) =>
    Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.trim().includes(text)
    );

/**
 * The 10/20/30 chips.
 *
 * Matched on the trailing number rather than on the whole label: a selected
 * chip also carries a tick, because selection must not be communicated by
 * colour alone. Anchored at the end so "10" never matches "100".
 */
const findChip = (container, label) =>
    Array.from(container.querySelectorAll('button')).find((b) =>
        new RegExp(`(^|\\s)${label}$`).test(b.textContent.trim())
    );

function baseProps(overrides = {}) {
    return {
        bffPath: BFF,
        language: 'en',
        sourceLanguage: 'mnk',
        languages: [{ slug: 'mnk', name: 'Mandinka' }],
        onSourceLanguage: () => {},
        onHome: () => {},
        ...overrides,
    };
}

const click = async (el) => {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
};

/** The words the shell actually persisted as this session's deck. */
function persistedDeck() {
    const { putRecord } = require('../../hooks/idbUtils.js');
    const call = [...putRecord.mock.calls]
        .reverse()
        .find(([store, record]) => store === 'game-sessions' && Array.isArray(record?.words));
    return call ? call[1].words : null;
}

afterEach(() => {
    delete window.fetch;
    jest.clearAllMocks();
});

describe('the session is as long as the player asked', () => {
    it.each([
        ['10', 10],
        ['20', 20],
        ['30', 30],
    ])('choosing %s deals %i questions', async (label, count) => {
        window.fetch = routeFetch();
        const { container, unmount } = mount(baseProps());
        await settle();

        await click(findChip(container, label));
        await click(findButton(container, 'Start'));

        /* No shortfall notice: forty playable words can fill any of the three. */
        expect(container.textContent).not.toContain('This round will be');

        const deck = persistedDeck();
        expect(deck).not.toBeNull();
        expect(deck).toHaveLength(count);
        /* And no word twice — a round padded by repetition is not a round. */
        expect(new Set(deck.map((w) => w.uuid)).size).toBe(count);
        unmount();
    });
});

describe('a round the corpus cannot fill is explained, not started', () => {
    it('names the real length and waits for the player', async () => {
        window.fetch = routeFetch(WORDS.slice(0, 6));
        const { container, unmount } = mount(baseProps());
        await settle();

        await click(findChip(container, '20'));
        await click(findButton(container, 'Start'));

        /* Still on setup, with the real number in front of the player. */
        expect(container.textContent).toContain('This round will be 6 words, not 20');
        expect(findButton(container, 'Restart')).toBeUndefined();
        expect(persistedDeck()).toBeNull();

        /* Taking the offer starts exactly that round. */
        await click(findButton(container, 'Play 6 words'));
        expect(persistedDeck()).toHaveLength(6);
        unmount();
    });

    it('lets the player back out with every other choice intact', async () => {
        window.fetch = routeFetch(WORDS.slice(0, 6));
        const { container, unmount } = mount(baseProps());
        await settle();

        await click(findChip(container, '30'));
        await click(findButton(container, 'Start'));
        await click(findButton(container, 'Choose something else'));

        expect(container.textContent).not.toContain('This round will be');
        expect(persistedDeck()).toBeNull();
        /* The length they picked is still picked — asserted on the state the
         * control reports, not on its colour. */
        expect(findChip(container, '30').getAttribute('aria-pressed')).toBe('true');
        unmount();
    });
});

describe('a game that cannot be played is not offered', () => {
    it('disables it with the reason, before Start', async () => {
        /* No audio anywhere — `listen_write` is unplayable, the rest are fine. */
        const noAudio = WORDS.map(({ audio_url: _drop, ...rest }) => rest);
        window.fetch = routeFetch(noAudio);
        const { container, unmount } = mount(baseProps());
        await settle();

        const listen = findButton(container, 'Listen & Write');
        expect(listen.disabled).toBe(true);
        expect(listen.textContent).toContain('needs recorded audio');

        /* And the games that CAN run are still offered — the refusal is per
         * game, not a blanket failure. */
        expect(findButton(container, 'Arrange the Word').disabled).toBe(false);
        unmount();
    });

    it('does not strand the player on a dead default', async () => {
        const noAudio = WORDS.map(({ audio_url: _drop, ...rest }) => rest);
        window.fetch = routeFetch(noAudio);
        const { container, unmount } = mount(baseProps());
        await settle();

        /* Start must never be the control that discovers the problem. */
        const start = findButton(container, 'Start');
        expect(start.disabled).toBe(false);
        await click(start);
        expect(container.textContent).not.toContain('No words are available');
        unmount();
    });
});
