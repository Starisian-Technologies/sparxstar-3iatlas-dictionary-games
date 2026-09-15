/**
 * The difficulty of the question on screen does not change under the player.
 *
 * ===================== WHAT SHIPPED =============================
 *
 * The transparency strip under the nav says, in the app's own voice:
 *
 *     Hints change now. Difficulty changes next game.
 *
 * It was not true. `mode` was computed inline in the render from the live
 * `playerLevel`, and `ListenWrite`, `CompleteSentence` and `LetterReveal` read
 * that prop while resolving the CURRENT word. Tapping Challenge halfway
 * through a question cut the retry and reveal budget of the question already
 * on screen — a promise broken, and a difficulty change nobody asked for in
 * the middle of an answer.
 *
 * This suite reads the mode the game component is actually handed, because
 * that is the only thing the games can respond to.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../hooks/idbUtils.js', () => ({
    openDB: jest.fn(async () => null),
    getRecord: jest.fn(async () => null),
    putRecord: jest.fn(async () => undefined),
    deleteRecord: jest.fn(async () => undefined),
    getAllRecords: jest.fn(async () => []),
    clearStore: jest.fn(async () => undefined),
}));

/**
 * Every mode the shell handed a game, in order.
 *
 * `mock`-prefixed because `jest.mock` is hoisted above the imports and its
 * factory may only close over names spelled that way.
 */
const mockModes = [];

/*
 * A stand-in for the real game. It records the `mode` prop on every render and
 * exposes one button that reports the word it is on — enough to advance a
 * question without depending on any one game's interaction model.
 */
jest.mock('../games/LetterReveal.jsx', () => ({
    __esModule: true,
    default: ({ words, mode, onResult }) => {
        mockModes.push(mode);
        /* `onResult(uuid, outcome, attempts, xp, timeMs)` — the shell's real
         * signature, and it takes the word's uuid, not the word. */
        return require('react').createElement(
            'button',
            {
                type: 'button',
                'data-testid': 'answer',
                onClick: () => onResult(words[0]?.uuid, 'correct', 1, 10, 500),
            },
            'answer'
        );
    },
}));

import GameShell from '../GameShell.jsx';

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

const routeFetch = () =>
    jest.fn(async (url) => {
        if (String(url).includes('/domains')) {
            return { ok: true, status: 200, json: async () => ({ ok: true, data: { domains: [] } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { words: WORDS } }) };
    });

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

const buttons = (container) => Array.from(container.querySelectorAll('button'));
const byText = (container, text) =>
    buttons(container).find((b) => b.textContent.trim().includes(text));
const chip = (container, label) =>
    buttons(container).find((b) => new RegExp(`(^|\\s)${label}$`).test(b.textContent.trim()));

const click = async (el) => {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
};

function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
        root.render(
            <GameShell
                bffPath="/api/dictionary"
                language="en"
                sourceLanguage="mnk"
                languages={[{ slug: 'mnk', name: 'Mandinka' }]}
                onSourceLanguage={() => {}}
                onHome={() => {}}
            />
        )
    );
    return {
        container,
        unmount: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

/**
 * A learner past the calibration runway, with settled literacy.
 *
 * Without this the shell is right to ignore the Challenge control entirely:
 * `opensWithSupport(STAGE.RUNWAY)` forces PRACTICE for a learner's first five
 * questions, and both overrides only ever push difficulty DOWN. A fresh
 * profile therefore cannot show whether the level reaches the next question,
 * because the level never wins in the first place.
 *
 * `letter_reveal` exercises SPELLING, so that is the key the shell reads.
 */
function seedSettledLearner() {
    window.localStorage.setItem(
        'aiwa-dict-calibration',
        JSON.stringify({ 'mnk:spelling': { answered: 20, complete: true } })
    );
    window.localStorage.removeItem('aiwa-dict-literacy');
}

beforeEach(seedSettledLearner);

afterEach(() => {
    delete window.fetch;
    mockModes.length = 0;
    window.localStorage.clear();
    jest.clearAllMocks();
});

/** Start a ten-word Letter Reveal round. */
async function startRound(container) {
    await click(byText(container, 'Letter Reveal'));
    await click(chip(container, '10'));
    await click(byText(container, 'Start'));
}

describe('a level change mid-question does not reach the current question', () => {
    it('keeps the mode the question started with', async () => {
        window.fetch = routeFetch();
        const { container, unmount } = mount();
        await settle();
        await startRound(container);

        expect(mockModes.length).toBeGreaterThan(0);
        const modeAtStart = mockModes.at(-1);

        /* The in-play strip's Challenge control, with the question still up. */
        const challenge = buttons(container).find(
            (b) => /challenge/i.test(b.textContent) && b.getAttribute('aria-pressed') === 'false'
        );
        expect(challenge).toBeDefined();
        const before = mockModes.length;
        await click(challenge);

        /* It re-rendered — so the assertion below is about the value, not about
         * nothing having happened. */
        expect(mockModes.length).toBeGreaterThan(before);
        expect(mockModes.at(-1)).toBe(modeAtStart);
        unmount();
    });

    it('applies the new level from the next question onwards', async () => {
        /* The other half of the promise: deferring must not mean ignoring. */
        window.fetch = routeFetch();
        const { container, unmount } = mount();
        await settle();
        await startRound(container);

        const challenge = buttons(container).find(
            (b) => /challenge/i.test(b.textContent) && b.getAttribute('aria-pressed') === 'false'
        );
        await click(challenge);
        const heldMode = mockModes.at(-1);

        await click(container.querySelector('[data-testid="answer"]'));

        expect(mockModes.at(-1)).not.toBe(heldMode);
        unmount();
    });
});
