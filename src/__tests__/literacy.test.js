/**
 * The literacy progression engine.
 *
 * SOURCE NOTE: the rules asserted here come from the corrective brief's
 * enumeration of *Digital Games and Language Learning*. That book was not
 * supplied to this repository and has not been read here — these tests pin a
 * specification, and must not be described as verifying the book.
 *
 * The rule that matters most is the first one. Most players of this app speak
 * Mandinka fluently and may never have written it, so a "beginner" here is not
 * a beginner at the language. Defaulting a fluent speaker with no literacy
 * profile into unrestricted word selection hands an adult a word they cannot
 * spell as their first experience of the app.
 */
import {
    DEFAULT_POLICY,
    UNIT_BANDS,
    bandForUnits,
    bandForWord,
    bandIndex,
    emptyLiteracy,
    literacyKey,
    masteryProgress,
    progressionPolicy,
    promoteIfReady,
    recordWord,
    usesRichSelection,
} from '../literacy.js';
import { SKILL } from '../difficulty.js';

const master = (literacy, n, opts = {}) => {
    let out = literacy;
    for (let i = 0; i < n; i += 1) {
        out = recordWord(out, {
            wordUuid: `w${i}`,
            outcome: 'correct',
            attempts: 1,
            hintsUsed: 0,
            skill: SKILL.SPELLING,
            ...opts,
        });
    }
    return out;
};

describe('a learner with no profile starts supported', () => {
    it('begins at three units, not at unrestricted Practice', () => {
        expect(emptyLiteracy().band).toBe('b3');
        expect(UNIT_BANDS[0]).toMatchObject({ min: 3, max: 3 });
    });

    it('has no evidence yet, so is not instantly promotable', () => {
        expect(masteryProgress(emptyLiteracy()).ready).toBe(false);
        expect(promoteIfReady(emptyLiteracy()).promoted).toBe(false);
    });
});

describe('bands', () => {
    it('maps unit counts to the 3 / 4 / 5 / 6-7 / 8+ ladder', () => {
        expect(bandForUnits(3).id).toBe('b3');
        expect(bandForUnits(4).id).toBe('b4');
        expect(bandForUnits(5).id).toBe('b5');
        expect(bandForUnits(6).id).toBe('b6');
        expect(bandForUnits(7).id).toBe('b6');
        expect(bandForUnits(9).id).toBe('b8');
    });

    it('places a real Mandinka headword by its UNITS, not its characters', () => {
        /* `njemboo` is nj·e·m·b·oo — five units, seven characters. Banding it
         * by character count would put it a whole band too high. */
        expect(bandForWord({ headword: 'njemboo' }, 'mnk').id).toBe('b5');
    });

    it('refuses a word that cannot be spelled at all', () => {
        expect(bandForWord({ headword: 'suno tey' }, 'mnk')).toBeNull();
        expect(bandForWord({ headword: '' }, 'mnk')).toBeNull();
    });

    it('uses the full signal set only from five units up', () => {
        expect(usesRichSelection('b3')).toBe(false);
        expect(usesRichSelection('b4')).toBe(false);
        expect(usesRichSelection('b5')).toBe(true);
        expect(usesRichSelection('b8')).toBe(true);
    });
});

describe('mastery, not points, promotes', () => {
    it('advances 3 -> 4 -> 5 on sustained mastery', () => {
        let lit = master(emptyLiteracy(), DEFAULT_POLICY.masteryWords);
        let step = promoteIfReady(lit);
        expect(step.promoted).toBe(true);
        expect(step.to).toBe('b4');

        step = promoteIfReady(master(step.literacy, DEFAULT_POLICY.masteryWords));
        expect(step.to).toBe('b5');
    });

    it('needs TEN UNIQUE words, not ten answers to the same one', () => {
        let lit = emptyLiteracy();
        for (let i = 0; i < 20; i += 1) {
            lit = recordWord(lit, {
                wordUuid: 'same-word',
                outcome: 'correct',
                attempts: 1,
                skill: SKILL.SPELLING,
            });
        }
        expect(masteryProgress(lit).mastered).toBe(1);
        expect(promoteIfReady(lit).promoted).toBe(false);
    });

    it('does not count a word got right WITH HELP as mastered', () => {
        /*
         * Help carries no penalty — that is the freedom-to-fail rule — but it
         * is not evidence of readiness for longer words either.
         */
        const withHint = master(emptyLiteracy(), 10, { hintsUsed: 2 });
        expect(masteryProgress(withHint).mastered).toBe(0);
        expect(promoteIfReady(withHint).promoted).toBe(false);

        const withRetries = master(emptyLiteracy(), 10, { attempts: 3 });
        expect(promoteIfReady(withRetries).promoted).toBe(false);
    });

    it('holds a learner whose accuracy is too low, even at ten mastered', () => {
        let lit = master(emptyLiteracy(), 10);
        /* Plenty of misses alongside them: seen rises, accuracy falls. */
        for (let i = 0; i < 40; i += 1) {
            lit = recordWord(lit, {
                wordUuid: `miss${i}`,
                outcome: 'incorrect',
                attempts: 3,
                skill: SKILL.SPELLING,
            });
        }
        expect(masteryProgress(lit).mastered).toBe(10);
        expect(masteryProgress(lit).accuracy).toBeLessThan(DEFAULT_POLICY.masteryAccuracy);
        expect(promoteIfReady(lit).promoted).toBe(false);
    });

    it('resets the evidence on promotion', () => {
        /* Mastery of three-unit words says nothing about four-unit ones. */
        const { literacy } = promoteIfReady(master(emptyLiteracy(), 10));
        expect(masteryProgress(literacy).mastered).toBe(0);
        expect(masteryProgress(literacy).seen).toBe(0);
    });

    it('stops at the top band rather than running off the ladder', () => {
        let lit = { ...emptyLiteracy(), band: UNIT_BANDS[UNIT_BANDS.length - 1].id };
        lit = master(lit, 20);
        expect(promoteIfReady(lit).promoted).toBe(false);
    });

    it('is configurable, because the ladder is a starting policy not a law', () => {
        const easy = progressionPolicy({ masteryWords: 2, masteryAccuracy: 0.5 });
        expect(promoteIfReady(master(emptyLiteracy(), 2), easy).promoted).toBe(true);
        /* And the default is unchanged by that call. */
        expect(DEFAULT_POLICY.masteryWords).toBe(10);
    });
});

describe('skills never promote one another', () => {
    it('keys spelling and meaning progress separately', () => {
        expect(literacyKey('mnk', SKILL.SPELLING)).not.toBe(literacyKey('mnk', SKILL.MEANING));
        expect(literacyKey('mnk', SKILL.SPELLING)).not.toBe(literacyKey('wol', SKILL.SPELLING));
    });

    it('refuses to key without an explicit skill', () => {
        /* A silently defaulted skill is exactly how two skills become one. */
        expect(() => literacyKey('mnk')).toThrow(TypeError);
    });

    it('leaves the spelling band untouched however strong meaning recognition is', () => {
        const spelling = emptyLiteracy();
        /* A whole session of perfect meaning answers, recorded under its own
         * key, cannot move the spelling profile — they are different objects. */
        const meaning = master(emptyLiteracy(), 20, { skill: SKILL.MEANING });
        expect(promoteIfReady(meaning).promoted).toBe(true);
        expect(spelling.band).toBe('b3');
        expect(promoteIfReady(spelling).promoted).toBe(false);
    });
});

describe('band ordering', () => {
    it('reports position on the ladder', () => {
        expect(bandIndex('b3')).toBe(0);
        expect(bandIndex('b5')).toBe(2);
        expect(bandIndex('nonsense')).toBe(-1);
    });
});
