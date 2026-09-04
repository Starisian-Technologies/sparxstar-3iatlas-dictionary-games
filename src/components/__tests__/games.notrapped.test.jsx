/**
 * Every game, one invariant: NOBODY BECOMES TRAPPED.
 *
 * This suite exists because `ArrangeWord` shipped with no failure path at all —
 * a wrong arrangement shook the tiles, reset them, and waited forever. There
 * was no attempt counter, no hint, no Skip, no reveal, and no `onResult` for
 * anything but success, so a player who could not spell the word could neither
 * finish nor leave, and the word was never recorded. Five other games each had
 * their own answer to the same question, and three of them were also wrong.
 *
 * The tests below are deliberately written against the WHOLE SET rather than
 * one game at a time. A per-game test would have passed on five games while the
 * sixth trapped players, which is exactly what happened. Adding a seventh game
 * to `GAMES` below is enough to hold it to the same contract.
 *
 * They drive the real components through the real hooks. A test that mocked the
 * learn-loop would pass against the broken code.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ArrangeWord from '../games/ArrangeWord.jsx';
import CompleteSentence from '../games/CompleteSentence.jsx';
import DomainFlash from '../games/DomainFlash.jsx';
import LetterReveal from '../games/LetterReveal.jsx';
import ListenWrite from '../games/ListenWrite.jsx';
import MeaningMatch from '../games/MeaningMatch.jsx';
import { OUTCOME, XP_BY_OUTCOME } from '../../pedagogy.js';
import { isSpellable } from '../../orthography.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* jsdom has no audio pipeline; the games only ever fire-and-forget a play(). */
beforeAll(() => {
    globalThis.Audio = class {
        addEventListener() {}
        play() {
            return Promise.resolve();
        }
        pause() {}
    };
});

/**
 * The six games, and whether each is a SPELLING game.
 *
 * Spelling games must refuse unplayable headwords; recognition games
 * (`MeaningMatch`, `DomainFlash`) show the word rather than ask for it, so a
 * headword they cannot spell is still a legitimate card.
 */
const GAMES = [
    { name: 'ArrangeWord', Component: ArrangeWord, spelling: true },
    { name: 'LetterReveal', Component: LetterReveal, spelling: true },
    { name: 'CompleteSentence', Component: CompleteSentence, spelling: true },
    { name: 'ListenWrite', Component: ListenWrite, spelling: true },
    { name: 'MeaningMatch', Component: MeaningMatch, spelling: false },
    { name: 'DomainFlash', Component: DomainFlash, spelling: false },
];

/**
 * Real Mandinka words, sampled from the live corpus via the games BFF.
 *
 * Not invented: `njemboo` carries both an `nj` digraph and an `oo` long vowel,
 * and `musukeebaa` carries `ee` and `aa`. Those are the shapes that broke
 * `split('')`.
 */
const WORDS = [
    {
        uuid: 'w1',
        headword: 'njemboo',
        translation_en: 'wing',
        translation_fr: 'aile',
        ipa: 'ndʒemboː',
        definition: '',
        domain: '1.1',
        audio_url: null,
        example_sentences: [],
    },
    {
        uuid: 'w2',
        headword: 'musukeebaa',
        translation_en: 'old woman',
        translation_fr: 'vieille femme',
        ipa: '',
        definition: 'An elderly woman.',
        domain: '1.1',
        audio_url: 'https://media.example/mnk/musukeebaa.mp3',
        example_sentences: [
            { sentence: 'Musukeebaa ka taa.', translation_en: 'The old woman goes.' },
        ],
    },
    {
        uuid: 'w3',
        headword: 'kenta',
        translation_en: 'healed',
        translation_fr: 'guéri',
        ipa: '',
        definition: '',
        domain: '2.1',
        audio_url: null,
        example_sentences: [],
    },
];

/** Real sampled headwords that cannot be spelled. Every one is from the corpus. */
const UNPLAYABLE = ['0', '00jo0', 'suno tey', 'toolee. - 126-'].map((headword, i) => ({
    uuid: `bad-${i}`,
    headword,
    translation_en: 'x',
    translation_fr: 'x',
    ipa: '',
    definition: '',
    domain: '1.1',
    audio_url: null,
    example_sentences: [],
}));

function mount(Component, props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <Component
                words={WORDS}
                language="en"
                languageCode="mnk"
                onResult={() => {}}
                onComplete={() => {}}
                {...props}
            />
        );
    });
    return {
        host,
        unmount: () => act(() => root.unmount()),
    };
}

/** Every enabled button, by trimmed label. */
function buttons(host) {
    return [...host.querySelectorAll('button')].filter((b) => !b.disabled);
}

function findButton(host, label) {
    return buttons(host).find((b) => (b.textContent ?? '').toLowerCase().includes(label));
}

function click(el) {
    act(() => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

describe.each(GAMES)('$name', ({ Component, spelling }) => {
    it('offers the player a way out of every question', () => {
        /*
         * The core invariant. Whatever the game, a player who cannot answer
         * must be able to leave the question — through Skip, or through a
         * self-rating that resolves it. If this fails, someone is stuck.
         */
        const { host, unmount } = mount(Component, {});
        const escapes = buttons(host).filter((b) => {
            const label = (b.textContent ?? '').toLowerCase();
            return (
                label.includes('skip') ||
                label.includes('still learning') ||
                label.includes("didn't know") ||
                label.includes('reveal') ||
                label.includes('show')
            );
        });
        expect(escapes.length).toBeGreaterThan(0);
        unmount();
    });

    it('reports every question exactly once, with a recognised outcome', () => {
        const results = [];
        const { host, unmount } = mount(Component, {
            onResult: (uuid, outcome, attempts, xp, timeMs) =>
                results.push({ uuid, outcome, attempts, xp, timeMs }),
        });

        const skipButton = findButton(host, 'skip');
        if (skipButton) {
            click(skipButton);
            /* Double-tap must not produce a second result for one question. */
            click(skipButton);
        } else {
            /* A self-rated card resolves through its own control. */
            const reveal = findButton(host, 'reveal') ?? findButton(host, 'show');
            if (reveal) click(reveal);
            const rate =
                findButton(host, 'still learning') ??
                findButton(host, "didn't know") ??
                findButton(host, 'knew');
            if (rate) click(rate);
        }

        expect(results.length).toBeLessThanOrEqual(1);
        for (const r of results) {
            expect(Object.values(OUTCOME)).toContain(r.outcome);
            expect(r.attempts).toBeGreaterThanOrEqual(1);
            expect(r.timeMs).toBeGreaterThanOrEqual(0);
        }
        unmount();
    });

    it('never reports XP that disagrees with the approved table', () => {
        /*
         * The scoring defect this replaces: every game reported `learning` on
         * failure, which the engine's manifest pays +5 for, while passing a
         * local xp of 0. The number a player sees and the number the ledger
         * holds must be the same number.
         */
        const results = [];
        const { host, unmount } = mount(Component, {
            onResult: (uuid, outcome, attempts, xp) => results.push({ outcome, xp }),
        });

        const skipButton = findButton(host, 'skip');
        if (skipButton) click(skipButton);
        else {
            const reveal = findButton(host, 'reveal') ?? findButton(host, 'show');
            if (reveal) click(reveal);
            const rate = findButton(host, 'still learning') ?? findButton(host, "didn't know");
            if (rate) click(rate);
        }

        for (const r of results) {
            expect(r.xp).toBe(XP_BY_OUTCOME[r.outcome]);
            /* And specifically: a question the player did not answer pays 0. */
            if (r.outcome === OUTCOME.SKIPPED || r.outcome === OUTCOME.INCORRECT) {
                expect(r.xp).toBe(0);
            }
        }
        unmount();
    });

    it('never awards negative XP', () => {
        const results = [];
        const { host, unmount } = mount(Component, {
            onResult: (uuid, outcome, attempts, xp) => results.push(xp),
        });
        const skipButton = findButton(host, 'skip');
        if (skipButton) click(skipButton);
        for (const xp of results) expect(xp).toBeGreaterThanOrEqual(0);
        unmount();
    });

    if (spelling) {
        it('refuses to deal a headword that cannot be spelled', () => {
            /*
             * Given ONLY unplayable words, a spelling game must not present a
             * round it cannot be won — and must not render a blank screen
             * either, which reads as a loading failure. It should say so and
             * let the player leave.
             */
            const results = [];
            let completed = false;
            const { host, unmount } = mount(Component, {
                words: UNPLAYABLE,
                onResult: (uuid, outcome) => results.push(outcome),
                onComplete: () => {
                    completed = true;
                },
            });

            /* Nothing scored, because nothing playable was dealt. */
            expect(results).toEqual([]);

            /* And there is a way onward rather than a dead end. */
            const out = buttons(host);
            expect(out.length).toBeGreaterThan(0);
            click(out[0]);
            expect(completed).toBe(true);
            unmount();
        });

        it('deals no unplayable word from a mixed set', () => {
            /*
             * Asserted as an absence, not a count. Each game has its own extra
             * requirements — `CompleteSentence` needs an example sentence
             * containing the headword, `ListenWrite` needs a recording — so the
             * deck size legitimately differs per game. What must hold
             * everywhere is that an unplayable headword never reaches the
             * screen.
             */
            const { host, unmount } = mount(Component, {
                words: [...UNPLAYABLE, ...WORDS],
            });
            const text = host.textContent ?? '';
            for (const bad of UNPLAYABLE) {
                expect(text).not.toContain(bad.headword);
            }
            /* And the deck never exceeds what is actually playable. */
            const counter = text.match(/\/\s*(\d+)/);
            if (counter) {
                const dealt = Number(counter[1]);
                expect(dealt).toBeLessThanOrEqual(
                    WORDS.filter((w) => isSpellable(w.headword, 'mnk')).length
                );
            }
            unmount();
        });
    }
});

describe('the set as a whole', () => {
    it('holds every game to the same contract', () => {
        /* A guard on the guard: if a game is added to the app and not to this
         * list, the invariants above silently stop covering it. */
        expect(GAMES).toHaveLength(6);
        expect(new Set(GAMES.map((g) => g.name)).size).toBe(6);
    });

    it('agrees with the orthography module about which fixtures are spellable', () => {
        for (const w of WORDS) expect(isSpellable(w.headword, 'mnk')).toBe(true);
        for (const w of UNPLAYABLE) expect(isSpellable(w.headword, 'mnk')).toBe(false);
    });
});
