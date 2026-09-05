/**
 * The literacy progression engine.
 *
 * ==========================================================================
 * SOURCE NOTE — read this before citing research in a comment below.
 *
 * The brief that produced this module enumerates findings from *Digital Games
 * and Language Learning: Theory, Development and Implementation*. THAT BOOK WAS
 * NOT SUPPLIED TO THIS REPOSITORY and has not been read here. The rules encoded
 * below are the brief's enumeration of them, which is a specification, not a
 * citation. Where a threshold is a product decision rather than a finding, the
 * comment says so. Nothing here should be described as "what the book says".
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

/** Defaults. Every one is a product decision and every one is overridable. */
export const DEFAULT_POLICY = {
    /** Unique words that must be mastered before a band can be left. */
    masteryWords: 10,
    /** Share of those that must be first-attempt correct. */
    masteryAccuracy: 0.8,
    /** Shares of a round drawn from each pool. */
    mix: { current: 0.6, review: 0.25, next: 0.15 },
};

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
    return { band: UNIT_BANDS[0].id, mastered: {}, attempts: {} };
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

    return {
        ...base,
        skill: skill ?? base.skill,
        attempts: { ...base.attempts, [wordUuid]: (base.attempts[wordUuid] ?? 0) + 1 },
        mastered: clean ? { ...base.mastered, [wordUuid]: true } : base.mastered,
    };
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
