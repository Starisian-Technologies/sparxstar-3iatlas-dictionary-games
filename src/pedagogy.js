/**
 * The learn-loop: one shared answer lifecycle for every game.
 *
 * ======================= WHY THIS EXISTS =======================
 *
 * The games tested whether a player already knew a word. They did not teach an
 * unfamiliar one. Six games had six different answers to "what happens when I
 * get it wrong", and three of those answers were wrong:
 *
 *   ArrangeWord        no failure path AT ALL. Wrong tiles shake and reset,
 *                      forever. No attempt counter, no hint, no skip, no
 *                      reveal, and no `onResult` — so the word is never
 *                      recorded, never reviewed, and the round cannot end.
 *                      A player who cannot spell the word is stuck.
 *   MeaningMatch       one tap, resolved, gone in 1500ms.
 *   DomainFlash        self-rated, single shot.
 *   CompleteSentence   3 attempts, then reveal — the closest to right.
 *   ListenWrite        3 attempts, then reveal.
 *   LetterReveal       5 wrong guesses, then reveal.
 *
 * And a scoring defect common to all of them: on failure they report the
 * outcome `learning`, which the engine's `dictionaryQuizManifest` scores at
 * **+5 XP**, while passing a local `xp` of 0. So a player who never got the
 * word right was paid five points server-side and shown zero. The local
 * display and the reward ledger disagreed, and the ledger was the generous one.
 *
 * ==================== THE APPROVED SCORING TABLE ====================
 *
 * XP is the ENGINE's to compute — it derives the award from `game_type` plus
 * `outcome` and ignores any client-supplied number (Reward Rail Contract §3).
 * So the client's job is to send the RIGHT OUTCOME, and to display the same
 * value the engine will settle. Mapping the approved table onto the outcomes
 * the manifest actually scores:
 *
 *   | Situation                      | outcome      | XP |
 *   | correct on the first attempt   | `correct`    | 10 |
 *   | correct after a retry or help  | `learning`   |  5 |
 *   | attempts exhausted             | `incorrect`  |  0 |
 *   | player chose Skip              | `skipped`    |  0 |
 *
 * `learning` means what the engine's manifest says it means: "a retry the
 * player worked through to completion". Reporting it for a word the player
 * never got right is what was paying for failure.
 *
 * Once per unique question per run, no negative scores, no streak multipliers —
 * all three are enforced by the engine (`game_question_awards`, a `>= 0`
 * database constraint, and a manifest with no bonus path). Nothing here can
 * grant XP; this module only names the outcome truthfully.
 *
 * ==================== WHAT IS A UX DECISION HERE ====================
 *
 * `DEFAULT_MAX_ATTEMPTS = 3` is a product decision, NOT a finding from either
 * paper. Neither paper prescribes a retry count. What the research supports is
 * the SHAPE — immediate feedback, another attempt, progressively stronger help,
 * the answer shown rather than withheld, and repetition later — and that shape
 * is what `docs/research-decisions.md` traces claim by claim. A game with a
 * reason to use a different count may pass its own, and `LetterReveal` does.
 * The invariant no game may opt out of is that nobody becomes trapped.
 */

/** The outcomes the engine's `dictionary_quiz` manifest scores. */
export const OUTCOME = {
    /** Correct, first attempt, unaided. */
    CORRECT: 'correct',
    /** Correct after a retry or with help — the manifest's own definition. */
    LEARNING: 'learning',
    /** Attempts exhausted, or the answer was revealed before being reached. */
    INCORRECT: 'incorrect',
    /** The player chose to move on. */
    SKIPPED: 'skipped',
};

/**
 * XP by outcome, mirroring the engine's manifest so the number a player SEES
 * is the number the ledger will hold.
 *
 * This is a mirror, not an authority. If the engine's manifest changes, this
 * changes to match it — never the other way round, and `src/__tests__` asserts
 * the two agree on every outcome.
 */
export const XP_BY_OUTCOME = {
    [OUTCOME.CORRECT]: 10,
    [OUTCOME.LEARNING]: 5,
    [OUTCOME.INCORRECT]: 0,
    [OUTCOME.SKIPPED]: 0,
};

/** XP for an outcome. Unknown outcomes are worth nothing, never NaN. */
export function xpFor(outcome) {
    return XP_BY_OUTCOME[outcome] ?? 0;
}

/** Outcomes that put a word into the review queue. */
export const REVIEWABLE_OUTCOMES = [OUTCOME.LEARNING, OUTCOME.INCORRECT, OUTCOME.SKIPPED];

/** Should a word with this outcome come back for reinforcement? */
export function needsReview(outcome) {
    return REVIEWABLE_OUTCOMES.includes(outcome);
}

/**
 * Default attempts before the answer is shown. A UX decision — see the header.
 */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** The two modes. Assistance differs; escape never does. */
export const MODE = {
    /** Hints, retries, reveal and later repetition are all expected. */
    PRACTICE: 'practice',
    /** Less help — but Skip, reveal and navigation remain available. */
    CHALLENGE: 'challenge',
};

/**
 * How much help is offered at each attempt, per mode.
 *
 * Level 0 is no hint. Higher levels are progressively stronger, and what each
 * level MEANS is the game's business — a spelling game reveals a letter, a
 * meaning game eliminates a distractor. This module only decides how strong the
 * help is allowed to be, so escalation is consistent across six games instead
 * of six different curves.
 *
 * Challenge mode holds help back one attempt. It does not remove it: a player
 * who cannot answer must still be able to finish, in either mode.
 */
export function hintLevelFor(attemptsUsed, mode = MODE.PRACTICE) {
    const offset = mode === MODE.CHALLENGE ? 1 : 0;
    return Math.max(0, attemptsUsed - offset);
}

/**
 * Begin a word.
 *
 * `maxAttempts` may be overridden by a game whose mechanic needs a different
 * structure; the reason belongs in that game's own comment.
 */
export function beginWord({ maxAttempts = DEFAULT_MAX_ATTEMPTS, mode = MODE.PRACTICE } = {}) {
    return {
        attemptsUsed: 0,
        hintsUsed: 0,
        /* Clamped through Number.isFinite, not just Math.max: `Math.max(1,
         * Math.floor(NaN))` is NaN, and `attemptsUsed >= NaN` is never true —
         * a word that can never resolve, which is the exact trap this module
         * exists to remove. A test asserts it. */
        maxAttempts: Number.isFinite(maxAttempts)
            ? Math.max(1, Math.floor(maxAttempts))
            : DEFAULT_MAX_ATTEMPTS,
        mode,
        /** null until resolved, then one of OUTCOME. */
        outcome: null,
        /** True once the answer has been shown to the player. */
        answerShown: false,
        startedAt: null,
    };
}

/** Start the clock. Separate from `beginWord` so a game can prepare a round
 *  before the player can see it, without charging them the setup time. */
export function startClock(attempt, now = Date.now()) {
    return { ...attempt, startedAt: now };
}

/** Elapsed milliseconds, or 0 if the clock never started. */
export function elapsedMs(attempt, now = Date.now()) {
    return attempt.startedAt === null ? 0 : Math.max(0, now - attempt.startedAt);
}

/**
 * Record an answer.
 *
 * Returns the next attempt state. When it is still unresolved the player gets
 * another try with a stronger hint; when `outcome` is set the round is over and
 * the caller must show the answer and wait for a deliberate Continue.
 *
 * A resolved attempt is IMMUTABLE: answering again returns it unchanged. That
 * is what stops a double-tap, a late keystroke, or a re-render from reporting a
 * second result for one question.
 */
export function recordAnswer(attempt, wasCorrect) {
    if (attempt.outcome !== null) return attempt;

    const attemptsUsed = attempt.attemptsUsed + 1;

    if (wasCorrect) {
        return {
            ...attempt,
            attemptsUsed,
            /* First attempt, no hint taken → full credit. Anything else is the
             * manifest's `learning`: got there, with help or on a retry. */
            outcome:
                attemptsUsed === 1 && attempt.hintsUsed === 0 ? OUTCOME.CORRECT : OUTCOME.LEARNING,
            answerShown: true,
        };
    }

    if (attemptsUsed >= attempt.maxAttempts) {
        /* Out of attempts. `incorrect`, which pays nothing — not `learning`,
         * which pays 5 for a word never reached. */
        return { ...attempt, attemptsUsed, outcome: OUTCOME.INCORRECT, answerShown: true };
    }

    return { ...attempt, attemptsUsed };
}

/** Take a hint. Costs no attempt, but forfeits first-attempt credit. */
export function useHint(attempt) {
    if (attempt.outcome !== null) return attempt;
    return { ...attempt, hintsUsed: attempt.hintsUsed + 1 };
}

/** Skip. Always available, in both modes, at any attempt. */
export function skip(attempt) {
    if (attempt.outcome !== null) return attempt;
    return { ...attempt, outcome: OUTCOME.SKIPPED, answerShown: true };
}

/**
 * Reveal the answer without skipping — the player gives up on answering but
 * wants to study the word. Scored as `incorrect`: nothing, and no penalty.
 */
export function revealAnswer(attempt) {
    if (attempt.outcome !== null) return attempt;
    return { ...attempt, outcome: OUTCOME.INCORRECT, answerShown: true };
}

/** Attempts left before the answer is shown. */
export function attemptsRemaining(attempt) {
    return Math.max(0, attempt.maxAttempts - attempt.attemptsUsed);
}

/** Is the round over? */
export function isResolved(attempt) {
    return attempt.outcome !== null;
}

/**
 * The current help level, from attempts AND hints taken.
 *
 * Hints raise the level directly so that asking for help gets stronger help,
 * rather than a player having to fail again to see more.
 */
export function currentHintLevel(attempt) {
    return hintLevelFor(attempt.attemptsUsed + attempt.hintsUsed, attempt.mode);
}

/**
 * The arguments a game hands to `onResult`.
 *
 * Deliberately derives `xp` from the outcome rather than accepting one: six
 * games previously each passed their own number (5, 8, 10) and none of them
 * matched what the engine would settle.
 */
export function resultFor(attempt, now = Date.now()) {
    return {
        outcome: attempt.outcome ?? OUTCOME.SKIPPED,
        attempts: Math.max(1, attempt.attemptsUsed),
        xp: xpFor(attempt.outcome ?? OUTCOME.SKIPPED),
        timeMs: elapsedMs(attempt, now),
    };
}
