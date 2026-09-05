/**
 * Recently-served word memory, and the unbiased shuffle that uses it.
 *
 * WHY THIS EXISTS. The three-pool mix in `difficulty.js` was correct about
 * *which* words a round may contain and silent about *which of them* it picks:
 * `take()` walked each pool from the front of a deterministic sort, so the same
 * corpus and the same band produced the same round forever. A learner saw one
 * fixed pack of words every session — repetition the system never intended and
 * could not distinguish from the deliberate review pool.
 *
 * The fix is variation strictly INSIDE each permitted pool. Nothing here widens
 * eligibility. Approval, domain, playability, skill, orthographic-unit ceiling
 * and difficulty band are decided before this module is reached and are never
 * relaxed by it — the only thing that relaxes, and only when a pool cannot fill
 * a round, is how far back the recent memory reaches.
 *
 * WHAT IS STORED. Entry ids and nothing else. No headword, no gloss, no audio,
 * no rights field — none of it is written to the device. The ring is bounded,
 * so it cannot grow into a shadow copy of the corpus.
 */

/**
 * How many recently-served ids to remember.
 *
 * Chosen against the round size, not the corpus: a session deals ~10 words, so
 * 120 covers roughly a dozen recent sessions. Large enough that a learner does
 * not meet the same word two sessions running; small enough that a modest
 * approved corpus is never fully excluded, and bounded so the stored list has a
 * fixed ceiling regardless of how long someone plays.
 */
export const RECENT_LIMIT = 120;

/** An empty recent-memory record. */
export function emptyRecent() {
    return { ids: [] };
}

/**
 * Record ids as most-recently served.
 *
 * Newest last. Re-serving a word moves it to the newest end rather than
 * duplicating it, so the ring holds distinct ids and its length is a true
 * count of distinct recent words.
 *
 * @param {{ids: string[]}} recent
 * @param {string[]} ids
 * @returns {{ids: string[]}} a new record; the input is not mutated
 */
export function remember(recent, ids) {
    const incoming = (ids ?? []).filter((id) => typeof id === 'string' && id.length > 0);
    if (incoming.length === 0) return { ids: [...(recent?.ids ?? [])] };
    const fresh = new Set(incoming);
    const kept = (recent?.ids ?? []).filter((id) => !fresh.has(id));
    /* Bounded at the OLDEST end: the newest ids always survive. */
    return { ids: [...kept, ...incoming].slice(-RECENT_LIMIT) };
}

/**
 * The set of ids to avoid, allowing the oldest memory to be forgotten first.
 *
 * `forget` drops that many entries from the OLD end. That ordering is the whole
 * point: when a pool is too small to fill a round, the words a learner saw
 * longest ago come back first, and the ones they just saw stay excluded
 * longest. Relaxing from the newest end would hand back the word they finished
 * thirty seconds ago.
 *
 * @param {{ids: string[]}} recent
 * @param {number} forget  how many of the oldest ids to release
 * @returns {Set<string>}
 */
export function excludedIds(recent, forget = 0) {
    const ids = recent?.ids ?? [];
    const drop = Math.max(0, Math.min(ids.length, Math.floor(forget)));
    return new Set(drop > 0 ? ids.slice(drop) : ids);
}

/**
 * Fisher–Yates shuffle, unbiased.
 *
 * Deliberately NOT `arr.sort(() => Math.random() - 0.5)`. That idiom is the
 * common way to do this and it is wrong: the comparator is inconsistent, so the
 * permutation it produces is not uniform and its bias depends on the engine's
 * sort implementation. For a literacy tool that means some approved words are
 * quietly served far less often than others — a fairness problem, not a
 * cosmetic one.
 *
 * `rng` is injectable so tests can assert distribution against a known
 * sequence rather than hoping randomness cooperates.
 *
 * @template T
 * @param {T[]} items
 * @param {() => number} [rng] returns [0, 1)
 * @returns {T[]} a new array; the input is not mutated
 */
export function shuffle(items, rng = Math.random) {
    const out = [...(items ?? [])];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
