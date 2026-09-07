/**
 * The guest summary counts what happened. It does not score it.
 */
import { summariseLocalProgress } from '../localProgress.js';

const result = (run, outcome) => ({
    type: 'game_result',
    run_id: run,
    word_uuid: `${run}:${outcome}:${Math.random()}`,
    outcome,
});

describe('summariseLocalProgress', () => {
    it('counts rounds by distinct run, not by event', () => {
        const summary = summariseLocalProgress([
            result('r1', 'correct'),
            result('r1', 'correct'),
            result('r1', 'incorrect'),
            result('r2', 'correct'),
        ]);
        expect(summary.rounds).toBe(2);
        expect(summary.correct).toBe(3);
    });

    it('does not count a skipped word as answered', () => {
        /* Skipping is a choice, not a wrong answer. Counting it as answered
         * would make "answered correctly" read as a failure rate for words the
         * player never attempted. */
        const summary = summariseLocalProgress([result('r1', 'correct'), result('r1', 'skipped')]);
        expect(summary.answered).toBe(1);
        expect(summary.skipped).toBe(1);
    });

    it('ignores the local-only bonus events, which are not results', () => {
        const summary = summariseLocalProgress([
            { type: 'aiwa_game_streak', run_id: 'r1' },
            { type: 'aiwa_game_session_complete', run_id: 'r1' },
            result('r1', 'correct'),
        ]);
        expect(summary.rounds).toBe(1);
        expect(summary.answered).toBe(1);
    });

    it('returns no xp, stars, badges or rank field at all', () => {
        /*
         * Not "returns zero" — the fields do not exist. A zero invites the next
         * reader to populate it, and a reward computed in a browser is exactly
         * the second source of truth the engine exists to be the only one of
         * (NODE-ADR-011).
         */
        const summary = summariseLocalProgress([result('r1', 'correct')]);
        expect(Object.keys(summary).sort()).toEqual([
            'answered',
            'correct',
            'incorrect',
            'learning',
            'rounds',
            'skipped',
        ]);
    });

    it('survives a missing, empty or malformed outbox', () => {
        for (const input of [undefined, null, [], [{}, { type: 'game_result' }]]) {
            const summary = summariseLocalProgress(input);
            expect(summary.rounds).toBe(0);
            expect(summary.answered).toBe(0);
        }
    });
});
