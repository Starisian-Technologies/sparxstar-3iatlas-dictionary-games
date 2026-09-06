/**
 * The first session: a confidence runway, then a gentle placement.
 *
 * ======================= WHY THIS EXISTS =======================
 *
 * Selection already refused to serve a word above the learner's unlocked
 * ceiling, and it already mixed 60% current band / 25% review / 15% one band
 * up. Both are right for a learner the system knows something about. Applied
 * to someone who has just opened the app for the first time, they are wrong in
 * a specific way:
 *
 *   - 15% of the very first round is drawn from a band the learner has never
 *     been shown to handle, because the mix is a constant;
 *   - the opening band is chosen by orthographic-unit count alone, and a
 *     three-unit word can be culturally unfamiliar, orthographically awkward,
 *     or simply hard to spell;
 *   - the first answers count toward a level, so a shaky start is recorded as
 *     evidence of low ability rather than of no evidence.
 *
 * The premise being corrected is bigger than any threshold: SPOKEN FLUENCY IS
 * NOT SPELLING ABILITY. Every player of these games is a native speaker. Many
 * are writing their language for the first time in their lives. Fluency tells
 * you they will recognise the word instantly; it tells you nothing about
 * whether they can write it.
 *
 * ==================== WHAT A RUNWAY IS ====================
 *
 * The first five questions are a runway, not a test:
 *
 *   - drawn only from the verified universal-word set, at the shortest band;
 *   - meaning and audio offered BEFORE the learner answers, not as a penalty
 *     after a mistake;
 *   - not counted toward any ranking;
 *   - incapable of lowering the learner's level or band.
 *
 * The next eight are placement: still universal words, still capped, but now
 * allowed to move the learner UP by at most one band at a time, and only on
 * evidence. Thirteen questions in total, which is one standard round.
 *
 * ==================== WHAT THIS MODULE DOES NOT DECIDE ====================
 *
 * Which words are universal is AIWA's classification, not this module's. The
 * software consumes the flag the Dictionary ships (`word.swadesh`) and never
 * recomputes or second-guesses it. If the opening vocabulary still reads as
 * hard to a speaker, the correction belongs in that data, not in a compensating
 * heuristic here.
 *
 * Every number below is a product setting, not a finding. `RUNWAY_QUESTIONS`,
 * `PLACEMENT_QUESTIONS` and the unlock evidence counts are overridable, because
 * the brief is explicit that they must be tuned against real play data with
 * AIWA rather than defended from a specification.
 */

/** The stages of a first session, in order. */
export const STAGE = {
    /** Questions 1–5. Guaranteed-success vocabulary. Nothing is scored. */
    RUNWAY: 'runway',
    /** Questions 6–13. Finding the starting band, one step at a time. */
    PLACEMENT: 'placement',
    /** Calibration complete. Normal adaptation applies. */
    RANKED: 'ranked',
};

/** Product settings. Overridable; see the note above. */
export const CALIBRATION = {
    runwayQuestions: 5,
    placementQuestions: 8,
};

export function calibrationPolicy(overrides = {}) {
    return { ...CALIBRATION, ...overrides };
}

/** A learner who has never answered anything. */
export function emptyCalibration() {
    return { answered: 0, complete: false };
}

/**
 * Which stage a learner is in.
 *
 * Derived from the answer count rather than stored as a mode, so the stage
 * cannot drift out of step with the evidence behind it.
 */
export function stageOf(calibration, policy = CALIBRATION) {
    const base = calibration ?? emptyCalibration();
    if (base.complete) return STAGE.RANKED;

    const answered = Math.max(0, Math.floor(base.answered ?? 0));
    if (answered < policy.runwayQuestions) return STAGE.RUNWAY;
    if (answered < policy.runwayQuestions + policy.placementQuestions) return STAGE.PLACEMENT;
    return STAGE.RANKED;
}

/** Record one answered question. Outcome is deliberately not consulted. */
export function recordCalibrationAnswer(calibration, policy = CALIBRATION) {
    const base = calibration ?? emptyCalibration();
    if (base.complete) return base;

    const answered = Math.max(0, Math.floor(base.answered ?? 0)) + 1;
    const total = policy.runwayQuestions + policy.placementQuestions;
    return { answered, complete: answered >= total };
}

/**
 * May this stage change the learner's recorded level or band?
 *
 * The runway may not, in either direction. That asymmetry is the point: a
 * learner who stumbles on question two has produced no evidence about their
 * ability, only evidence that the system had not yet found their level.
 */
export function mayAdjustLevel(stage) {
    return stage !== STAGE.RUNWAY;
}

/** May this stage LOWER the learner's level? */
export function mayLowerLevel(stage) {
    return stage === STAGE.RANKED;
}

/** Do answers at this stage count toward rankings and totals? */
export function countsTowardRanking(stage) {
    return stage === STAGE.RANKED;
}

/**
 * Must selection at this stage draw only from the universal-word set?
 *
 * True for the whole of calibration, runway and placement alike. Placement is
 * looking for the band at which a learner can spell a word they certainly
 * know; introducing an unfamiliar word would confound "cannot spell it" with
 * "has not met it".
 */
export function requiresUniversalWords(stage) {
    return stage === STAGE.RUNWAY || stage === STAGE.PLACEMENT;
}

/**
 * Scaffolding offered BEFORE the answer, by stage.
 *
 * On the runway, meaning and audio are present from the start — the learner is
 * being shown that the game is winnable, and withholding help to preserve the
 * integrity of a measurement makes no sense when nothing is being measured.
 */
export function opensWithSupport(stage) {
    return stage === STAGE.RUNWAY;
}

/** Player-facing framing. Never a judgement, never a score. */
export const STAGE_MESSAGE = {
    [STAGE.RUNWAY]: "Let's start with some words you know well.",
    [STAGE.PLACEMENT]: "Let's find the best starting place for you.",
    [STAGE.RANKED]: null,
};
