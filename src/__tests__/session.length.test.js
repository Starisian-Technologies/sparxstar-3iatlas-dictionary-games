/**
 * The session is as long as the player asked for.
 *
 * ====================== THE DEFECT THIS PINS =========================
 *
 * Choosing 10, 20 or 30 words produced a TWO-question session, every time, on
 * production. The words were always the same two: `kaw` and `min`.
 *
 * The fixture here is the actual pack production served
 * (`GET /api/dictionary/game-set?language=mnk&size=60&swadesh=true`), so this
 * is the real corpus and not a shape invented to make a point. Of its sixty
 * words exactly two segment to three orthographic units — and a learner with
 * no stored profile starts at the three-unit band, with `mix.next: 0`, which
 * forbade reaching past it. The permitted pool was two words wide, the round
 * was filled from it, and the session started without a word to the player.
 *
 * Every assertion below is written against the requested count, never against
 * a number that happens to match today's corpus: the point is that the
 * PLAYER'S CHOICE decides the length.
 */

import { adaptGamePackWords } from '../api/gamePackAdapter.js';
import { LEVEL, planRound, selectForLevel } from '../difficulty.js';
import {
    DEFAULT_POLICY,
    LEARNER_STATE,
    emptyLiteracy,
    learnerState,
    mixForState,
} from '../literacy.js';
import { segmentHeadword } from '../orthography.js';
import { emptyRecent, remember } from '../recent.js';
import { partitionForGame } from '../playability.js';
import pack from './fixtures/mnk-swadesh-60.json';

const WORDS = adaptGamePackWords(pack.data.words);
const unitsOf = (w) => segmentHeadword(w?.headword ?? '', 'mnk').length;

/** A learner with nothing recorded — the state every player starts in. */
const newLearner = () => {
    const literacy = emptyLiteracy();
    return {
        level: LEVEL.LEARN,
        languageCode: 'mnk',
        gameId: 'domain_flash',
        band: literacy.band,
        policy: { ...DEFAULT_POLICY, mix: mixForState(learnerState(literacy)) },
        needsReviewFor: () => false,
        recent: emptyRecent(),
        widen: true,
    };
};

describe('the fixture is the corpus that broke, not a convenient one', () => {
    it('is the sixty-word production pack', () => {
        expect(WORDS).toHaveLength(60);
        expect(WORDS.every((w) => typeof w.uuid === 'string' && w.uuid.length > 0)).toBe(true);
    });

    it('holds exactly two words at the band a new learner starts on', () => {
        /* If this changes, the defect's cause has changed with it and the
         * numbers in the header above are no longer the ones being tested. */
        const atBand = WORDS.filter((w) => unitsOf(w) === 3);
        expect(atBand.map((w) => w.headword).sort()).toEqual(['kaw', 'min']);
    });

    it('starts a new learner at three units with no reach — the trap', () => {
        const literacy = emptyLiteracy();
        expect(literacy.band).toBe('b3');
        expect(learnerState(literacy)).toBe(LEARNER_STATE.UNCERTAIN);
        expect(mixForState(learnerState(literacy)).next).toBe(0);
    });
});

describe('the length comes from the player, not from the corpus', () => {
    it.each([10, 20, 30])('a %i-word choice deals %i questions', (count) => {
        const plan = planRound(WORDS, { ...newLearner(), count });
        expect(plan.requested).toBe(count);
        expect(plan.delivered).toBe(count);
        expect(plan.words).toHaveLength(count);
        expect(plan.shortfall).toBe(0);
    });

    it('never silently substitutes the two-word round', () => {
        for (const count of [10, 20, 30]) {
            const words = selectForLevel(WORDS, { ...newLearner(), count });
            expect(words.length).toBeGreaterThan(2);
            expect(words.map((w) => w.headword).sort()).not.toEqual(['kaw', 'min']);
        }
    });

    it('uses every word once before it uses any word twice', () => {
        for (const count of [10, 20, 30]) {
            const words = selectForLevel(WORDS, { ...newLearner(), count });
            expect(new Set(words.map((w) => w.uuid)).size).toBe(words.length);
        }
    });

    it('reaches for the easiest words outside the band first', () => {
        /*
         * Widening is a concession, so it must be the SMALLEST one available:
         * a ten-word round drawn from this corpus should be short words, not
         * whatever the shuffle reached first. The corpus has 2 words at three
         * units and 12 at four, so a ten-word round is satisfiable without
         * ever passing five.
         */
        for (let run = 0; run < 40; run += 1) {
            const words = selectForLevel(WORDS, { ...newLearner(), count: 10 });
            expect(Math.max(...words.map(unitsOf))).toBeLessThanOrEqual(4);
        }
    });

    it('says when it had to reach past the mix', () => {
        const plan = planRound(WORDS, { ...newLearner(), count: 10 });
        expect(plan.widened).toBe(true);
        /* And does not claim to have reached when it did not need to. */
        const small = planRound(WORDS, { ...newLearner(), count: 2 });
        expect(small.widened).toBe(false);
        expect(small.delivered).toBe(2);
    });
});

describe('a genuine shortage is reported, never disguised', () => {
    it('delivers what exists and reports the shortfall', () => {
        /*
         * Three eligible words, thirty asked for. The round is short because
         * the corpus IS short — the one case where shortening is the correct
         * answer — and the caller is handed the number it must show the player
         * rather than being left to discover it question by question.
         */
        const tiny = WORDS.slice(0, 3);
        const plan = planRound(tiny, { ...newLearner(), count: 30 });

        /*
         * Against `plan.eligible`, never against `tiny.length`. Not every word
         * in a pack is eligible at every level — `siimaayaata` is eleven
         * orthographic units and Learn stops at six — so "how many words were
         * handed in" is the wrong denominator and asserting on it would test
         * the fixture rather than the behaviour.
         */
        expect(plan.eligible).toBeGreaterThan(0);
        expect(plan.eligible).toBeLessThan(3);
        expect(plan.requested).toBe(30);
        expect(plan.delivered).toBe(plan.eligible);
        expect(plan.words).toHaveLength(plan.eligible);
        expect(plan.shortfall).toBe(30 - plan.eligible);
    });

    it('reports an empty round rather than starting one', () => {
        const plan = planRound([], { ...newLearner(), count: 10 });
        expect(plan.delivered).toBe(0);
        expect(plan.shortfall).toBe(10);
    });
});

describe('the game filter runs before the deal, not after it', () => {
    /*
     * The second route to a short session. Selection dealt ten words it
     * believed playable; the game then dropped the ones it could not use and
     * ran whatever was left. `listen_write` is the extreme case in this corpus
     * — no entry has consented audio — and it used to be discovered only after
     * the player pressed Start.
     */
    it('deals a full round from words the game can actually play', () => {
        const playable = partitionForGame(WORDS, 'meaning_match', 'mnk').playable;
        const plan = planRound(playable, {
            ...newLearner(),
            gameId: 'meaning_match',
            count: 10,
        });
        expect(plan.delivered).toBe(10);
        for (const word of plan.words) {
            expect(typeof word.translation_en).toBe('string');
            expect(word.translation_en.length).toBeGreaterThan(0);
        }
    });

    it('reports zero for a game this corpus cannot run at all', () => {
        const playable = partitionForGame(WORDS, 'listen_write', 'mnk').playable;
        expect(playable).toHaveLength(0);
        const plan = planRound(playable, { ...newLearner(), gameId: 'listen_write', count: 10 });
        expect(plan.delivered).toBe(0);
    });
});

describe('words rotate across consecutive sessions', () => {
    /*
     * `kaw` and `min` were not only the whole round, they were the whole round
     * EVERY round. Rotation is what makes deliberate repetition legible: a word
     * comes back because review chose it, or because the corpus is genuinely
     * small, and for no other reason.
     */
    const playFive = (count) => {
        let recent = emptyRecent();
        const rounds = [];
        for (let i = 0; i < 5; i += 1) {
            const words = selectForLevel(WORDS, { ...newLearner(), count, recent });
            rounds.push(words.map((w) => w.uuid));
            recent = remember(
                recent,
                words.map((w) => w.uuid)
            );
        }
        return rounds;
    };

    it('does not deal the same round twice', () => {
        const rounds = playFive(10);
        const signatures = rounds.map((r) => [...r].sort().join('|'));
        expect(new Set(signatures).size).toBe(rounds.length);
    });

    it('covers far more of the corpus than one round holds', () => {
        const seen = new Set(playFive(10).flat());
        expect(seen.size).toBeGreaterThan(20);
    });

    it('does not repeat the previous round while unseen words remain', () => {
        const rounds = playFive(10);
        for (let i = 1; i < rounds.length; i += 1) {
            const overlap = rounds[i].filter((id) => rounds[i - 1].includes(id));
            expect(overlap.length).toBeLessThan(rounds[i].length);
        }
    });

    it('keeps playing once the corpus has been exhausted', () => {
        /* Six rounds of ten over a corpus this size must recycle. Recycling is
         * allowed; stopping, or dealing a two-word round, is not. */
        let recent = emptyRecent();
        for (let i = 0; i < 8; i += 1) {
            const words = selectForLevel(WORDS, { ...newLearner(), count: 10, recent });
            expect(words).toHaveLength(10);
            expect(new Set(words.map((w) => w.uuid)).size).toBe(10);
            recent = remember(
                recent,
                words.map((w) => w.uuid)
            );
        }
    });
});
