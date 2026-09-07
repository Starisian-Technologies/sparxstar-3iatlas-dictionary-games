/**
 * The first session: confidence runway, gentle placement, then ranking.
 *
 * The defect these cover is not a crash and not a failing assertion — every
 * test passed before this change. It is that a brand-new learner, who may be
 * writing their language for the first time, was handed the mix designed for
 * an established one: 60% current band, 25% review, and 15% drawn from a band
 * they had never been shown to handle.
 *
 * Spoken fluency is not spelling ability. Every fixture below is a word a
 * Mandinka speaker knows perfectly well by ear.
 */
import {
    CALIBRATION,
    STAGE,
    countsTowardRanking,
    emptyCalibration,
    mayAdjustLevel,
    mayLowerLevel,
    opensWithSupport,
    recordCalibrationAnswer,
    requiresUniversalWords,
    stageOf,
} from '../calibration.js';
import {
    DEFAULT_POLICY,
    LEARNER_STATE,
    STATE_MIX,
    emptyLiteracy,
    learnerState,
    mayReachUp,
    mixForState,
    needsImmediateSupport,
    recordWord,
} from '../literacy.js';
import { LEVEL, selectForLevel } from '../difficulty.js';
import { segmentHeadword } from '../orthography.js';
import { adaptGamePackWord } from '../api/gamePackAdapter.js';

/* ── Fixtures, measured rather than eyeballed ───────────────────────────── */

const word = (headword, { swadesh = false, difficulty = 'A1' } = {}) => ({
    uuid: `u-${headword}`,
    headword,
    difficulty,
    swadesh,
    translation_en: 'x',
});

const unitsOf = (w) => segmentHeadword(w.headword, 'mnk').length;

/*
 * Three-unit and four-unit Mandinka-shaped headwords. Grouped by MEASUREMENT
 * against the segmenter, never by counting the JavaScript characters — `kenta`
 * looks like five letters and segments to five units, `saŋ` looks like three
 * characters and is three units only because `ŋ` is one letter of the Peace
 * Corps orthography.
 */
const B3 = ['faŋ', 'saŋ', 'maŋ', 'baŋ', 'kaŋ', 'taŋ', 'jaŋ'];
const B4 = ['musu', 'bara', 'tala', 'sika', 'karoo'];

/** Universal words at three units — the runway's entire vocabulary. */
const universalB3 = B3.map((h) => word(h, { swadesh: true }));
/** Equally short, equally approved, NOT flagged universal. */
const ordinaryB3 = ['ŋaŋ', 'daŋ'].map((h) => word(h, { swadesh: false }));
const universalB4 = B4.map((h) => word(h, { swadesh: true }));

describe('the fixtures are what they claim to be', () => {
    /*
     * A guard, not a formality. An earlier version of a neighbouring suite
     * grouped words by eyeballing them and every group was wrong, so the tests
     * asserted things selection was never asked to do. Measure, or the suite
     * tests fiction.
     */
    it('B3 words are three orthographic units and B4 words are four', () => {
        for (const w of universalB3) expect(unitsOf(w)).toBe(3);
        for (const w of ordinaryB3) expect(unitsOf(w)).toBe(3);
        for (const w of universalB4) expect(unitsOf(w)).toBe(4);
    });
});

/* ── Stages ─────────────────────────────────────────────────────────────── */

describe('the first session has a runway before it has a ranking', () => {
    it('opens on the runway and stays there for the first five questions', () => {
        let cal = emptyCalibration();
        for (let i = 0; i < CALIBRATION.runwayQuestions; i += 1) {
            expect(stageOf(cal)).toBe(STAGE.RUNWAY);
            cal = recordCalibrationAnswer(cal);
        }
        expect(stageOf(cal)).toBe(STAGE.PLACEMENT);
    });

    it('reaches ranking only after the full thirteen', () => {
        const total = CALIBRATION.runwayQuestions + CALIBRATION.placementQuestions;
        expect(total).toBe(13);

        let cal = emptyCalibration();
        for (let i = 0; i < total; i += 1) cal = recordCalibrationAnswer(cal);

        expect(stageOf(cal)).toBe(STAGE.RANKED);
        expect(cal.complete).toBe(true);
    });

    it('never un-completes once complete', () => {
        let cal = emptyCalibration();
        for (let i = 0; i < 20; i += 1) cal = recordCalibrationAnswer(cal);
        expect(stageOf(cal)).toBe(STAGE.RANKED);
    });

    it('counts answers regardless of outcome', () => {
        /*
         * Calibration measures how far through the opening the learner is, not
         * how well they did. Advancing only on success would strand a learner
         * who is struggling in the very stage designed to support them.
         */
        const after = recordCalibrationAnswer(emptyCalibration());
        expect(after.answered).toBe(1);
    });
});

describe('the runway cannot hurt the learner', () => {
    it('does not count toward rankings', () => {
        expect(countsTowardRanking(STAGE.RUNWAY)).toBe(false);
        expect(countsTowardRanking(STAGE.PLACEMENT)).toBe(false);
        expect(countsTowardRanking(STAGE.RANKED)).toBe(true);
    });

    it('cannot move the learner in EITHER direction', () => {
        expect(mayAdjustLevel(STAGE.RUNWAY)).toBe(false);
        /* Placement may move a learner up, but still never down. */
        expect(mayAdjustLevel(STAGE.PLACEMENT)).toBe(true);
        expect(mayLowerLevel(STAGE.PLACEMENT)).toBe(false);
        expect(mayLowerLevel(STAGE.RANKED)).toBe(true);
    });

    it('offers meaning and audio before the answer, not as a penalty after it', () => {
        expect(opensWithSupport(STAGE.RUNWAY)).toBe(true);
    });
});

/* ── Universal words ────────────────────────────────────────────────────── */

describe('calibration draws only from the universal-word set', () => {
    it('requires universal words through runway AND placement', () => {
        expect(requiresUniversalWords(STAGE.RUNWAY)).toBe(true);
        expect(requiresUniversalWords(STAGE.PLACEMENT)).toBe(true);
        expect(requiresUniversalWords(STAGE.RANKED)).toBe(false);
    });

    it('a short but non-universal word cannot enter the opening runway', () => {
        /*
         * THE HEADLINE CASE. `ŋaŋ` is three orthographic units — it passes
         * every length rule the old selector had — and it is not on the
         * verified universal list. Length is not familiarity.
         */
        const picked = selectForLevel([...universalB3, ...ordinaryB3], {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 5,
            band: 'b3',
            universalOnly: true,
            needsReviewFor: () => false,
        });

        expect(picked.length).toBeGreaterThan(0);
        for (const w of picked) expect(w.swadesh).toBe(true);
        expect(picked.map((w) => w.uuid)).not.toContain('u-ŋaŋ');

        /*
         * Non-vacuity: `ŋaŋ` is genuinely selectable — same band, same level,
         * same approval — so its absence above is the universal filter and not
         * some unrelated rule quietly dropping it.
         */
        const withoutFilter = selectForLevel(ordinaryB3, {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 2,
            band: 'b3',
            needsReviewFor: () => false,
        });
        expect(withoutFilter.map((w) => w.uuid)).toContain('u-ŋaŋ');
    });

    it('treats a pack compiled before the flag existed as not-universal', () => {
        /* Undefined must fail closed for a hard filter, not pass through. */
        const legacy = [{ uuid: 'u-legacy', headword: 'faŋ', difficulty: 'A1' }];
        const picked = selectForLevel(legacy, {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 3,
            band: 'b3',
            universalOnly: true,
            needsReviewFor: () => false,
        });
        expect(picked).toHaveLength(0);
    });

    it('prefers universal words outside calibration without excluding others', () => {
        const picked = selectForLevel([...ordinaryB3, ...universalB3], {
            level: LEVEL.PRACTICE,
            languageCode: 'mnk',
            count: 9,
            band: 'b3',
            preferUniversal: true,
            needsReviewFor: () => false,
        });

        /* Everything eligible is still reachable — this is a rank, not a gate. */
        expect(picked.length).toBeGreaterThan(universalB3.length);
        /* And the familiar ones come first. */
        for (const w of picked.slice(0, universalB3.length)) {
            expect(w.swadesh).toBe(true);
        }
    });
});

/* ── The three mixes ────────────────────────────────────────────────────── */

describe('a new learner is not handed the established mix', () => {
    it('gives an uncertain learner NO words from a harder band', () => {
        expect(mixForState(LEARNER_STATE.UNCERTAIN).next).toBe(0);
        expect(mayReachUp(emptyLiteracy())).toBe(false);
    });

    it('ladders 80/20/0 → 70/20/10 → 60/25/15', () => {
        expect(STATE_MIX[LEARNER_STATE.UNCERTAIN]).toEqual({
            current: 0.8,
            review: 0.2,
            next: 0,
        });
        expect(STATE_MIX[LEARNER_STATE.DEVELOPING]).toEqual({
            current: 0.7,
            review: 0.2,
            next: 0.1,
        });
        expect(STATE_MIX[LEARNER_STATE.ESTABLISHED]).toEqual({
            current: 0.6,
            review: 0.25,
            next: 0.15,
        });
    });

    it('has every mix sum to one', () => {
        for (const mix of Object.values(STATE_MIX)) {
            expect(mix.current + mix.review + mix.next).toBeCloseTo(1, 5);
        }
    });

    it('serves an uncertain learner no next-band word even when plenty are available', () => {
        const picked = selectForLevel([...universalB3, ...universalB4], {
            level: LEVEL.PRACTICE,
            languageCode: 'mnk',
            count: 6,
            band: 'b3',
            policy: { ...DEFAULT_POLICY, mix: STATE_MIX[LEARNER_STATE.UNCERTAIN] },
            needsReviewFor: () => false,
        });

        expect(picked.length).toBeGreaterThan(0);
        for (const w of picked) expect(unitsOf(w)).toBe(3);
    });
});

/* ── Evidence, not scores ───────────────────────────────────────────────── */

const clean = (literacy, uuid) =>
    recordWord(literacy, { wordUuid: uuid, outcome: 'correct', attempts: 1, hintsUsed: 0 });
const helped = (literacy, uuid) =>
    recordWord(literacy, { wordUuid: uuid, outcome: 'learning', attempts: 2, hintsUsed: 1 });

describe('harder words unlock on demonstrated unaided success, not on time served', () => {
    it('stays uncertain until three independent clean successes', () => {
        let lit = emptyLiteracy();
        expect(learnerState(lit)).toBe(LEARNER_STATE.UNCERTAIN);

        lit = clean(lit, 'w1');
        lit = clean(lit, 'w2');
        expect(learnerState(lit)).toBe(LEARNER_STATE.UNCERTAIN);

        lit = clean(lit, 'w3');
        expect(learnerState(lit)).toBe(LEARNER_STATE.DEVELOPING);
        expect(mayReachUp(lit)).toBe(true);
    });

    it('does not count a hinted or retried answer as evidence', () => {
        let lit = emptyLiteracy();
        for (const id of ['w1', 'w2', 'w3', 'w4', 'w5']) lit = helped(lit, id);

        expect(learnerState(lit)).toBe(LEARNER_STATE.UNCERTAIN);
        expect(mayReachUp(lit)).toBe(false);
    });

    it('requires BREADTH for established, not a streak', () => {
        let lit = emptyLiteracy();
        for (let i = 0; i < DEFAULT_POLICY.masteryWords - 1; i += 1) lit = clean(lit, `w${i}`);
        expect(learnerState(lit)).toBe(LEARNER_STATE.DEVELOPING);

        lit = clean(lit, 'final');
        expect(learnerState(lit)).toBe(LEARNER_STATE.ESTABLISHED);
    });

    it('does not let repetition of ONE word substitute for breadth', () => {
        /*
         * THE ASSERTION THAT WAS TOO WEAK.
         *
         * This test asserted only `not ESTABLISHED`, so it passed while thirty
         * clean repeats of one easy word quietly reached DEVELOPING and
         * unlocked the band above — via a clean-answer STREAK that counted
         * repeats. Copilot caught it. `not.toBe(X)` on a three-valued enum
         * proves almost nothing; the state and the unlock are both pinned now.
         */
        let lit = emptyLiteracy();
        for (let i = 0; i < 30; i += 1) lit = clean(lit, 'same-word');

        expect(learnerState(lit)).toBe(LEARNER_STATE.UNCERTAIN);
        expect(mayReachUp(lit)).toBe(false);
        expect(mixForState(learnerState(lit)).next).toBe(0);

        /* Three DISTINCT words clear the same bar that thirty repeats did not. */
        let distinct = emptyLiteracy();
        distinct = clean(distinct, 'w1');
        distinct = clean(distinct, 'w2');
        distinct = clean(distinct, 'w3');
        expect(learnerState(distinct)).toBe(LEARNER_STATE.DEVELOPING);
        expect(mayReachUp(distinct)).toBe(true);
    });
});

describe('struggle is answered immediately, not after a window fills', () => {
    it('steps down after two consecutive answers needing help', () => {
        let lit = emptyLiteracy();
        for (let i = 0; i < DEFAULT_POLICY.masteryWords; i += 1) lit = clean(lit, `w${i}`);
        expect(learnerState(lit)).toBe(LEARNER_STATE.ESTABLISHED);

        lit = helped(lit, 'x1');
        expect(needsImmediateSupport(lit)).toBe(false);

        lit = helped(lit, 'x2');
        expect(needsImmediateSupport(lit)).toBe(true);
        /* And the harder words stop immediately. */
        expect(learnerState(lit)).toBe(LEARNER_STATE.UNCERTAIN);
        expect(mayReachUp(lit)).toBe(false);
    });

    it('recovers on one clean answer, so support is not a trap either', () => {
        let lit = emptyLiteracy();
        lit = helped(lit, 'x1');
        lit = helped(lit, 'x2');
        expect(needsImmediateSupport(lit)).toBe(true);

        lit = clean(lit, 'x3');
        expect(needsImmediateSupport(lit)).toBe(false);
    });

    it('never drops the learner more than one state at a time', () => {
        /*
         * Falling to UNCERTAIN changes the MIX, not the band. A learner who
         * has a bad run keeps the band they earned and simply stops being
         * shown reach words until they are steady again.
         */
        let lit = emptyLiteracy();
        for (let i = 0; i < DEFAULT_POLICY.masteryWords; i += 1) lit = clean(lit, `w${i}`);
        const band = lit.band;

        lit = helped(lit, 'x1');
        lit = helped(lit, 'x2');
        expect(lit.band).toBe(band);
    });
});

describe('recognition never unlocks spelling', () => {
    it('keeps a fluent recogniser at the beginner spelling mix', () => {
        /*
         * The premise the whole change rests on. A player may recognise every
         * word instantly and still be writing the language for the first time.
         */
        let spelling = emptyLiteracy();

        /*
         * Build a recognition profile all the way to ESTABLISHED, and KEEP it.
         *
         * An earlier version of this test called `recordWord` in a loop and
         * threw the result away, restarting from `emptyLiteracy()` each pass.
         * `recordWord` is pure, so nothing accumulated — and a test that
         * records no recognition evidence cannot show that recognition fails
         * to leak into spelling. It would have passed even if the two profiles
         * were accidentally merged.
         */
        let recognition = emptyLiteracy();
        for (let i = 0; i < DEFAULT_POLICY.masteryWords * 2; i += 1) {
            recognition = recordWord(recognition, {
                wordUuid: `m${i}`,
                outcome: 'correct',
                attempts: 1,
                hintsUsed: 0,
                skill: 'meaning',
            });
        }

        /* Non-vacuity: the recognition profile really is maxed out. */
        expect(learnerState(recognition)).toBe(LEARNER_STATE.ESTABLISHED);
        expect(mayReachUp(recognition)).toBe(true);

        /* And the SPELLING profile has learned nothing from any of it. */
        expect(learnerState(spelling)).toBe(LEARNER_STATE.UNCERTAIN);
        expect(mayReachUp(spelling)).toBe(false);
        expect(mixForState(learnerState(spelling)).next).toBe(0);

        /* Only spelling evidence moves the spelling profile. */
        spelling = clean(spelling, 's1');
        spelling = clean(spelling, 's2');
        spelling = clean(spelling, 's3');
        expect(learnerState(spelling)).toBe(LEARNER_STATE.DEVELOPING);
    });
});

describe('a small corpus degrades safely', () => {
    it('returns a short round rather than substituting unfamiliar words', () => {
        /*
         * The one place selection must NOT backfill. Everywhere else a short
         * round is the defect; on the runway, quietly topping it up with words
         * the learner may never have met is the defect, because it destroys
         * the only thing the runway promises.
         */
        const picked = selectForLevel([...universalB3.slice(0, 2), ...ordinaryB3], {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 5,
            band: 'b3',
            universalOnly: true,
            needsReviewFor: () => false,
        });

        /* Exactly the two universal words, not "at most two" — which an empty
         * round would also satisfy. */
        expect(picked).toHaveLength(2);
        for (const w of picked) expect(w.swadesh).toBe(true);

        /*
         * Non-vacuity: the SAME pool without the filter fills the round, so
         * the short round above is the filter holding and not an empty corpus.
         * This is the assertion that would fail if the backfill or the
         * recent-memory relaxation could reach past `universalOnly`.
         */
        const unfiltered = selectForLevel([...universalB3.slice(0, 2), ...ordinaryB3], {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 4,
            band: 'b3',
            needsReviewFor: () => false,
        });
        expect(unfiltered).toHaveLength(4);
    });

    it('never returns an empty round when universal words exist', () => {
        const picked = selectForLevel(universalB3, {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 5,
            band: 'b3',
            universalOnly: true,
            needsReviewFor: () => false,
        });
        expect(picked.length).toBeGreaterThan(0);
    });
});

describe('the flag survives the trip from the Dictionary to selection', () => {
    /*
     * The adapter is an ALLOWLIST. A field the Dictionary ships but nothing
     * carries is dropped without an error, and a dropped `swadesh` does not
     * break loudly — every word simply reads as not-universal, so the runway
     * returns an empty round instead of a supported one.
     *
     * This is the end-to-end assertion that catches that: a pack word in, a
     * game word out, and the flag still true.
     */
    it('carries swadesh through the adapter', () => {
        const packWord = {
            entry_id: 'e-1',
            header_word: 'faŋ',
            difficulty: 'A1',
            swadesh: true,
        };
        expect(adaptGamePackWord(packWord).swadesh).toBe(true);
    });

    it('carries a false flag as false, not as absent', () => {
        /* `false` and "missing" must stay distinguishable: one is a verified
         * negative, the other is a pack compiled before the field existed. */
        const adapted = adaptGamePackWord({ entry_id: 'e-2', header_word: 'saŋ', swadesh: false });
        expect(adapted.swadesh).toBe(false);
        expect('swadesh' in adapted).toBe(true);
    });

    it('selects an adapted universal word on the runway', () => {
        const adapted = [
            { entry_id: 'e-1', header_word: 'faŋ', difficulty: 'A1', swadesh: true },
            { entry_id: 'e-2', header_word: 'ŋaŋ', difficulty: 'A1', swadesh: false },
        ].map(adaptGamePackWord);

        const picked = selectForLevel(adapted, {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 2,
            band: 'b3',
            universalOnly: true,
            needsReviewFor: () => false,
        });

        expect(picked).toHaveLength(1);
        expect(picked[0].headword).toBe('faŋ');
    });
});
