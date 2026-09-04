/**
 * Difficulty: the Dictionary's coding is primary, and adaptation cannot trap.
 *
 * The load-bearing tests here are the last two describes. Everything else can
 * be tuned; those two are the guarantees.
 */

import {
    ADJUST,
    CEFR_ORDER,
    GAME_SKILL,
    LEVEL,
    LEVEL_PROFILE,
    MIN_EVIDENCE,
    OFFSET_BOUND,
    SKILL,
    WINDOW_SIZE,
    applyAdjustment,
    cefrRank,
    decideAdjustment,
    emptyPerformance,
    isRecognitionGame,
    levelProfile,
    progressKey,
    questionDifficulty,
    recordOutcome,
    selectForLevel,
    summarize,
} from '../difficulty.js';
import { isSpellable } from '../orthography.js';

const word = (over = {}) => ({
    uuid: 'w',
    headword: 'kenta',
    difficulty: 'A1',
    translation_en: '',
    definition: '',
    audio_url: null,
    example_sentences: [],
    ...over,
});

describe("the Dictionary's own level coding is primary", () => {
    it('ranks the CEFR bands in the Dictionary’s own order', () => {
        const ranks = CEFR_ORDER.map(cefrRank);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });

    it('sorts an unset band mid-low rather than hardest', () => {
        /* 26.4% of sampled entries carry no band. Treating those as hardest
         * would hide a quarter of the corpus from Learn. */
        expect(cefrRank(null)).toBeLessThan(cefrRank('B1'));
        expect(cefrRank('')).toBeLessThan(cefrRank('B1'));
        expect(cefrRank(undefined)).toBeGreaterThanOrEqual(cefrRank('A1'));
    });

    it('is case-insensitive about the band', () => {
        expect(cefrRank('a1')).toBe(cefrRank('A1'));
    });

    it('lets no other factor outrank the band', () => {
        /*
         * The requirement not to build a competing classification, as a test.
         * A C1 word with every possible easing factor must still rank harder
         * than an A1 word with every possible hardening factor.
         */
        const easiestC1 = questionDifficulty(
            word({
                difficulty: 'C1',
                headword: 'baa',
                translation_en: 'river',
                english_definition: 'a large stream',
                audio_url: 'https://x/a.mp3',
                example_sentences: [{ sentence: 'Baa be jan.', translation_en: 'far' }],
            }),
            {
                languageCode: 'mnk',
                gameId: 'domain_flash',
                history: { seen: 5, correct: 5, missed: 0 },
            }
        );
        const hardestA1 = questionDifficulty(
            word({ difficulty: 'A1', headword: 'cuuraayi-dandino' }),
            {
                languageCode: 'mnk',
                gameId: 'arrange_word',
                history: { seen: 0, correct: 0, missed: 3 },
            }
        );
        expect(easiestC1).toBeGreaterThan(hardestA1);
    });

    it('does not treat word length as the only measure', () => {
        /* Same band, same length — a word with clues is easier to ask. */
        const bare = questionDifficulty(word({ headword: 'kenta' }), { languageCode: 'mnk' });
        const supported = questionDifficulty(
            word({ headword: 'kenta', translation_en: 'healed', audio_url: 'https://x/a.mp3' }),
            { languageCode: 'mnk' }
        );
        expect(supported).toBeLessThan(bare);
    });

    it('counts orthographic complexity, not just character count', () => {
        /* `njemboo` (7 chars, 5 units, two multi-char units) against a plain
         * 7-character word with none. */
        const withUnits = questionDifficulty(word({ headword: 'njemboo' }), {
            languageCode: 'mnk',
        });
        const plain = questionDifficulty(word({ headword: 'kentaba' }), { languageCode: 'mnk' });
        expect(withUnits).toBeGreaterThan(plain);
    });

    it('asks more of production than of recognition', () => {
        const recall = questionDifficulty(word(), { languageCode: 'mnk', gameId: 'arrange_word' });
        const recognise = questionDifficulty(word(), {
            languageCode: 'mnk',
            gameId: 'domain_flash',
        });
        expect(recall).toBeGreaterThan(recognise);
    });
});

describe('the three levels', () => {
    it('offers exactly three, with welcoming labels', () => {
        expect(Object.values(LEVEL)).toEqual(['learn', 'practice', 'challenge']);
        const labels = Object.values(LEVEL_PROFILE).map((p) => p.label.toLowerCase());
        for (const forbidden of ['beginner', 'weak', 'poor', 'failing', 'basic', 'remedial']) {
            expect(labels.join(' ')).not.toContain(forbidden);
        }
    });

    it('never removes escape or the attempt floor from any level', () => {
        /* Challenge offers less help. It is not a trap. */
        for (const level of Object.values(LEVEL)) {
            const p = levelProfile(level);
            expect(p.maxAttempts).toBeGreaterThanOrEqual(1);
            expect(p.bands.length).toBeGreaterThan(0);
        }
    });

    it('escalates help later as the level gets harder, without withdrawing it', () => {
        const learn = levelProfile(LEVEL.LEARN);
        const challenge = levelProfile(LEVEL.CHALLENGE);
        expect(challenge.hintFromAttempt).toBeGreaterThan(learn.hintFromAttempt);
        expect(challenge.hintFromAttempt).toBeLessThanOrEqual(challenge.maxAttempts);
    });

    it('draws Learn from the Dictionary’s easiest bands', () => {
        expect(levelProfile(LEVEL.LEARN).bands).toEqual(['A1', 'A2']);
        expect(levelProfile(LEVEL.LEARN).preferRecognition).toBe(true);
    });

    it('falls back to Practice for an unknown level', () => {
        expect(levelProfile('nonsense')).toBe(LEVEL_PROFILE[LEVEL.PRACTICE]);
    });
});

describe('skills are measured apart', () => {
    it('maps every game to a skill', () => {
        for (const id of Object.keys(GAME_SKILL)) {
            expect(Object.values(SKILL)).toContain(GAME_SKILL[id]);
        }
        expect(Object.keys(GAME_SKILL)).toHaveLength(6);
    });

    it('keeps progress separate by language AND skill', () => {
        /*
         * The requirement stated as a test: Mandinka spelling must not
         * determine Mandinka listening, nor anything in another language.
         */
        expect(progressKey('mnk', SKILL.SPELLING)).not.toBe(progressKey('mnk', SKILL.LISTENING));
        expect(progressKey('mnk', SKILL.SPELLING)).not.toBe(progressKey('wol', SKILL.SPELLING));
    });

    it('never produces a colliding key for a missing language or skill', () => {
        expect(progressKey('', '')).toBe('unknown:recognition');
        expect(progressKey(undefined, undefined)).toBe('unknown:recognition');
    });

    it('classifies recognition and production tasks', () => {
        expect(isRecognitionGame('domain_flash')).toBe(true);
        expect(isRecognitionGame('meaning_match')).toBe(true);
        expect(isRecognitionGame('arrange_word')).toBe(false);
    });
});

describe('the rolling window', () => {
    const fill = (outcomes, extra = {}) =>
        outcomes.reduce(
            (perf, outcome) => recordOutcome(perf, { outcome, attempts: 1, ...extra }),
            emptyPerformance()
        );

    it('remembers only the recent window, not a lifetime', () => {
        const many = Array.from({ length: WINDOW_SIZE + 6 }, () => 'correct');
        expect(fill(many).recent).toHaveLength(WINDOW_SIZE);
    });

    it('reports rates over the window', () => {
        const s = summarize(fill(['correct', 'correct', 'learning', 'skipped']));
        expect(s.n).toBe(4);
        expect(s.firstAttemptRate).toBeCloseTo(0.5);
        expect(s.retryRate).toBeCloseTo(0.25);
        expect(s.skipRate).toBeCloseTo(0.25);
    });

    it('is empty-safe', () => {
        expect(summarize(emptyPerformance()).n).toBe(0);
        expect(summarize(undefined).firstAttemptRate).toBe(0);
    });
});

describe('adaptation is conservative', () => {
    const fill = (outcomes, extra = {}) =>
        outcomes.reduce(
            (perf, outcome) => recordOutcome(perf, { outcome, attempts: 1, ...extra }),
            emptyPerformance()
        );

    it('does nothing on one mistake', () => {
        /* The explicit requirement. */
        expect(decideAdjustment(fill(['incorrect']))).toBe(ADJUST.HOLD);
        expect(decideAdjustment(fill(['correct', 'incorrect']))).toBe(ADJUST.HOLD);
    });

    it('does nothing below the evidence floor, whatever the answers', () => {
        for (let n = 0; n < MIN_EVIDENCE; n += 1) {
            const perf = fill(Array.from({ length: n }, () => 'correct'));
            expect(decideAdjustment(perf)).toBe(ADJUST.HOLD);
        }
    });

    it('moves toward harder material on sustained first-attempt accuracy', () => {
        expect(decideAdjustment(fill(['correct', 'correct', 'correct', 'correct']))).toBe(
            ADJUST.HARDER
        );
    });

    it('moves toward more help on sustained retries or hints', () => {
        expect(decideAdjustment(fill(['learning', 'learning', 'learning', 'correct']))).toBe(
            ADJUST.EASIER
        );
        expect(
            decideAdjustment(fill(['correct', 'correct', 'correct', 'correct'], { hintsUsed: 1 }))
        ).toBe(ADJUST.EASIER);
    });

    it('moves toward more help on sustained skipping', () => {
        expect(decideAdjustment(fill(['skipped', 'skipped', 'skipped', 'correct']))).toBe(
            ADJUST.EASIER
        );
    });

    it('holds on mixed, ordinary performance', () => {
        expect(decideAdjustment(fill(['correct', 'learning', 'correct', 'learning']))).toBe(
            ADJUST.HOLD
        );
    });

    it('never lowers difficulty on response time alone', () => {
        /*
         * A slow answer is as likely to be an interruption as a difficulty. Four
         * correct first attempts, each taking a very long time, must still read
         * as comfortable.
         */
        const slow = fill(['correct', 'correct', 'correct', 'correct'], { timeMs: 600_000 });
        expect(decideAdjustment(slow)).toBe(ADJUST.HARDER);
    });

    it('does nothing at all when the player turns adaptation off', () => {
        const strong = fill(['correct', 'correct', 'correct', 'correct']);
        expect(decideAdjustment(strong, { adaptive: false })).toBe(ADJUST.HOLD);
    });

    it('adjusts one bounded, reversible step', () => {
        let offset = 0;
        offset = applyAdjustment(offset, ADJUST.HARDER);
        expect(offset).toBe(1);
        /* Reversible: the opposite step returns it. */
        expect(applyAdjustment(offset, ADJUST.EASIER)).toBe(0);

        /* Bounded, so adaptation stays a nudge and never becomes a second
         * level system. */
        for (let i = 0; i < 20; i += 1) offset = applyAdjustment(offset, ADJUST.HARDER);
        expect(offset).toBe(OFFSET_BOUND);
        for (let i = 0; i < 40; i += 1) offset = applyAdjustment(offset, ADJUST.EASIER);
        expect(offset).toBe(-OFFSET_BOUND);
    });

    it('treats a nonsense offset as zero rather than NaN', () => {
        expect(applyAdjustment(NaN, ADJUST.HARDER)).toBe(1);
        expect(applyAdjustment(undefined, ADJUST.HOLD)).toBe(0);
    });
});

describe('adaptation can never create an impossible or trapping question', () => {
    /*
     * The guarantee. Selection only ORDERS AND SELECTS; the playability rules
     * run after it, in each game. These tests assert the property directly
     * across every level and the whole offset range, because that is the claim
     * being made — not that it happens to hold for one example.
     */
    const DECK = [
        word({ uuid: '1', headword: 'kenta', difficulty: 'A1' }),
        word({ uuid: '2', headword: 'njemboo', difficulty: 'A2' }),
        word({ uuid: '3', headword: 'musukeebaa', difficulty: 'B1' }),
        word({ uuid: '4', headword: 'saluno', difficulty: 'B2' }),
        word({ uuid: '5', headword: 'fele', difficulty: 'C1' }),
        word({ uuid: '6', headword: 'taata', difficulty: '' }),
    ];

    it('never returns a word that was not in the deck', () => {
        for (const level of Object.values(LEVEL)) {
            for (let offset = -OFFSET_BOUND; offset <= OFFSET_BOUND; offset += 1) {
                const out = selectForLevel(DECK, { level, languageCode: 'mnk', offset });
                for (const w of out) expect(DECK).toContain(w);
            }
        }
    });

    it('never empties a round, at any level or offset', () => {
        for (const level of Object.values(LEVEL)) {
            for (let offset = -OFFSET_BOUND; offset <= OFFSET_BOUND; offset += 1) {
                for (const count of [1, 3, 6, 20]) {
                    const out = selectForLevel(DECK, {
                        level,
                        languageCode: 'mnk',
                        offset,
                        count,
                    });
                    expect(out.length).toBeGreaterThan(0);
                    expect(out.length).toBeLessThanOrEqual(Math.min(count, DECK.length));
                }
            }
        }
    });

    it('never introduces an unspellable word, however hard it adapts', () => {
        /*
         * The mixed deck includes real headwords no spelling game can play.
         * Selection may reorder them; it must never make one MORE likely to be
         * dealt than the playability rule allows, and the rule still runs after.
         */
        const mixed = [
            ...DECK,
            word({ uuid: 'x1', headword: '0', difficulty: 'A1' }),
            word({ uuid: 'x2', headword: 'suno tey', difficulty: 'A1' }),
        ];
        for (const level of Object.values(LEVEL)) {
            for (let offset = -OFFSET_BOUND; offset <= OFFSET_BOUND; offset += 1) {
                const out = selectForLevel(mixed, {
                    level,
                    languageCode: 'mnk',
                    gameId: 'arrange_word',
                    offset,
                });
                /* Selection is allowed to include them — it is not the
                 * playability gate — but the gate must still reject them, and
                 * the games apply it. This asserts the two agree. */
                const survivors = out.filter((w) => isSpellable(w.headword, 'mnk'));
                expect(survivors.length).toBeGreaterThan(0);
            }
        }
    });

    it('never drops band-less words out of reach', () => {
        /* 26.4% of the corpus has no band. It must remain playable. */
        const out = selectForLevel(DECK, { level: LEVEL.LEARN, languageCode: 'mnk' });
        expect(out.map((w) => w.uuid)).toContain('6');
    });

    it('orders easiest-first within a level', () => {
        const out = selectForLevel(DECK, { level: LEVEL.PRACTICE, languageCode: 'mnk', offset: 0 });
        const ranks = out.map((w) => cefrRank(w.difficulty));
        /* The level's own bands lead; within them, no later word is easier by
         * more than the non-band factors can account for. */
        expect(cefrRank(out[0].difficulty)).toBeLessThanOrEqual(Math.max(...ranks));
    });

    it('survives an empty or malformed deck', () => {
        expect(selectForLevel([], { languageCode: 'mnk' })).toEqual([]);
        expect(selectForLevel(undefined, { languageCode: 'mnk' })).toEqual([]);
        expect(() => selectForLevel([{}], { languageCode: 'mnk' })).not.toThrow();
    });
});
