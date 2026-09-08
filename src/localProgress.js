/**
 * Device-local play summary, for a player nobody has signed in.
 *
 * WHAT THIS DELIBERATELY DOES NOT PRODUCE: XP, stars, badges, or a rank.
 *
 * A guest has no account, so there is nothing for the engine to have settled
 * and nothing to rank them against. The tempting move is to add up what the XP
 * *would* be from the outcomes sitting in the outbox and show that — and it
 * would be wrong twice over. It would be a reward calculated in the browser,
 * which the engine alone is authorised to do (NODE-ADR-011); and it would be a
 * number the learner has no way to distinguish from a real one, so signing in
 * later and seeing a different total would read as the platform losing their
 * work rather than as the first number never having been real.
 *
 * So what comes back here is only what actually happened on this device:
 * counts of rounds and questions, and how those questions went. Those are
 * observations, not awards. They are honest at any moment, they cannot
 * contradict the server, and they are still worth showing — a guest who has
 * practised two hundred words should be able to see that.
 *
 * The source is the progress outbox, which for a guest is a complete record
 * rather than a queue: `game_result` events are never trimmed and never drain,
 * because draining requires a token (see `useProgressSync`). Once that player
 * signs in the same events flush to the engine and this view is replaced by
 * the server's own numbers — the local counts stop being the story rather than
 * being merged into it.
 */

/** Outcomes counted as an answered question. `skipped` is not one. */
const ANSWERED = new Set(['correct', 'learning', 'incorrect']);

/**
 * Summarise queued outbox events into a device-local play record.
 *
 * @param {Array<object>} events Outbox events as `useProgressSync` queues them.
 * @returns {{ rounds: number, answered: number, correct: number,
 *             learning: number, incorrect: number, skipped: number }}
 */
export function summariseLocalProgress(events) {
    const summary = {
        rounds: 0,
        answered: 0,
        correct: 0,
        learning: 0,
        incorrect: 0,
        skipped: 0,
    };
    if (!Array.isArray(events)) return summary;

    /* Rounds are counted by distinct run_id, not by event: twenty results from
     * one round are one round. An event without a run_id cannot be attributed
     * to one and is not counted as its own. */
    const runs = new Set();

    for (const event of events) {
        if (event?.type !== 'game_result') continue;
        if (typeof event.run_id === 'string' && event.run_id) runs.add(event.run_id);

        const outcome = event.outcome;
        if (outcome === 'correct') summary.correct += 1;
        else if (outcome === 'learning') summary.learning += 1;
        else if (outcome === 'incorrect') summary.incorrect += 1;
        else if (outcome === 'skipped') summary.skipped += 1;

        if (ANSWERED.has(outcome)) summary.answered += 1;
    }

    summary.rounds = runs.size;
    return summary;
}
