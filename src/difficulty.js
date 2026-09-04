/**
 * Difficulty: the player's chosen level, and conservative adaptation within it.
 *
 * ============ THE DICTIONARY ALREADY CODES LEARNING LEVEL ============
 *
 * Every word carries a `difficulty` — a CEFR band assigned by the Dictionary.
 * Measured over 488 real Mandinka entries:
 *
 *   A1  34.4%    A2  16.6%    B1  8.6%    B2  9.2%    C1  4.7%    unset 26.4%
 *
 * It reached the browser and `src/api/gamePackAdapter.js` threw it away, which
 * is why the games had no notion of difficulty at all.
 *
 * **That coding is the primary difficulty signal and this module does not
 * compete with it.** Everything else here either orders words WITHIN a band or
 * decides which bands to draw from. Nothing recomputes a word's level: an
 * A1 word is A1 because the Dictionary says so, and if that is wrong the fix
 * belongs in the Dictionary, not in a game.
 *
 * ============ WHAT ADAPTATION MAY AND MAY NOT DO ============
 *
 * It may reorder and reselect questions inside the player's chosen level. It
 * may not move a player between levels — that is the player's choice, always —
 * and it may not produce a question that cannot be answered. The trap-
 * prevention rules in `src/orthography.js` apply after every adaptation
 * decision, never before it, so no amount of adjustment can deal a word a
 * spelling game cannot play.
 *
 * No machine learning. Deterministic, inspectable rules, so a player can be
 * told plainly what changed and why, and a test can assert it.
 */

import { SPELLABLE_UNIT_RANGE, profileFor, segmentHeadword } from './orthography.js';

/* ── The player's level ─────────────────────────────────────────────────── */

/**
 * Three starting levels, chosen by the player and changeable at any time.
 *
 * Labels are welcoming by requirement: no level describes a player as a
 * beginner, weak, or failing. "Learn" is where you meet a word; "Practice" is
 * where you work on it; "Challenge" is where you test yourself.
 */
export const LEVEL = {
    LEARN: 'learn',
    PRACTICE: 'practice',
    CHALLENGE: 'challenge',
};

/**
 * CEFR bands, ordered. The Dictionary's own vocabulary, used as its own.
 * `null` covers the 26.4% of entries with no band assigned.
 */
export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Numeric rank for comparison. Unset sorts with A2 — mid-low, not hardest. */
export function cefrRank(band) {
    const idx = CEFR_ORDER.indexOf(String(band ?? '').toUpperCase());
    return idx === -1 ? 1 : idx;
}

/**
 * What each level offers. Assistance and task mix differ; ESCAPE NEVER DOES.
 *
 * `bands` is which of the Dictionary's own levels a level draws from, widest
 * first — not a re-grading of the words.
 */
export const LEVEL_PROFILE = {
    [LEVEL.LEARN]: {
        label: 'Learn',
        blurb: 'Meet new words — clues, hints and answers shown',
        /* Recognition-focused, and the Dictionary's easiest bands. */
        bands: ['A1', 'A2'],
        maxAttempts: 3,
        /** Hints from the first attempt. */
        hintFromAttempt: 1,
        /** Show meaning, audio and domain alongside the prompt. */
        cluesVisible: true,
        /** Prefer recognition tasks over production ones. */
        preferRecognition: true,
        maxUnits: 6,
    },
    [LEVEL.PRACTICE]: {
        label: 'Practice',
        blurb: 'Mixed reading and spelling — hints after a mistake',
        bands: ['A1', 'A2', 'B1'],
        maxAttempts: 3,
        hintFromAttempt: 2,
        cluesVisible: true,
        preferRecognition: false,
        maxUnits: SPELLABLE_UNIT_RANGE.max,
    },
    [LEVEL.CHALLENGE]: {
        label: 'Challenge',
        blurb: 'Longer and less familiar words — fewer clues',
        bands: ['A2', 'B1', 'B2', 'C1', 'C2'],
        maxAttempts: 3,
        hintFromAttempt: 3,
        cluesVisible: false,
        preferRecognition: false,
        maxUnits: SPELLABLE_UNIT_RANGE.max,
    },
};

/** The profile for a level, defaulting to Practice. */
export function levelProfile(level) {
    return LEVEL_PROFILE[level] ?? LEVEL_PROFILE[LEVEL.PRACTICE];
}

/* ── Skills, kept apart ─────────────────────────────────────────────────── */

/**
 * The skills measured separately, because they genuinely are separate.
 *
 * A learner may recognise a word's meaning readily and still be working out how
 * to spell it. Collapsing these into one ability score would let strong meaning
 * recognition raise the spelling difficulty, which is the specific mistake the
 * brief rules out.
 */
export const SKILL = {
    RECOGNITION: 'recognition',
    SPELLING: 'spelling',
    LISTENING: 'listening',
    MEANING: 'meaning',
};

/** Which skill each game exercises. */
export const GAME_SKILL = {
    arrange_word: SKILL.SPELLING,
    letter_reveal: SKILL.SPELLING,
    complete_sentence: SKILL.SPELLING,
    listen_write: SKILL.LISTENING,
    meaning_match: SKILL.MEANING,
    domain_flash: SKILL.RECOGNITION,
};

/** Is this a recognition task rather than a production one? */
export function isRecognitionGame(gameId) {
    return GAME_SKILL[gameId] === SKILL.RECOGNITION || GAME_SKILL[gameId] === SKILL.MEANING;
}

/* ── Question difficulty, within a band ─────────────────────────────────── */

/**
 * How hard this word is to ask, as an ordering score — NOT a level.
 *
 * The Dictionary's band dominates: it contributes ten times what any single
 * other factor can, so this can reorder words inside a band and can prefer an
 * easier band's word, but it can never make an A1 word rank above a C1 one.
 *
 * Word length is deliberately ONE factor among several and never the only one.
 *
 * @param {object} word     Adapted game word.
 * @param {object} opts
 * @param {string} opts.languageCode
 * @param {string} [opts.gameId]      Which task type is being asked.
 * @param {object} [opts.history]     Per-word history: { seen, correct, missed }.
 */
export function questionDifficulty(word, { languageCode, gameId, history } = {}) {
    /* 1. The Dictionary's own coding. Primary, and weighted to stay primary. */
    let score = cefrRank(word?.difficulty) * 10;

    const units = segmentHeadword(word?.headword ?? '', languageCode);

    /* 2. Length — one factor, not the measure. */
    score += Math.max(0, units.length - 3) * 0.6;

    /* 3. Orthographic complexity: multi-character units and diacritics are
     *    harder to produce than plain letters, and this corpus is full of
     *    them (`oo` in 34.8% of headwords). */
    const profileUnits = profileFor(languageCode).units;
    const multiChar = units.filter((u) => profileUnits.includes(u)).length;
    score += multiChar * 0.8;
    const diacritics = units.filter((u) => u.normalize('NFD').length > u.length).length;
    score += diacritics * 0.8;

    /* 4. Task type: producing a word is harder than recognising one. */
    if (gameId && !isRecognitionGame(gameId)) score += 1.5;

    /* 5. Supporting material makes a question easier to answer, whatever the
     *    word. Audio only helps where the task involves hearing it. */
    if (word?.translation_en || word?.translation_fr) score -= 0.5;
    if (word?.english_definition || word?.definition) score -= 0.3;
    if (word?.audio_url) score -= 0.4;
    if (word?.example_sentences?.[0]?.sentence) score -= 0.3;

    /* 6. Prior exposure and prior performance on THIS word. A word already
     *    answered correctly is easier to ask again; one already missed is
     *    harder, and belongs earlier in a practice run rather than later. */
    if (history) {
        if (history.correct > 0) score -= Math.min(1.5, history.correct * 0.5);
        if (history.missed > 0) score += Math.min(1.5, history.missed * 0.5);
        if (history.seen > 0) score -= 0.3;
    }

    return score;
}

/* ── The rolling performance window ─────────────────────────────────────── */

/**
 * How many recent questions adaptation looks at.
 *
 * A window, and deliberately not lifetime XP: a player who has improved should
 * not be held back by a hundred old answers, and a player having a bad ten
 * minutes should recover within the same session.
 */
export const WINDOW_SIZE = 8;

/** The minimum evidence before anything adapts. One mistake changes nothing. */
export const MIN_EVIDENCE = 4;

/** An empty per-skill record. */
export function emptyPerformance() {
    return { recent: [] };
}

/**
 * Fold one outcome into a skill's rolling window.
 *
 * `timeMs` is stored but never scored — response time may help SEQUENCE
 * questions and must never on its own move a player toward easier material,
 * because a slow answer is as likely to be an interruption as a difficulty.
 */
export function recordOutcome(performance, { outcome, attempts, hintsUsed = 0, timeMs = 0 }) {
    const recent = [
        ...(performance?.recent ?? []),
        { outcome, attempts: Math.max(1, attempts ?? 1), hintsUsed, timeMs },
    ].slice(-WINDOW_SIZE);
    return { recent };
}

/** Summary of a rolling window. All rates are of the window, not of all time. */
export function summarize(performance) {
    const recent = performance?.recent ?? [];
    const n = recent.length;
    if (n === 0) {
        return { n: 0, firstAttemptRate: 0, retryRate: 0, hintRate: 0, skipRate: 0 };
    }
    const count = (fn) => recent.filter(fn).length;
    return {
        n,
        /* First-attempt accuracy: `correct` means first attempt unaided. */
        firstAttemptRate: count((r) => r.outcome === 'correct') / n,
        /* Got there, but needed a retry or help. */
        retryRate: count((r) => r.outcome === 'learning') / n,
        hintRate: count((r) => r.hintsUsed > 0) / n,
        skipRate: count((r) => r.outcome === 'skipped' || r.outcome === 'incorrect') / n,
    };
}

/* ── Adaptation ─────────────────────────────────────────────────────────── */

/** What adaptation can do. One step at a time, and reversible. */
export const ADJUST = {
    HARDER: 'harder',
    EASIER: 'easier',
    HOLD: 'hold',
};

/**
 * Player-facing wording for an adjustment. Simple, and never a judgement.
 */
export const ADJUST_MESSAGE = {
    [ADJUST.HARDER]: 'Ready for a little more challenge?',
    [ADJUST.EASIER]: "Let's practice this pattern again.",
    [ADJUST.HOLD]: null,
};

/**
 * Decide whether to adjust, from the rolling window.
 *
 * Conservative by construction:
 *   - nothing happens below `MIN_EVIDENCE` answers, so one mistake cannot move
 *     anything;
 *   - the thresholds are far from the middle, so ordinary variation holds;
 *   - the result is one step, and the opposite step is always reachable next
 *     time, which is what makes it reversible;
 *   - `timeMs` is not consulted.
 */
export function decideAdjustment(performance, { adaptive = true } = {}) {
    if (!adaptive) return ADJUST.HOLD;
    const s = summarize(performance);
    if (s.n < MIN_EVIDENCE) return ADJUST.HOLD;

    /* Struggling: taking retries, help, or leaving questions. Checked FIRST, so
     * a player who needs support gets it even if their accuracy looks high on a
     * small window. */
    if (s.skipRate >= 0.375 || s.retryRate + s.hintRate >= 0.625) return ADJUST.EASIER;

    /* Comfortable: getting most things first time, unaided. */
    if (s.firstAttemptRate >= 0.75 && s.hintRate <= 0.25) return ADJUST.HARDER;

    return ADJUST.HOLD;
}

/**
 * A per-skill, per-language difficulty offset.
 *
 * Bounded to ±2 so adaptation stays a nudge inside the chosen level rather
 * than a second level system. Mandinka spelling cannot move Mandinka listening
 * or another language: the caller keys this by `${languageCode}:${skill}`, and
 * `progressKey` is the one place that key is built.
 */
export const OFFSET_BOUND = 2;

export function progressKey(languageCode, skill) {
    return `${languageCode || 'unknown'}:${skill || SKILL.RECOGNITION}`;
}

/** Apply one adjustment step to an offset, clamped. */
export function applyAdjustment(offset, adjustment) {
    const current = Number.isFinite(offset) ? offset : 0;
    if (adjustment === ADJUST.HARDER) return Math.min(OFFSET_BOUND, current + 1);
    if (adjustment === ADJUST.EASIER) return Math.max(-OFFSET_BOUND, current - 1);
    return current;
}

/* ── Selecting and ordering a round ─────────────────────────────────────── */

/**
 * Order a deck for a level, with an adaptation offset.
 *
 * Returns words sorted easiest-first by `questionDifficulty`, then filtered to
 * the count requested. The offset shifts WHICH end of the level's range is
 * drawn from — it does not change any word's difficulty.
 *
 * IMPORTANT: this only ORDERS AND SELECTS. It never relaxes a playability rule,
 * so no offset and no performance history can produce a question a game cannot
 * play. `partitionSpellable` still runs in each spelling game, after this.
 */
export function selectForLevel(
    words,
    { level = LEVEL.PRACTICE, languageCode, gameId, offset = 0, count, historyFor } = {}
) {
    const profile = levelProfile(level);
    const scored = (words ?? []).map((word) => ({
        word,
        score: questionDifficulty(word, {
            languageCode,
            gameId,
            history: historyFor?.(word),
        }),
    }));

    /* Words in the level's own bands come first; others remain available rather
     * than being discarded, because a band-less word (26.4% of the corpus) must
     * still be playable. */
    const inBand = (w) =>
        profile.bands.includes(String(w?.difficulty ?? '').toUpperCase()) ? 0 : 1;

    scored.sort((a, b) => inBand(a.word) - inBand(b.word) || a.score - b.score);

    /* The offset walks the window along the sorted list: harder means start
     * further in. Bounded so it can never empty the round. */
    const wanted = Number.isFinite(count) && count > 0 ? Math.floor(count) : scored.length;
    const maxStart = Math.max(0, scored.length - wanted);
    const start = Math.min(maxStart, Math.max(0, Math.round(offset) * 2));

    return scored.slice(start, start + wanted).map((s) => s.word);
}
