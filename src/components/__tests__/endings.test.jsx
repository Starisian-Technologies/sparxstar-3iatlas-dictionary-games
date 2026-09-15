/**
 * Three endings, and they are not the same ending.
 *
 * ===================== WHAT SHIPPED =============================
 *
 * Every finished round rendered the same gold trophy, the same confetti and
 * the same "Session complete!". A player who answered nothing correctly and
 * earned zero XP was congratulated in exactly the words, and with exactly the
 * fanfare, of a player who got everything right.
 *
 * That is not kindness. It tells the learner the app is not watching, and it
 * spends the celebration on rounds that did not earn it, so there is nothing
 * left to mark the rounds that did.
 *
 * These tests assert the DIFFERENCE — that a win looks like a win, a mixed
 * round looks like progress, and a hard round is quiet and points at the way
 * back — rather than asserting one particular design.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SessionComplete from '../SessionComplete.jsx';
import { RESULT, gradeSession, longestStreak, resultMessage } from '../../results.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sessionOf = (outcomes, gameType = 'arrange_word') => ({
    gameType,
    words: outcomes.map((_, i) => ({ uuid: `w${i}` })),
    results: outcomes.map((outcome, i) => ({
        wordUuid: `w${i}`,
        outcome,
        xp: outcome === 'correct' ? 10 : outcome === 'learning' ? 5 : 0,
    })),
    xpEarned: outcomes.reduce(
        (sum, o) => sum + (o === 'correct' ? 10 : o === 'learning' ? 5 : 0),
        0
    ),
});

function render(session) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
        root.render(
            <SessionComplete
                session={session}
                learnedCount={3}
                onPracticeMissed={jest.fn()}
                onPlayAgain={jest.fn()}
                onChooseAnother={jest.fn()}
                onHome={jest.fn()}
            />
        )
    );
    return {
        host,
        text: host.textContent,
        html: host.innerHTML,
        buttons: Array.from(host.querySelectorAll('button')).map((b) => b.textContent.trim()),
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

const perfect = sessionOf(['correct', 'correct', 'correct', 'correct']);
const strong = sessionOf(['correct', 'correct', 'correct', 'learning']);
const partial = sessionOf(['correct', 'correct', 'learning', 'incorrect']);
const practice = sessionOf(['incorrect', 'skipped', 'learning', 'incorrect']);

describe('the grade comes from the recorded results', () => {
    it('sorts each round into its own tier', () => {
        expect(gradeSession(perfect).tier).toBe(RESULT.PERFECT);
        expect(gradeSession(strong).tier).toBe(RESULT.STRONG);
        expect(gradeSession(partial).tier).toBe(RESULT.PARTIAL);
        expect(gradeSession(practice).tier).toBe(RESULT.PRACTICE);
    });

    it('treats a round with no answers as one to practise, never as a win', () => {
        expect(gradeSession(sessionOf([])).tier).toBe(RESULT.PRACTICE);
    });

    it('counts the longest run of correct answers, not the last one', () => {
        expect(longestStreak([])).toBe(0);
        expect(
            longestStreak(
                ['correct', 'correct', 'incorrect', 'correct'].map((outcome) => ({ outcome }))
            )
        ).toBe(2);
    });

    it('never reports more reviewing than it has non-correct results', () => {
        const grade = gradeSession(partial);
        expect(grade.reviewing).toBe(grade.learning + grade.incorrect + grade.skipped);
        expect(grade.correct + grade.reviewing).toBe(grade.answered);
    });
});

describe('a round that went well is celebrated', () => {
    it('names what was achieved', () => {
        const { text, unmount } = render(strong);
        expect(text).toContain('Excellent work!');
        expect(text).toContain('3 words');
        unmount();
    });

    it('gives a perfect round the biggest treatment of all', () => {
        const win = render(strong);
        const flawless = render(perfect);
        expect(flawless.text).toContain('Perfect round!');
        /* Different mark, so the two wins are told apart at a glance. */
        expect(flawless.text).not.toBe(win.text);
        win.unmount();
        flawless.unmount();
    });

    it('leads with playing again, not with practice', () => {
        const { buttons, unmount } = render(strong);
        expect(buttons[0]).toContain('Play again');
        unmount();
    });
});

describe('a mixed round is encouraged, not celebrated', () => {
    it('names the progress AND what is ready to practise', () => {
        const { text, unmount } = render(partial);
        expect(text).toContain('Good progress.');
        expect(text).toContain('ready to practise');
        unmount();
    });

    it('makes practice the obvious next action', () => {
        const { buttons, unmount } = render(partial);
        expect(buttons[0]).toContain('Practise these words');
        unmount();
    });
});

describe('a hard round is quiet, and never shames the learner', () => {
    it('says the ROUND was tough, not the player', () => {
        const { text, unmount } = render(practice);
        expect(text).toContain('That was a tough round.');
        /* Nothing that grades the person. */
        for (const word of ['failed', 'Failed', 'wrong', 'poor', 'bad', 'try harder']) {
            expect(text).not.toContain(word);
        }
        unmount();
    });

    it('does not show the trophy a win shows', () => {
        const won = render(strong);
        const hard = render(practice);
        expect(won.text).toContain('🏆');
        expect(hard.text).not.toContain('🏆');
        expect(hard.text).not.toContain('🌟');
        won.unmount();
        hard.unmount();
    });

    it('runs no confetti', () => {
        /* `Celebration` renders its canvas only when active. A round that
         * needs practice must not get one. */
        const won = render(perfect);
        const hard = render(practice);
        expect(won.host.querySelector('canvas')).not.toBeNull();
        expect(hard.host.querySelector('canvas')).toBeNull();
        won.unmount();
        hard.unmount();
    });

    it('gives one strong way back', () => {
        const { buttons, unmount } = render(practice);
        expect(buttons[0]).toContain('Practise these words');
        expect(buttons[0]).toContain('(4)');
        unmount();
    });
});

describe('every ending still reads as a different screen', () => {
    it('gives four distinct headlines', () => {
        const headlines = [perfect, strong, partial, practice].map(
            (session) => resultMessage(gradeSession(session)).headline
        );
        expect(new Set(headlines).size).toBe(4);
    });

    it('never says "Session complete!" to anyone', () => {
        for (const session of [perfect, strong, partial, practice]) {
            const { text, unmount } = render(session);
            expect(text).not.toContain('Session complete');
            unmount();
        }
    });
});

describe('the client never reports an award it invented', () => {
    /*
     * INV-016 (Accepted 2026-09-05, binding platform-wide): "No client may
     * originate, compute, or infer earned value… It may never derive the award
     * itself from round performance… or answer counts."
     *
     * The completion screen showed "Points earned +N", counted up from
     * `session.xpEarned` — accumulated on this device from `xpFor(outcome)`,
     * with no ledger row and no settlement identifier behind it.
     */
    it('shows no points figure on any ending', () => {
        for (const session of [perfect, strong, partial, practice]) {
            const { text, unmount } = render(session);
            expect(text).not.toMatch(/points/i);
            expect(text).not.toMatch(/\bXP\b/);
            unmount();
        }
    });

    it('does not put a zero in its place either', () => {
        /*
         * The same invariant: absence of a settlement is not evidence of no
         * awards, so "0 points" would be a claim about the ledger this screen
         * cannot make.
         */
        const { text, unmount } = render(practice);
        expect(text).not.toMatch(/\+0/);
        unmount();
    });

    it('still reports what it legitimately watched happen', () => {
        /* Counts of answers are facts about the round, not awards. */
        const { text, unmount } = render(partial);
        expect(text).toContain('2 / 4');
        expect(text).toMatch(/questions answered/i);
        unmount();
    });
});

describe('a round with nothing to practise offers something that works', () => {
    it('does not label the primary action "Practise these words" with no words', () => {
        /*
         * An unanswered round grades as PRACTICE with `reviewing === 0`, and the
         * screen falls back to `onPlayAgain` — so the button said one thing and
         * did another, with nothing to practise either way.
         */
        const emptyRound = sessionOf([]);
        const { buttons, unmount } = render(emptyRound);
        expect(buttons[0]).toContain('Play again');
        expect(buttons[0]).not.toContain('Practise');
        unmount();
    });
});
