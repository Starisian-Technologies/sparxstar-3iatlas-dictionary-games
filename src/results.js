/**
 * How a round went, and what to say about it.
 *
 * ======================= WHY THIS IS A MODULE =========================
 *
 * Every finished round got the same screen: a gold trophy, confetti, and
 * "Session complete!". A player who answered nothing correctly and earned zero
 * XP was congratulated in exactly the words and with exactly the fanfare of a
 * player who got everything right. That is not encouragement — it tells the
 * learner the app is not watching, and it makes the celebration worthless when
 * it IS deserved.
 *
 * The grading lives here, apart from the screen, so the words and the tier can
 * be tested directly rather than by reading pixels, and so nothing in the UI
 * can invent a result the numbers do not support.
 *
 * ======================= WHAT IT NEVER DOES ===========================
 *
 * It reads `session.results` — the recorded outcomes — and nothing else. It
 * does not compute XP (the engine settles that), does not decide awards (see
 * `src/awards.js`), and never reports a streak or a best that the results do
 * not show. A celebration for something that did not happen is the same defect
 * as a missing one, arrived at from the other side.
 */

/**
 * The four endings.
 *
 * PERFECT is separate from STRONG because the brief asks for the largest
 * celebration to be reserved for a perfect round; if every good round looks
 * the same, nothing is worth reaching for.
 */
export const RESULT = {
    PERFECT: 'perfect',
    STRONG: 'strong',
    PARTIAL: 'partial',
    PRACTICE: 'practice',
};

/**
 * Where the boundaries sit.
 *
 * A STARTING POLICY, not a finding — the same status as every other threshold
 * in this codebase, and overridable for the same reason. What is NOT a policy
 * choice is the shape: a round with nothing right must never present as a win.
 */
export const RESULT_POLICY = {
    /** Share of answered questions correct, at or above which a round is strong. */
    strong: 0.7,
    /** ...and at or above which it is partial rather than needing practice. */
    partial: 0.4,
    /** A run of correct answers worth naming. Two is not a streak. */
    streak: 3,
};

/** The longest run of consecutive correct answers in a round. */
export function longestStreak(results) {
    let best = 0;
    let run = 0;
    for (const result of results ?? []) {
        if (result?.outcome === 'correct') {
            run += 1;
            if (run > best) best = run;
        } else {
            run = 0;
        }
    }
    return best;
}

/**
 * Grade a finished session.
 *
 * @param {object} session A completed session from `useGameSession`.
 * @param {object} [policy]
 * @returns {{
 *   tier: string, total: number, answered: number, correct: number,
 *   learning: number, incorrect: number, skipped: number, reviewing: number,
 *   accuracy: number, streak: number,
 * }}
 */
export function gradeSession(session, policy = RESULT_POLICY) {
    const results = session?.results ?? [];
    const total = session?.words?.length ?? 0;
    const correct = results.filter((r) => r.outcome === 'correct').length;
    const learning = results.filter((r) => r.outcome === 'learning').length;
    const incorrect = results.filter((r) => r.outcome === 'incorrect').length;
    const skipped = results.filter((r) => r.outcome === 'skipped').length;
    const answered = results.length;
    /*
     * "To review" overlaps the outcome counts on purpose — it is the union of
     * everything `Practise these words` would replay, not a fifth exclusive
     * category. It is never added into a total.
     */
    const reviewing = learning + incorrect + skipped;
    /*
     * THERE IS DELIBERATELY NO `xp` IN THIS GRADE.
     *
     * It used to return `session.xpEarned` — accumulated on this device from
     * the local `xpFor(outcome)` table, with no ledger row and no settlement
     * identifier behind it — and `SessionComplete` rendered it as "Points
     * earned". INV-016 (Accepted 2026-09-05, binding platform-wide): "No client
     * may originate, compute, or infer earned value… It may never derive the
     * award itself from round performance… or answer counts."
     *
     * Removing the display was not enough. A grade that still CARRIES a points
     * figure is a loaded gun: the next screen that wants a number finds one
     * already computed and reaches for it. The figure is gone from the model,
     * so there is nothing to reach for. Awards come from a settlement response
     * or they are not shown.
     */
    const accuracy = answered === 0 ? 0 : correct / answered;
    const streak = longestStreak(results);

    let tier;
    if (answered === 0) tier = RESULT.PRACTICE;
    else if (correct === answered && answered > 0) tier = RESULT.PERFECT;
    else if (accuracy >= policy.strong) tier = RESULT.STRONG;
    else if (accuracy >= policy.partial) tier = RESULT.PARTIAL;
    else tier = RESULT.PRACTICE;

    return {
        tier,
        total,
        answered,
        correct,
        learning,
        incorrect,
        skipped,
        reviewing,
        accuracy,
        streak,
    };
}

/** `n word` / `n words`, so no line has to read "1 words". */
function plural(count, singular, pluralForm = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * What to say about a graded round.
 *
 * Short sentences, ordinary words, and nothing a new reader has to decode.
 * Nothing here ever tells a learner they failed: the practice tier names the
 * ROUND as tough, never the player, and always points at the next thing to do.
 *
 * @returns {{headline: string, detail: string, action: string}}
 */
export function resultMessage(grade) {
    const { tier, correct, reviewing } = grade;

    switch (tier) {
        case RESULT.PERFECT:
            return {
                headline: 'Perfect round!',
                detail: `You got every word right — ${plural(correct, 'word')} in a row.`,
                action: 'Play again',
            };

        case RESULT.STRONG:
            return {
                headline: 'Excellent work!',
                detail:
                    reviewing > 0
                        ? `You worked out ${plural(correct, 'word')}. ${plural(
                              reviewing,
                              'word is',
                              'words are'
                          )} ready to practise.`
                        : `You worked out ${plural(correct, 'word')}.`,
                action: 'Play again',
            };

        case RESULT.PARTIAL:
            return {
                headline: 'Good progress.',
                detail: `${plural(correct, 'word')} worked out, and ${plural(
                    reviewing,
                    'word is',
                    'words are'
                )} ready to practise.`,
                action: 'Practise these words',
            };

        case RESULT.PRACTICE:
        default:
            /*
             * A round with NOTHING to practise still lands here — an answered
             * count of zero grades as PRACTICE — and the screen's primary
             * button falls back to `onPlayAgain` when `reviewing` is 0. Naming
             * that button "Practise these words" made it say one thing and do
             * another, with no words to practise either way.
             */
            if (reviewing === 0) {
                return {
                    headline: 'That was a tough round.',
                    detail:
                        correct > 0
                            ? `You worked out ${plural(correct, 'word')}.`
                            : 'No questions were answered this time.',
                    action: 'Play again',
                };
            }
            return {
                headline: 'That was a tough round.',
                detail:
                    correct > 0
                        ? `You worked out ${plural(correct, 'word')}. Let's practise the rest.`
                        : "Let's practise these words together.",
                action: 'Practise these words',
            };
    }
}

/** Is this a tier that has earned a celebration? */
export function isWin(tier) {
    return tier === RESULT.PERFECT || tier === RESULT.STRONG;
}
