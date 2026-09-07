import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Minus, Sparkles } from 'lucide-react';
import {
    DICTIONARY_GAME_TYPE,
    StatsError,
    fetchAccountStats,
    fetchLeaderboard,
} from '../api/statsClient.js';
import { prefersReducedMotion } from './Celebration.jsx';
import { getRecord } from '../hooks/idbUtils.js';
import { OUTBOX_KEY } from '../hooks/useProgressSync.js';
import { summariseLocalProgress } from '../localProgress.js';

/**
 * StatsScreen — the player's own numbers, and where they stand.
 *
 * EVERY NUMBER ON THIS SCREEN CAME OFF THE WIRE. Rank, XP, ties, rank movement
 * and accuracy are all computed by the engine and rendered here unchanged;
 * there is no `index + 1`, no sort, no local tally, and no placeholder that
 * fills a gap with a plausible figure. That is not a stylistic preference — the
 * engine is the sole authority for scores and ranks (NODE-ADR-011), and a
 * client that derives one produces a second answer that disagrees with the
 * first exactly when it matters most: on a tie, on an unsettled result, or when
 * someone else's round lands between two page loads.
 *
 * NOT A TOP-TEN BOARD. A leaderboard that shows only the leaders tells a
 * learner ranked 47th nothing except that they are not on it, which is the
 * opposite of the point. So the engine returns `self_context` — the caller's
 * own row with its immediate neighbours — whenever the caller is ranked and off
 * the returned page, and this screen renders it as its own block. A learner
 * always sees their position and the places immediately above them.
 *
 * GUESTS SEE THEIR DEVICE, NOT A RANK. With no token there is no account, so
 * nothing has settled and there is nothing to rank against. Rather than an
 * empty board or an invented position, a guest gets the honest device-local
 * counts from `summariseLocalProgress` and a plain statement of what signing in
 * would add. See `src/localProgress.js` for why no XP figure appears there.
 *
 * Props:
 *   engineUrl      {string}   Engine base; omitted means the server surface is
 *                             not configured and only local progress shows.
 *   getSuiteToken  {Function} () => string|null|Promise — the host's token
 *                             accessor. Returning null IS the guest state.
 *   accountId      {string}   The account the token names. Required for the
 *                             owner-only self-stats call; the board works
 *                             without it, so its absence hides that card only.
 *   sourceLanguage {string}   The language being learned, used to scope the
 *                             Dictionary Games board.
 */

const PAGE_SIZE = 25;

/** The two ranking windows the engine supports, in the order they are offered. */
const WINDOWS = [
    { id: 'weekly', label: 'This week' },
    { id: 'all_time', label: 'All time' },
];

/**
 * The two boards this client offers.
 *
 * `all_games` carries NO game type, deliberately: an absent `game_type` means
 * every registered game, which is how a game registered next year appears here
 * without an edit to this file. Listing the known types and asking for them
 * one by one would produce a board that silently stops being "all games" the
 * first time the platform gains one.
 */
const BOARDS = [
    { id: 'dictionary', label: 'Dictionary Games', scope: 'game', gameType: DICTIONARY_GAME_TYPE },
    { id: 'all', label: 'All Games', scope: 'all_games', gameType: null },
];

/** Format an epoch-ms server timestamp for display, or null if absent. */
function formatDate(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
    try {
        return new Date(ms).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return null;
    }
}

/**
 * The engine's `accuracy` (0..1, or null) as a percentage string.
 *
 * null is rendered as an em dash and never as 0%: nothing answered yet is not
 * the same as everything answered wrongly, and the engine is careful to
 * distinguish them precisely so this screen can too.
 */
function accuracyLabel(accuracy) {
    if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) return '—';
    return `${Math.round(accuracy * 100)}%`;
}

/**
 * Rank movement since the previous comparable period.
 *
 * The direction is SERVER-SUPPLIED — this renders `entry.movement`, it does not
 * compare anything. Three things carry the meaning and only one of them is
 * colour: an arrow glyph, a text label in the accessible name, and the colour.
 * A player who cannot distinguish red from green, or who is listening rather
 * than looking, gets the same information.
 */
function Movement({ movement }) {
    const shown = {
        up: { Icon: ArrowUp, label: 'moved up', color: '#009688' },
        down: { Icon: ArrowDown, label: 'moved down', color: '#D32F2F' },
        unchanged: { Icon: Minus, label: 'unchanged', color: '#6B7280' },
        new: { Icon: Sparkles, label: 'new this period', color: '#E91E8C' },
    }[movement];

    /* An unrecognised value renders nothing rather than a guess. A future
     * movement kind should appear as absent here, not as "unchanged". */
    if (!shown) return null;

    const { Icon, label, color } = shown;
    return (
        <span className="inline-flex items-center" style={{ color }}>
            <Icon size={16} aria-hidden="true" />
            <span className="sr-only">{label}</span>
        </span>
    );
}

/**
 * A rank, said the way the engine reported it.
 *
 * `tied` comes from the server rather than from noticing two equal numbers in
 * the list — and it has to, because the rows sharing a rank are frequently on a
 * different page, or on no page the client ever sees.
 */
function rankLabel(entry) {
    return entry.tied ? `Joint ${entry.rank}` : `${entry.rank}`;
}

function BoardRow({ entry }) {
    const self = entry.is_self === true;
    return (
        <li
            /* `aria-current` and a visible "You" chip, not just a background
             * tint: the highlight has to survive a screen reader and a
             * high-contrast theme, both of which discard the tint. */
            aria-current={self ? 'true' : undefined}
            className={[
                'flex items-center gap-3 rounded-xl px-3 py-2.5',
                self
                    ? 'border-2 bg-pink-50 dark:bg-pink-950/30'
                    : 'border border-gray-200 dark:border-gray-700',
            ].join(' ')}
            style={self ? { borderColor: '#E91E8C' } : undefined}
        >
            <span
                className="w-14 shrink-0 text-base font-bold text-gray-900 dark:text-gray-100"
                aria-label={entry.tied ? `Joint rank ${entry.rank}` : `Rank ${entry.rank}`}
            >
                {rankLabel(entry)}
            </span>
            <Movement movement={entry.movement} />
            <span className="min-w-0 flex-1 truncate text-base text-gray-800 dark:text-gray-100">
                {entry.screen_name}
                {self && (
                    <span
                        className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ background: '#E91E8C' }}
                    >
                        You
                    </span>
                )}
            </span>
            <span
                className="shrink-0 text-base font-semibold"
                style={{ color: '#009688' }}
                aria-label={`${entry.xp} XP`}
            >
                {entry.xp} XP
            </span>
        </li>
    );
}

function StatTile({ label, value }) {
    return (
        <div className="flex-1 rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
            <p className="text-xl font-bold" style={{ color: '#E91E8C' }}>
                {value}
            </p>
            <p className="mt-0.5 text-sm leading-snug text-gray-600 dark:text-gray-300">{label}</p>
        </div>
    );
}

export default function StatsScreen({
    engineUrl = null,
    getSuiteToken = null,
    accountId = null,
    sourceLanguage = null,
}) {
    const [boardId, setBoardId] = useState(BOARDS[0].id);
    const [windowId, setWindowId] = useState(WINDOWS[0].id);

    const [token, setToken] = useState(undefined); // undefined = not yet resolved
    const [board, setBoard] = useState(null);
    const [pages, setPages] = useState([]); // accumulated entries across pages
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [local, setLocal] = useState(null);

    const [reduced] = useState(() => prefersReducedMotion());

    const selected = useMemo(() => BOARDS.find((b) => b.id === boardId) ?? BOARDS[0], [boardId]);

    /* Resolve the token once per mount. Held in state rather than called during
     * render so the guest branch is a settled fact the screen can render from,
     * not a promise every child has to wait on. */
    useEffect(() => {
        let cancelled = false;
        if (typeof getSuiteToken !== 'function') {
            setToken(null);
            return undefined;
        }
        Promise.resolve()
            .then(() => getSuiteToken())
            .then((value) => {
                if (!cancelled) setToken(value || null);
            })
            .catch(() => {
                if (!cancelled) setToken(null);
            });
        return () => {
            cancelled = true;
        };
    }, [getSuiteToken]);

    /* The guest's device-local record. Loaded whenever there is no token —
     * including after a sign-out — because that is exactly when it is the only
     * record of what this player has done. */
    useEffect(() => {
        if (token !== null) return undefined;
        let cancelled = false;
        Promise.resolve()
            .then(() =>
                typeof getRecord === 'function' ? getRecord('progress-outbox', OUTBOX_KEY) : null
            )
            .then((record) => {
                if (!cancelled) setLocal(summariseLocalProgress(record?.events ?? []));
            })
            .catch(() => {
                if (!cancelled) setLocal(summariseLocalProgress([]));
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    /*
     * Load the board and the caller's own stats.
     *
     * IN PARALLEL, not in sequence. The board does not need anything from the
     * self-stats response — the engine derives the caller's band and population
     * from their own account — so chaining them would put two round trips in
     * front of the first paint on a connection that can least afford them.
     *
     * A failed self-stats call does not take the board down with it, and the
     * reverse holds too: they are separate surfaces with separate permissions
     * (self-stats is owner-only), and a learner who can see the board should
     * see it even if their own card cannot load.
     */
    const load = useCallback(
        async (signal) => {
            if (!token || !engineUrl) return;
            setLoading(true);
            setError(null);

            const boardPromise = fetchLeaderboard({
                engineUrl,
                token,
                window: windowId,
                scope: selected.scope,
                gameType: selected.gameType,
                /* Scope the Dictionary board to the language actually being
                 * learned; the all-games board spans languages by definition. */
                language: selected.scope === 'game' ? sourceLanguage : null,
                limit: PAGE_SIZE,
                signal,
            });

            const statsPromise = accountId
                ? fetchAccountStats({ engineUrl, token, accountId, signal }).catch(() => null)
                : Promise.resolve(null);

            try {
                const [boardResult, statsResult] = await Promise.all([boardPromise, statsPromise]);
                if (signal?.aborted) return;
                setBoard(boardResult);
                setPages(Array.isArray(boardResult?.entries) ? boardResult.entries : []);
                setStats(statsResult);
            } catch (err) {
                if (err?.name === 'AbortError' || signal?.aborted) return;
                setBoard(null);
                setPages([]);
                setError(
                    err instanceof StatsError && err.code === 'unauthorized'
                        ? 'Your session has expired. Sign in again to see your ranking.'
                        : 'Could not load the leaderboard. Check your connection and try again.'
                );
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [token, engineUrl, windowId, selected, sourceLanguage, accountId]
    );

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    /*
     * Next page, by the engine's opaque cursor.
     *
     * Keyset, not offset: ranks move while someone is reading, and an offset
     * page would then repeat or skip rows across the boundary. The cursor is
     * never parsed or constructed here — it is echoed back exactly as received.
     */
    const loadMore = useCallback(async () => {
        const cursor = board?.next_cursor;
        if (!cursor || !token || !engineUrl || loadingMore) return;
        setLoadingMore(true);
        try {
            const next = await fetchLeaderboard({
                engineUrl,
                token,
                window: windowId,
                scope: selected.scope,
                gameType: selected.gameType,
                language: selected.scope === 'game' ? sourceLanguage : null,
                limit: PAGE_SIZE,
                cursor,
            });
            setBoard(next);
            setPages((prev) => [...prev, ...(Array.isArray(next?.entries) ? next.entries : [])]);
        } catch {
            setError('Could not load more of the leaderboard.');
        } finally {
            setLoadingMore(false);
        }
    }, [board, token, engineUrl, windowId, selected, sourceLanguage, loadingMore]);

    const transition = reduced ? '' : 'transition-colors';

    /* ── Guest: device-local counts, and no rank ── */
    if (token === null) {
        return (
            <section className="flex flex-1 flex-col gap-5 p-4" aria-labelledby="stats-heading">
                <h2
                    id="stats-heading"
                    className="text-xl font-bold text-gray-900 dark:text-gray-100"
                >
                    Your progress
                </h2>
                <p className="text-base text-gray-700 dark:text-gray-200">
                    You are playing as a guest, so this is what you have done on this device. Sign
                    in to earn XP on your account and see where you rank.
                </p>
                {local && (
                    <div className="flex gap-3">
                        <StatTile label="Rounds played" value={local.rounds} />
                        <StatTile label="Words answered" value={local.answered} />
                        <StatTile label="Answered correctly" value={local.correct} />
                    </div>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Guest progress is stored only on this device. It is sent to your account the
                    first time you sign in — nothing you have already played is lost.
                </p>
            </section>
        );
    }

    /* ── Token not resolved yet ── */
    if (token === undefined) {
        return (
            <section className="flex flex-1 items-center justify-center p-8" aria-busy="true">
                <Loader2
                    className={reduced ? '' : 'animate-spin'}
                    style={{ color: '#E91E8C' }}
                    size={32}
                    aria-hidden="true"
                />
                <span className="sr-only">Loading your progress</span>
            </section>
        );
    }

    /* ── Server surface not configured ── */
    if (!engineUrl) {
        return (
            <section className="flex flex-1 flex-col gap-4 p-4" aria-labelledby="stats-heading">
                <h2
                    id="stats-heading"
                    className="text-xl font-bold text-gray-900 dark:text-gray-100"
                >
                    Your progress
                </h2>
                <p className="text-base text-gray-700 dark:text-gray-200">
                    Rankings are not available in this build.
                </p>
            </section>
        );
    }

    const windowStarted = formatDate(board?.window_started_at);
    const generated = formatDate(board?.generated_at);
    const selfStats = stats ? stats[windowId] : null;

    return (
        <section className="flex flex-1 flex-col gap-5 p-4" aria-labelledby="stats-heading">
            <h2 id="stats-heading" className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Your progress
            </h2>

            {/* Which board */}
            <div role="group" aria-label="Choose a leaderboard" className="flex flex-wrap gap-2">
                {BOARDS.map((b) => (
                    <button
                        key={b.id}
                        type="button"
                        aria-pressed={b.id === boardId}
                        onClick={() => setBoardId(b.id)}
                        className={`min-h-[44px] rounded-full px-4 text-base font-medium ${transition} ${
                            b.id === boardId
                                ? 'text-white'
                                : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
                        }`}
                        style={b.id === boardId ? { background: '#E91E8C' } : undefined}
                    >
                        {b.label}
                    </button>
                ))}
            </div>

            {/* Which window */}
            <div role="group" aria-label="Choose a time period" className="flex flex-wrap gap-2">
                {WINDOWS.map((w) => (
                    <button
                        key={w.id}
                        type="button"
                        aria-pressed={w.id === windowId}
                        onClick={() => setWindowId(w.id)}
                        className={`min-h-[44px] rounded-full px-4 text-base font-medium ${transition} ${
                            w.id === windowId
                                ? 'text-white'
                                : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
                        }`}
                        style={w.id === windowId ? { background: '#009688' } : undefined}
                    >
                        {w.label}
                    </button>
                ))}
            </div>

            {/* The player's own numbers */}
            {selfStats && (
                <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                        <StatTile label="XP" value={selfStats.xp} />
                        <StatTile
                            label="Your rank"
                            /* An em dash, not a 0 and not a guess: `rank: null`
                             * means the engine has nothing ranked for this
                             * window, which is a real state and not an error. */
                            value={selfStats.rank === null ? '—' : selfStats.rank}
                        />
                        <StatTile label="Games played" value={selfStats.games_played} />
                    </div>
                    <div className="flex gap-3">
                        <StatTile label="Accuracy" value={accuracyLabel(selfStats.accuracy)} />
                        {/* Stars are a settled ledger count, so they are shown
                         * as reported — including zero. Badges are shown only
                         * once something has actually awarded one: nothing
                         * writes badge rows yet, and a permanent "0 badges"
                         * advertises a feature that does not exist. */}
                        <StatTile label="Stars" value={stats.stars} />
                        {stats.badges > 0 && <StatTile label="Badges" value={stats.badges} />}
                    </div>
                    {selfStats.rank === null && (
                        <p className="text-base text-gray-700 dark:text-gray-200">
                            You are not ranked in this period yet. Finish a round to take a place on
                            the board.
                        </p>
                    )}
                </div>
            )}

            {/* The board */}
            {loading && (
                <div className="flex items-center justify-center gap-3 py-8" aria-busy="true">
                    <Loader2
                        className={reduced ? '' : 'animate-spin'}
                        style={{ color: '#E91E8C' }}
                        size={28}
                        aria-hidden="true"
                    />
                    <span className="text-base text-gray-600 dark:text-gray-300">
                        Loading the leaderboard&hellip;
                    </span>
                </div>
            )}

            {error && !loading && (
                <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                    {error}
                </p>
            )}

            {!loading && !error && board && pages.length === 0 && (
                <p className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center text-base text-gray-600 dark:border-gray-700 dark:text-gray-300">
                    Nobody has scored on this board yet. Play a round and you will be first.
                </p>
            )}

            {!loading && !error && pages.length > 0 && (
                <>
                    {/* `aria-live` so a window or board switch is announced
                     * rather than silently replacing what was read a moment
                     * ago. Polite: it must not interrupt. */}
                    <ol className="flex flex-col gap-2" aria-live="polite">
                        {pages.map((entry) => (
                            <BoardRow key={`${entry.rank}:${entry.screen_name}`} entry={entry} />
                        ))}
                    </ol>

                    {board.next_cursor && (
                        <button
                            type="button"
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="min-h-[44px] self-center rounded-xl border border-gray-300 px-5 text-base font-semibold text-gray-700 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
                        >
                            {loadingMore ? 'Loading…' : 'Show more'}
                        </button>
                    )}

                    {/* The learner's own position when it is off the page. This
                     * is the block that makes a long board usable: it names the
                     * places immediately above, which are the ones actually
                     * within reach. */}
                    {Array.isArray(board.self_context) && board.self_context.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                Where you are
                            </h3>
                            <ol className="flex flex-col gap-2">
                                {board.self_context.map((entry) => (
                                    <BoardRow
                                        key={`self:${entry.rank}:${entry.screen_name}`}
                                        entry={entry}
                                    />
                                ))}
                            </ol>
                        </div>
                    )}
                </>
            )}

            {/* Which window this ranking covers, from the server's own clock —
             * so a board read from a cache or an offline page cannot silently
             * present itself as current. */}
            {board && !loading && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {windowStarted ? `Ranking since ${windowStarted}.` : 'Ranking over all time.'}
                    {generated ? ` Updated ${generated}.` : ''}
                </p>
            )}

            {/* How the points are earned. Stated plainly, and without naming a
             * per-outcome amount: the engine owns the reward table and a number
             * copied into this paragraph would go stale the first time it
             * changed, with nothing to catch it. */}
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    How points are earned
                </h3>
                <ul className="mt-2 list-disc pl-5 text-base text-gray-700 dark:text-gray-200">
                    <li>You earn XP for each word you answer in a round.</li>
                    <li>
                        Getting a word right earns the most. Working a word out with a hint still
                        earns — asking for help is part of learning, not a penalty.
                    </li>
                    <li>
                        Each word in a round can earn once. Replaying the same round again does not
                        earn twice.
                    </li>
                    <li>
                        Players with the same XP share the same rank, shown as{' '}
                        <span className="font-semibold">Joint</span>.
                    </li>
                </ul>
            </div>
        </section>
    );
}
