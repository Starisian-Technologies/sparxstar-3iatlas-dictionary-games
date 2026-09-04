/**
 * Learn-loop and scoring tests.
 *
 * Two things are being protected: the approved scoring table, and the invariant
 * that no player can become trapped on a word. Both are asserted as properties
 * rather than examples wherever they can be.
 */

import {
    DEFAULT_MAX_ATTEMPTS,
    MODE,
    OUTCOME,
    XP_BY_OUTCOME,
    attemptsRemaining,
    beginWord,
    currentHintLevel,
    elapsedMs,
    isResolved,
    needsReview,
    recordAnswer,
    resultFor,
    revealAnswer,
    skip,
    startClock,
    takeHint,
    xpFor,
} from '../pedagogy.js';

describe('the approved scoring table', () => {
    it('pays 10 for a first-attempt correct answer', () => {
        const done = recordAnswer(beginWord(), true);
        expect(done.outcome).toBe(OUTCOME.CORRECT);
        expect(resultFor(done).xp).toBe(10);
    });

    it('pays 5 for a correct answer after a retry', () => {
        let a = beginWord();
        a = recordAnswer(a, false);
        a = recordAnswer(a, true);
        expect(a.outcome).toBe(OUTCOME.LEARNING);
        expect(resultFor(a).xp).toBe(5);
    });

    it('pays 5 for a correct answer that needed a hint, even on the first try', () => {
        let a = beginWord();
        a = takeHint(a);
        a = recordAnswer(a, true);
        expect(a.outcome).toBe(OUTCOME.LEARNING);
        expect(resultFor(a).xp).toBe(5);
    });

    it('pays NOTHING when attempts run out', () => {
        /*
         * The defect this replaces: every game reported `learning` on failure,
         * which the engine's manifest scores at +5, while showing the player 0.
         * Failure is `incorrect`, and `incorrect` is worth zero on both sides.
         */
        let a = beginWord({ maxAttempts: 3 });
        a = recordAnswer(a, false);
        a = recordAnswer(a, false);
        a = recordAnswer(a, false);
        expect(a.outcome).toBe(OUTCOME.INCORRECT);
        expect(resultFor(a).xp).toBe(0);
        expect(a.outcome).not.toBe(OUTCOME.LEARNING);
    });

    it('pays nothing for a skip, and does not punish it', () => {
        const a = skip(beginWord());
        expect(a.outcome).toBe(OUTCOME.SKIPPED);
        expect(resultFor(a).xp).toBe(0);
    });

    it('never awards a negative score for any outcome', () => {
        for (const outcome of Object.values(OUTCOME)) {
            expect(xpFor(outcome)).toBeGreaterThanOrEqual(0);
        }
    });

    it('has no streak, multiplier or bonus path — XP is a function of outcome alone', () => {
        /* Ten consecutive correct answers each pay exactly the same. */
        const values = Array.from(
            { length: 10 },
            () => resultFor(recordAnswer(beginWord(), true)).xp
        );
        expect(new Set(values)).toEqual(new Set([10]));
    });

    it('is worth nothing for an outcome it does not recognise, never NaN', () => {
        expect(xpFor('invented')).toBe(0);
        expect(xpFor(undefined)).toBe(0);
    });

    it('mirrors the engine manifest exactly', () => {
        /*
         * The engine is the authority (`src/games/manifests.ts`,
         * dictionaryQuizManifest, NODE-ADR-009): correct 10, learning 5,
         * incorrect 0, skipped 0. This table is a mirror so the number a player
         * sees is the number the ledger will hold. If the engine changes, this
         * changes to match — and this test is what notices.
         */
        expect(XP_BY_OUTCOME).toEqual({ correct: 10, learning: 5, incorrect: 0, skipped: 0 });
    });
});

describe('nobody becomes trapped', () => {
    it('resolves within maxAttempts of wrong answers, whatever the mode', () => {
        for (const mode of Object.values(MODE)) {
            for (const maxAttempts of [1, 2, 3, 5, 8]) {
                let a = beginWord({ maxAttempts, mode });
                for (let i = 0; i < maxAttempts; i += 1) {
                    expect(isResolved(a)).toBe(false);
                    a = recordAnswer(a, false);
                }
                expect(isResolved(a)).toBe(true);
                expect(a.answerShown).toBe(true);
            }
        }
    });

    it('offers Skip in challenge mode too', () => {
        const a = skip(beginWord({ mode: MODE.CHALLENGE }));
        expect(a.outcome).toBe(OUTCOME.SKIPPED);
    });

    it('lets a player reveal the answer without exhausting attempts', () => {
        const a = revealAnswer(beginWord());
        expect(a.answerShown).toBe(true);
        expect(a.outcome).toBe(OUTCOME.INCORRECT);
    });

    it('shows the answer on every resolution path', () => {
        const paths = [
            recordAnswer(beginWord(), true),
            recordAnswer(recordAnswer(recordAnswer(beginWord(), false), false), false),
            skip(beginWord()),
            revealAnswer(beginWord()),
        ];
        for (const a of paths) expect(a.answerShown).toBe(true);
    });

    it('turns a nonsense maxAttempts into a finite one rather than trapping forever', () => {
        /*
         * The invariant is that the word RESOLVES, not that it resolves in one
         * attempt: `NaN` falls back to the default of 3, which is the safer
         * reading of a misconfiguration than silently allowing a single try.
         * What must never happen is `maxAttempts` staying non-finite, because
         * `attemptsUsed >= NaN` is never true and the word can never end.
         */
        for (const bad of [0, -5, 0.4, NaN, undefined, 'three', Infinity]) {
            const started = beginWord({ maxAttempts: bad });
            expect(Number.isFinite(started.maxAttempts)).toBe(true);
            expect(started.maxAttempts).toBeGreaterThanOrEqual(1);

            let a = started;
            for (let i = 0; i < started.maxAttempts; i += 1) a = recordAnswer(a, false);
            expect(isResolved(a)).toBe(true);
        }
    });
});

describe('a resolved word is immutable', () => {
    it('ignores a second answer, so one question reports one result', () => {
        const done = recordAnswer(beginWord(), true);
        expect(recordAnswer(done, false)).toBe(done);
        expect(recordAnswer(done, true)).toBe(done);
        expect(skip(done)).toBe(done);
        expect(takeHint(done)).toBe(done);
        expect(revealAnswer(done)).toBe(done);
    });
});

describe('progressive help', () => {
    it('gets stronger with each attempt', () => {
        let a = beginWord();
        const levels = [currentHintLevel(a)];
        for (let i = 0; i < 2; i += 1) {
            a = recordAnswer(a, false);
            levels.push(currentHintLevel(a));
        }
        expect(levels).toEqual([0, 1, 2]);
        /* Monotonic: help never gets weaker. */
        expect([...levels].sort((x, y) => x - y)).toEqual(levels);
    });

    it('gets stronger when the player asks, not only when they fail', () => {
        const asked = takeHint(beginWord());
        expect(currentHintLevel(asked)).toBeGreaterThan(currentHintLevel(beginWord()));
    });

    it('holds help back one attempt in challenge mode, without removing it', () => {
        let practice = beginWord({ mode: MODE.PRACTICE });
        let challenge = beginWord({ mode: MODE.CHALLENGE });
        practice = recordAnswer(practice, false);
        challenge = recordAnswer(challenge, false);
        expect(currentHintLevel(challenge)).toBeLessThan(currentHintLevel(practice));

        challenge = recordAnswer(challenge, false);
        expect(currentHintLevel(challenge)).toBeGreaterThan(0);
    });
});

describe('the review queue', () => {
    it('takes back every word the player did not get first time', () => {
        expect(needsReview(OUTCOME.LEARNING)).toBe(true);
        expect(needsReview(OUTCOME.INCORRECT)).toBe(true);
        expect(needsReview(OUTCOME.SKIPPED)).toBe(true);
    });

    it('does not take back a word answered correctly first time', () => {
        expect(needsReview(OUTCOME.CORRECT)).toBe(false);
    });

    it('includes outright wrong answers, which the old queue dropped', () => {
        /*
         * `GameShell.handlePracticeMissed` filtered `outcome === 'learning'`
         * only, so a word the player got wrong outright never came back.
         */
        expect(needsReview(OUTCOME.INCORRECT)).toBe(true);
    });
});

describe('reporting', () => {
    it('reports at least one attempt even when skipped immediately', () => {
        expect(resultFor(skip(beginWord())).attempts).toBe(1);
    });

    it('reports the real attempt count, not a hardcoded one', () => {
        /* Three games passed a literal `1` or `3` regardless of what happened. */
        let a = beginWord({ maxAttempts: 5 });
        a = recordAnswer(a, false);
        a = recordAnswer(a, false);
        a = recordAnswer(a, true);
        expect(resultFor(a).attempts).toBe(3);
    });

    it('measures elapsed time from the clock start, and 0 if never started', () => {
        expect(elapsedMs(beginWord(), 5_000)).toBe(0);
        const started = startClock(beginWord(), 1_000);
        expect(elapsedMs(started, 3_500)).toBe(2_500);
    });

    it('never reports negative time when a clock goes backwards', () => {
        const started = startClock(beginWord(), 10_000);
        expect(elapsedMs(started, 9_000)).toBe(0);
    });

    it('counts down attempts remaining', () => {
        const a = beginWord({ maxAttempts: DEFAULT_MAX_ATTEMPTS });
        expect(attemptsRemaining(a)).toBe(DEFAULT_MAX_ATTEMPTS);
        expect(attemptsRemaining(recordAnswer(a, false))).toBe(DEFAULT_MAX_ATTEMPTS - 1);
    });
});
