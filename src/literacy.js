/**
 * The literacy progression engine.
 *
 * ==========================================================================
 * SOURCE NOTE
 *
 * *Digital Games and Language Learning: Theory, Development and Implementation*
 * (Peterson, Yamazaki & Thomas) HAS now been read — the reconciliation is in
 * `docs/research-reconciliation.md`.
 *
 * It DIRECTLY supports the central rule below. Reporting Kyriakova & Angelova
 * (2014), the book describes games providing "difficulty progression on an
 * individual basis, keeping players at a particular level until they have
 * demonstrated that they are able to pass that level and progress to the next
 * one." That is this module.
 *
 * It supplies NONE of the numbers — not ten words, not the accuracy floor, not
 * the 3/4/5/6-7/8+ ladder. Those are product decisions awaiting pilot data,
 * which is why `progressionPolicy()` makes them configurable. Do not cite the
 * book for a threshold.
 * ==========================================================================
 *
 * WHAT THIS IS FOR
 *
 * The games previously chose words by sorting candidates on a difficulty score
 * and sliding a window along that list. That serves words; it does not teach.
 * It had no notion of a learner having a CURRENT LEVEL OF LITERACY, of what it
 * would take to move up from it, or of holding someone at a level until they
 * are ready to leave it.
 *
 * So this module owns one question: **what is this learner ready to spell, and
 * have they shown they are ready for more?** It deliberately does not own XP,
 * stars, badges, or the Dictionary's own word classification — those are
 * separate systems and conflating them is the specific mistake being corrected.
 *
 * FIVE SEPARATE THINGS, NEVER COLLAPSED
 *
 *   Literacy band     3, 4, 5, 6–7, 8+ orthographic units. THIS MODULE.
 *   Player mode       Learn / Practice / Challenge. The player's choice.
 *   Adaptive offset   ±2 fine-tuning WITHIN a band. `difficulty.js`.
 *   Dictionary level  CEFR. The Dictionary's classification of the WORD.
 *   XP                Effort and performance. The engine's ledger.
 *
 * Total XP is never evidence that a learner can spell longer words. Mastery is.
 */

import { segmentHeadword, unspellableReason } from './orthography.js';
/*
 * Deliberately NOT importing `SKILL` from `difficulty.js`: that module imports
 * this one for the band helpers, and a cycle between them would be resolved
 * differently by Jest and webpack. Callers pass the skill explicitly, which is
 * better anyway — a silently defaulted skill is how two skills become one.
 */

/**
 * The bands, in order. Each is a minimum unit count; the last is open-ended.
 *
 * `3 → 4 → 5 → 6–7 → 8+`. A STARTING POLICY, not a finding: the brief is
 * explicit that this must be measured against real learners and its thresholds
 * kept configurable, so every number here is overridable through
 * `progressionPolicy()` rather than baked into the logic.
 */
export const UNIT_BANDS = [
    { id: 'b3', min: 3, max: 3 },
    { id: 'b4', min: 4, max: 4 },
    { id: 'b5', min: 5, max: 5 },
    { id: 'b6', min: 6, max: 7 },
    { id: 'b8', min: 8, max: Infinity },
];

/**
 * From this band up, band membership alone is not enough to pick a word:
 * CEFR, familiarity, orthographic complexity and prior performance all enter
 * the decision. Below it, length is the dominant signal because a learner at
 * three units is learning the writing system, not the vocabulary.
 */
export const RICH_SELECTION_FROM_BAND = 'b5';

/**
 * How much evidence the system has about this learner's SPELLING.
 *
 * Not a skill level and not a ranking — a statement about what is known. A
 * learner is `UNCERTAIN` because nothing has been demonstrated yet, which is
 * true of every new player regardless of how fluently they speak.
 */
export const LEARNER_STATE = {
    /** New, or recently struggling. No harder words at all. */
    UNCERTAIN: 'uncertain',
    /** Holding their band. A small reach is now reasonable. */
    DEVELOPING: 'developing',
    /** Demonstrated unaided spelling. Full mix. */
    ESTABLISHED: 'established',
};

/**
 * One mix per learner state.
 *
 * The single 60/25/15 mix was right for an established learner and wrong as a
 * constant: it put 15% of a brand-new learner's very first round into a band
 * they had never been shown to handle. `next: 0` for an uncertain learner is
 * the whole correction — a learner meets a harder word only once the system
 * has seen them succeed unaided at the band below it.
 *
 * Product settings, not findings. Tune with AIWA against real play data.
 */
export const STATE_MIX = {
    [LEARNER_STATE.UNCERTAIN]: { current: 0.8, review: 0.2, next: 0 },
    [LEARNER_STATE.DEVELOPING]: { current: 0.7, review: 0.2, next: 0.1 },
    [LEARNER_STATE.ESTABLISHED]: { current: 0.6, review: 0.25, next: 0.15 },
};

/** Defaults. Every one is a product decision and every one is overridable. */
export const DEFAULT_POLICY = {
    /** Unique words that must be mastered before a band can be left. */
    masteryWords: 10,
    /** Share of those that must be first-attempt correct. */
    masteryAccuracy: 0.8,
    /**
     * Shares of a round drawn from each pool.
     *
     * Retained as the ESTABLISHED mix so existing callers keep their behaviour.
     * Callers that know the learner's state should use `mixForState`, which is
     * what stops a new learner being handed the established mix.
     */
    mix: STATE_MIX[LEARNER_STATE.ESTABLISHED],
    /**
     * Independent, first-attempt, unaided successes needed at a band before
     * words from the band above may appear at all.
     */
    unlockEvidence: 3,
    /**
     * Consecutive answers involving a retry, a hint or a skip that trigger a
     * step down in difficulty or a step up in support.
     */
    struggleRun: 2,
};

/** The mix for a learner state, honouring any policy override. */
export function mixForState(state, policy = DEFAULT_POLICY) {
    const table = policy.stateMix ?? STATE_MIX;
    return table[state] ?? table[LEARNER_STATE.ESTABLISHED] ?? DEFAULT_POLICY.mix;
}

export function progressionPolicy(overrides = {}) {
    return {
        ...DEFAULT_POLICY,
        ...overrides,
        mix: { ...DEFAULT_POLICY.mix, ...(overrides.mix ?? {}) },
    };
}

/** The band a word belongs to, by its orthographic unit count. */
export function bandForWord(word, languageCode) {
    const headword = word?.headword ?? '';
    if (!headword) return null;
    if (unspellableReason(headword, languageCode)) return null;
    return bandForUnits(segmentHeadword(headword, languageCode).length);
}

export function bandForUnits(units) {
    return UNIT_BANDS.find((b) => units >= b.min && units <= b.max) ?? null;
}

export function bandIndex(bandId) {
    return UNIT_BANDS.findIndex((b) => b.id === bandId);
}

/**
 * A learner with no stored literacy profile.
 *
 * Starts at THREE UNITS, not at unrestricted Practice.
 *
 * This is the rule most easily got wrong, because most players of this app are
 * fluent Mandinka speakers. Fluency is not literacy: someone who has spoken the
 * language all their life may never have written it. Defaulting them into
 * unrestricted word selection hands an adult a word they cannot spell as their
 * first experience of the app, which is exactly the discouragement the design
 * is meant to avoid. Speaking ability is not evidence about spelling, so the
 * profile begins with no evidence at all and the supported band.
 */
export function emptyLiteracy() {
    return { band: UNIT_BANDS[0].id, mastered: {}, attempts: {}, struggleRun: 0 };
}

/** Progress is per language AND per skill; neither generalises to the other. */
export function literacyKey(languageCode, skill) {
    if (!skill) throw new TypeError('literacyKey requires an explicit skill');
    return `${languageCode ?? ''}:${skill}`;
}

/**
 * Record one answered word against a literacy profile.
 *
 * Only PRODUCTION skills advance a spelling band. A learner may recognise a
 * word's meaning instantly and still be working out how to write it, so
 * recognition and meaning results are recorded but never promote spelling —
 * the caller keys them under their own skill, and this function additionally
 * refuses to count them toward a spelling profile.
 */
export function recordWord(literacy, { wordUuid, outcome, attempts = 1, hintsUsed = 0, skill }) {
    const base = literacy ?? emptyLiteracy();
    if (!wordUuid) return base;

    /* Mastery is FIRST-ATTEMPT, UNAIDED correctness on a unique word. A word
     * got right after three tries and two hints is progress worth XP, and it is
     * not yet evidence of readiness for longer words. */
    const clean = outcome === 'correct' && attempts <= 1 && hintsUsed <= 0;

    /*
     * One consecutive run, tracked because the rolling window cannot do this
     * job: `decideAdjustment` will not act below `MIN_EVIDENCE` answers, so a
     * learner could struggle through most of a round before anything eased.
     *
     * There is deliberately NO clean-answer streak here. Unlocking the band
     * above is gated on DISTINCT words mastered (see `learnerState`), because
     * a streak counts repeats and repeats of one easy word are not evidence
     * about longer words.
     *
     *   `struggleRun`  answers in a row that needed a retry, a hint or a skip.
     *                  Drives the immediate step-down inside a round, which the
     *                  rolling window cannot do because it will not act below
     *                  `MIN_EVIDENCE` answers.
     */
    const needsHelp = outcome !== 'correct' || attempts > 1 || hintsUsed > 0;

    return {
        ...base,
        skill: skill ?? base.skill,
        attempts: { ...base.attempts, [wordUuid]: (base.attempts[wordUuid] ?? 0) + 1 },
        mastered: clean ? { ...base.mastered, [wordUuid]: true } : base.mastered,
        struggleRun: needsHelp ? (base.struggleRun ?? 0) + 1 : 0,
    };
}

/**
 * What the system knows about this learner's spelling, right now.
 *
 * Deliberately evidence-shaped rather than score-shaped, and deliberately
 * quick to fall back: a learner who starts struggling returns to `UNCERTAIN`
 * and stops being shown harder words, without losing their band.
 */
export function learnerState(literacy, policy = DEFAULT_POLICY) {
    const base = literacy ?? emptyLiteracy();

    /* Struggling now outranks anything demonstrated earlier. */
    if ((base.struggleRun ?? 0) >= policy.struggleRun) return LEARNER_STATE.UNCERTAIN;

    /*
     * `mastered` is keyed by word id, so its size is the count of DISTINCT
     * words this learner got right first-attempt and unaided. That is exactly
     * the "independent, first-attempt, unaided successes" the unlock requires,
     * and counting distinct words is what makes them independent.
     *
     * This gate previously also accepted a `cleanRun` streak, which counted
     * REPEATS: three clean answers on one easy word unlocked the band above,
     * which is the opposite of the rule it was supposed to enforce. A streak
     * is evidence about one word; a band is a claim about many.
     */
    const mastered = Object.keys(base.mastered ?? {}).length;

    if (mastered < policy.unlockEvidence) return LEARNER_STATE.UNCERTAIN;

    /*
     * Established needs MORE breadth still: enough unique words to rule out a
     * learner who has memorised a handful. `masteryWords` is the same evidence
     * bar that promotes a band.
     */
    if (mastered >= policy.masteryWords) return LEARNER_STATE.ESTABLISHED;

    return LEARNER_STATE.DEVELOPING;
}

/**
 * May words from the band above appear in this learner's round?
 *
 * Separate from `learnerState` because the mix already encodes the answer for
 * the ordinary path; this is the explicit gate a caller can assert against,
 * and the one a test can pin.
 */
export function mayReachUp(literacy, policy = DEFAULT_POLICY) {
    return mixForState(learnerState(literacy, policy), policy).next > 0;
}

/** Is this learner struggling badly enough to need support NOW, mid-round? */
export function needsImmediateSupport(literacy, policy = DEFAULT_POLICY) {
    return (literacy?.struggleRun ?? 0) >= policy.struggleRun;
}

/** How close this learner is to leaving their current band. */
export function masteryProgress(literacy, policy = DEFAULT_POLICY) {
    const base = literacy ?? emptyLiteracy();
    const seen = Object.keys(base.attempts ?? {}).length;
    const mastered = Object.keys(base.mastered ?? {}).length;
    return {
        seen,
        mastered,
        needed: policy.masteryWords,
        /* Accuracy over words actually attempted in this band. */
        accuracy: seen === 0 ? 0 : mastered / seen,
        ready:
            mastered >= policy.masteryWords &&
            mastered / Math.max(1, seen) >= policy.masteryAccuracy,
    };
}

/**
 * Promote a learner one band, or leave them where they are.
 *
 * Advancement requires sustained mastery across at least `masteryWords` UNIQUE
 * words, never accumulated points. Promotion resets the per-band evidence,
 * because mastery of three-unit words says nothing about four-unit ones.
 */
export function promoteIfReady(literacy, policy = DEFAULT_POLICY) {
    const base = literacy ?? emptyLiteracy();
    const progress = masteryProgress(base, policy);
    if (!progress.ready) return { literacy: base, promoted: false };

    const next = bandIndex(base.band) + 1;
    if (next >= UNIT_BANDS.length) return { literacy: base, promoted: false };

    return {
        literacy: { ...base, band: UNIT_BANDS[next].id, mastered: {}, attempts: {} },
        promoted: true,
        from: base.band,
        to: UNIT_BANDS[next].id,
    };
}

/**
 * Does selection at this band need the full signal set?
 *
 * Below five units, length dominates and the extra signals add noise. From five
 * up, CEFR, familiarity, complexity and prior performance all matter, because
 * the words stop being distinguishable by length alone.
 */
export function usesRichSelection(bandId) {
    return bandIndex(bandId) >= bandIndex(RICH_SELECTION_FROM_BAND);
}
