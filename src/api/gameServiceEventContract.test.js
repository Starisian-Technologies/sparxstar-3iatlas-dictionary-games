import { buildGameServiceEvent, buildGameServiceBatch } from './gameServiceEventContract.js';

describe('buildGameServiceEvent', () => {
    it('maps a production-game result onto the frozen schema', () => {
        const result = { wordUuid: 'uuid-1', outcome: 'correct', attempts: 1, xp: 10, ts: 1720000000000 };

        expect(buildGameServiceEvent(result, 'listen_write')).toEqual({
            word_uuid: 'uuid-1',
            game_type: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            xp: 10,
            timestamp: 1720000000000,
            production_vs_recognition: 'production',
        });
    });

    it('flags recognition-only games (meaning_match, domain_flash)', () => {
        const result = { wordUuid: 'uuid-2', outcome: 'correct', attempts: 1, xp: 5, ts: 1720000001000 };

        expect(buildGameServiceEvent(result, 'meaning_match').production_vs_recognition).toBe(
            'recognition'
        );
        expect(buildGameServiceEvent(result, 'domain_flash').production_vs_recognition).toBe(
            'recognition'
        );
    });

    it('flags all four production games correctly', () => {
        for (const gameType of ['listen_write', 'arrange_word', 'complete_sentence', 'letter_reveal']) {
            const result = { wordUuid: 'uuid-3', outcome: 'learning', attempts: 3, xp: 0, ts: 1 };
            expect(buildGameServiceEvent(result, gameType).production_vs_recognition).toBe(
                'production'
            );
        }
    });
});

describe('buildGameServiceBatch', () => {
    it('maps every result in a session to a frozen-schema event', () => {
        const session = {
            gameType: 'arrange_word',
            results: [
                { wordUuid: 'a', outcome: 'correct', attempts: 1, xp: 10, ts: 1 },
                { wordUuid: 'b', outcome: 'learning', attempts: 3, xp: 0, ts: 2 },
            ],
        };

        const batch = buildGameServiceBatch(session);

        expect(batch).toHaveLength(2);
        expect(batch[0]).toMatchObject({ word_uuid: 'a', game_type: 'arrange_word', outcome: 'correct' });
        expect(batch[1]).toMatchObject({ word_uuid: 'b', game_type: 'arrange_word', outcome: 'learning' });
    });

    it('returns an empty array for a null session', () => {
        expect(buildGameServiceBatch(null)).toEqual([]);
    });

    it('returns an empty array when results is missing or not an array', () => {
        expect(buildGameServiceBatch({ gameType: 'listen_write' })).toEqual([]);
        expect(buildGameServiceBatch({ gameType: 'listen_write', results: 'not-an-array' })).toEqual([]);
    });

    it('returns an empty array for a session with no recorded results yet', () => {
        expect(buildGameServiceBatch({ gameType: 'listen_write', results: [] })).toEqual([]);
    });
});
