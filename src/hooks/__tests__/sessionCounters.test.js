/**
 * The counters and the score come from ONE session state, and cannot overrun.
 *
 * ====================== WHAT SHIPPED ============================
 *
 * A two-word round displayed "3 / 2" in the game header. Two separate causes,
 * both of which had to be fixed for the display to be trustworthy:
 *
 *   the display   the header divided `session.currentIndex + 1` — an absolute
 *                 position — by `gameWords.length`, the deck CURRENTLY being
 *                 played. A resumed session is handed only the words that
 *                 remain, so those two numbers were not measuring the same
 *                 round. `GameShell` now derives both from `session`.
 *
 *   the state     nothing stopped one question being recorded twice. A
 *                 double-tap, or the reveal's Finish landing on top of an
 *                 auto-advance, pushed a second result, advanced the index a
 *                 second time and added its XP a second time. So the round
 *                 genuinely believed it had answered three of two questions,
 *                 and had genuinely paid for three.
 *
 * This suite pins the state half — the arithmetic every display depends on.
 */
import { act } from 'react';
import { renderHook } from '../../testUtils/renderHook.js';
import { useGameSession } from '../useGameSession.js';

jest.mock('../idbUtils.js', () => ({
    openDB: jest.fn(async () => null),
    getRecord: jest.fn(async () => null),
    putRecord: jest.fn(async () => undefined),
    deleteRecord: jest.fn(async () => undefined),
    getAllRecords: jest.fn(async () => []),
    clearStore: jest.fn(async () => undefined),
}));

const WORDS = [
    { uuid: 'w1', headword: 'kaŋ' },
    { uuid: 'w2', headword: 'saŋ' },
];

async function startedSession() {
    const hook = renderHook(() => useGameSession());
    await act(async () => {
        await hook.result.current.initSession({
            gameType: 'letter_reveal',
            langSource: 'mnk',
            domain: '',
            level: 'learn',
            words: WORDS,
        });
    });
    return hook;
}

/** The invariant every screen depends on, asserted as one function. */
function expectReconciled(session) {
    const results = session.results ?? [];
    /* The position never passes the end of the deck. */
    expect(session.currentIndex).toBeLessThanOrEqual(session.words.length);
    /* One result per answered question, and never two for one word. */
    expect(results).toHaveLength(session.currentIndex);
    expect(new Set(results.map((r) => r.wordUuid)).size).toBe(results.length);
    /* The score IS the sum of the recorded awards — not a parallel tally. */
    expect(session.xpEarned).toBe(results.reduce((sum, r) => sum + r.xp, 0));
}

describe('a question can be completed only once', () => {
    it('ignores a repeated result for the same word', async () => {
        const hook = await startedSession();
        await act(async () => {
            await hook.result.current.recordResult('w1', 'correct', 1, 10, 500);
        });
        await act(async () => {
            await hook.result.current.recordResult('w1', 'correct', 1, 10, 500);
        });

        const session = hook.result.current.session;
        expect(session.currentIndex).toBe(1);
        expect(session.xpEarned).toBe(10);
        expectReconciled(session);
    });

    it('survives a double-tap that lands before React re-renders', async () => {
        /*
         * The real shape of the bug: both calls read the same `sessionRef`
         * because neither has awaited yet. Serialising them orders the writes;
         * only the guard makes the second one harmless.
         */
        const hook = await startedSession();
        await act(async () => {
            await Promise.all([
                hook.result.current.recordResult('w1', 'correct', 1, 10, 100),
                hook.result.current.recordResult('w1', 'correct', 1, 10, 100),
            ]);
        });

        const session = hook.result.current.session;
        expect(session.currentIndex).toBeLessThanOrEqual(WORDS.length);
        expect(session.results.filter((r) => r.wordUuid === 'w1')).toHaveLength(1);
    });

    it('counts a genuinely different word', async () => {
        const hook = await startedSession();
        await act(async () => {
            await hook.result.current.recordResult('w1', 'correct', 1, 10, 100);
        });
        await act(async () => {
            await hook.result.current.recordResult('w2', 'learning', 2, 5, 100);
        });

        const session = hook.result.current.session;
        expect(session.currentIndex).toBe(2);
        expect(session.xpEarned).toBe(15);
        expectReconciled(session);
    });
});

describe('the counter cannot pass the end of the round', () => {
    it('refuses a result once every question is answered', async () => {
        const hook = await startedSession();
        await act(async () => {
            await hook.result.current.recordResult('w1', 'correct', 1, 10, 100);
        });
        await act(async () => {
            await hook.result.current.recordResult('w2', 'correct', 1, 10, 100);
        });
        /* A word that is not even in the deck, arriving after the end. */
        await act(async () => {
            await hook.result.current.recordResult('w3', 'correct', 1, 10, 100);
        });

        const session = hook.result.current.session;
        expect(session.currentIndex).toBe(2);
        expect(session.words).toHaveLength(2);
        expect(session.xpEarned).toBe(20);
        expectReconciled(session);
    });

    it('reconciles every outcome kind with the questions answered', async () => {
        const hook = await startedSession();
        await act(async () => {
            await hook.result.current.recordResult('w1', 'skipped', 1, 0, 100);
        });
        await act(async () => {
            await hook.result.current.recordResult('w2', 'incorrect', 3, 0, 100);
        });
        await act(async () => {
            await hook.result.current.completeSession();
        });

        const session = hook.result.current.session;
        const byOutcome = ['correct', 'learning', 'incorrect', 'skipped'].reduce(
            (sum, kind) => sum + session.results.filter((r) => r.outcome === kind).length,
            0
        );
        /* The four outcome tiles are mutually exclusive and sum to the
         * questions answered — the summary screen reads exactly these. */
        expect(byOutcome).toBe(session.results.length);
        expect(session.completedAt).toEqual(expect.any(Number));
        expectReconciled(session);
    });
});

describe('completing a session does not change its arithmetic', () => {
    it('keeps the score and counters it had', async () => {
        const hook = await startedSession();
        await act(async () => {
            await hook.result.current.recordResult('w1', 'correct', 1, 10, 100);
        });
        const before = hook.result.current.session.xpEarned;
        await act(async () => {
            await hook.result.current.completeSession();
        });
        await act(async () => {
            await hook.result.current.completeSession();
        });

        const session = hook.result.current.session;
        expect(session.xpEarned).toBe(before);
        expectReconciled(session);
    });
});

describe('a result the session refuses says so', () => {
    /*
     * The shell could not previously tell a rejected duplicate from an accepted
     * result: a duplicate of the LAST word returned a session whose final
     * result matched the uuid just submitted, which looks exactly like success.
     * So every duplicate carried on into queueing another `game_result`,
     * advancing calibration and firing the reward signals a second time.
     */
    it('reports accepted for a genuinely new result', async () => {
        const hook = await startedSession();
        let outcome;
        await act(async () => {
            outcome = await hook.result.current.recordResult('w1', 'correct', 1, 10, 100);
        });
        expect(outcome.accepted).toBe(true);
        expect(outcome.session.results).toHaveLength(1);
    });

    it('reports NOT accepted for a duplicate of the last word', async () => {
        const hook = await startedSession();
        await act(async () => {
            await hook.result.current.recordResult('w1', 'correct', 1, 10, 100);
        });
        let outcome;
        await act(async () => {
            outcome = await hook.result.current.recordResult('w1', 'correct', 1, 10, 100);
        });
        expect(outcome.accepted).toBe(false);
        expect(outcome.session.results).toHaveLength(1);
    });

    it('refuses a word that is not in this round at all', async () => {
        /*
         * A stale callback from a previous round, or from a component that
         * unmounted mid-answer, can supply a uuid this deck never contained.
         * Checking only the index would accept it as the next question.
         */
        const hook = await startedSession();
        let outcome;
        await act(async () => {
            outcome = await hook.result.current.recordResult('not-in-deck', 'correct', 1, 10, 100);
        });
        expect(outcome.accepted).toBe(false);
        expect(outcome.session.currentIndex).toBe(0);
        expect(outcome.session.xpEarned).toBe(0);
    });
});
