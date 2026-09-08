import React from 'react';
import { BarChart3, Home, RotateCcw } from 'lucide-react';

/**
 * GameNav — the escape hatch that must exist in every gameplay state.
 *
 * The defect this fixes: once a round started there was no way out. The in-play
 * header carried a Level control and an `Adaptive:` toggle and nothing else, so
 * a player who opened the wrong game, or simply wanted to stop, had no route
 * back short of reloading the page — and reloading resumed the same session.
 *
 * So this bar is deliberately unconditional. It renders in `playing`,
 * `loading`, `complete` and error states alike, because a state that renders
 * without it is exactly the trap that was shipped. `GameShell` renders it once,
 * outside the per-phase branches, rather than each branch remembering to.
 *
 * `onHome` is REQUIRED, not optional. An earlier version of this screen took an
 * `onBrowse` callback that the host app wired to an empty function, which is
 * how a dead control reached production looking like a live one. A missing
 * handler here is a programming error and should be loud, not silent.
 *
 * Props:
 *   gameName   {string}    Current game's display name, or null outside play
 *   questionAt {number}    1-based index of the current question, or null
 *   questionOf {number}    Length of the current deck, or null
 *   points     {number}    XP earned so far this session
 *   onHome     {Function}  REQUIRED — leave the game and return to the menu
 *   onRestart  {Function}  Restart this game; omitted outside gameplay
 *   onStats    {Function}  Open the progress/leaderboard screen. OPTIONAL, and
 *                          omitted means no button — the same rule `onBrowse`
 *                          taught: a host that has not wired this surface gets
 *                          no control, rather than a control that does nothing.
 *   identity   {node}      Sign-in state supplied by the host app
 */
export default function GameNav({
    gameName = null,
    questionAt = null,
    questionOf = null,
    points = 0,
    onHome,
    onRestart = null,
    onStats = null,
    identity = null,
}) {
    const showProgress =
        Number.isFinite(questionAt) && Number.isFinite(questionOf) && questionOf > 0;

    return (
        <nav
            aria-label="Game navigation"
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        >
            <button
                type="button"
                onClick={onHome}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
                <Home size={16} aria-hidden="true" />
                Games Home
            </button>

            {onRestart && (
                <button
                    type="button"
                    onClick={onRestart}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                    <RotateCcw size={16} aria-hidden="true" />
                    Restart
                </button>
            )}

            {onStats && (
                <button
                    type="button"
                    onClick={onStats}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                    <BarChart3 size={16} aria-hidden="true" />
                    Progress
                </button>
            )}

            {gameName && (
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {gameName}
                </span>
            )}

            {showProgress && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    {questionAt} / {questionOf}
                </span>
            )}

            <span className="ml-auto flex items-center gap-3">
                {/*
                 * Points, live. Stars would sit beside this — the brief asks
                 * for them — but no canonical star rule exists for the
                 * dictionary games and RLC spec v4.0 §1.6 places stars with
                 * myCred, not with this client. Rendering an invented number
                 * here would be worse than rendering none, so the slot is
                 * deliberately empty until the rule is decided. See
                 * `docs/ux-conformance-audit.md`.
                 */}
                <span
                    className="text-sm font-semibold"
                    style={{ color: '#009688' }}
                    aria-label={`${points} points this session`}
                >
                    {points} pts
                </span>
                {identity}
            </span>
        </nav>
    );
}
