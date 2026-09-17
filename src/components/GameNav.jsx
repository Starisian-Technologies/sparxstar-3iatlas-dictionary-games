import React from 'react';
import { BarChart3, Home, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { COLOR, SHELL } from '../theme.js';

/**
 * GameNav — the 3iAtlas header, and the escape hatch that must exist in every
 * gameplay state.
 *
 * ==================== THE ESCAPE HATCH (UNCHANGED) ====================
 *
 * The defect this fixes: once a round started there was no way out. The in-play
 * header carried a Level control and an `Adaptive:` toggle and nothing else, so
 * a player who opened the wrong game had no route back short of reloading the
 * page — and reloading resumed the same session.
 *
 * So this bar is deliberately unconditional. It renders in `playing`,
 * `loading`, `complete` and error states alike, because a state that renders
 * without it is exactly the trap that was shipped.
 *
 * `onHome` is REQUIRED, not optional. An earlier version took an `onBrowse`
 * callback that the host wired to an empty function, which is how a dead
 * control reached production looking like a live one.
 *
 * ==================== THE SHELL (NEW) ================================
 *
 * The chrome is WordPad's, because WordPad is the visual reference for the
 * 3iAtlas family: the cyan "3i" badge, the product name beside it, slate
 * surfaces, and the thin blue-gray border under it all. The values live in
 * `src/theme.js` with the file each was read from. A player moving between
 * WordPad and the games should not have to work out that they are the same
 * family.
 *
 * Props:
 *   gameName   {string}    Current game's display name, or null outside play
 *   questionAt {number}    1-based index of the current question, or null
 *   questionOf {number}    Length of the current deck, or null
 *   onHome     {Function}  REQUIRED — leave the game and return to the menu
 *   onRestart  {Function}  Restart this game; omitted outside gameplay
 *   onStats    {Function}  Open the progress screen. OPTIONAL, and omitted
 *                          means no button — the same rule `onBrowse` taught.
 *   soundOn    {boolean}   Whether game sounds are on. OPTIONAL; omitting
 *                          `onToggleSound` removes the control entirely.
 *   onToggleSound {Function} OPTIONAL.
 *   identity   {node}      Sign-in state supplied by the host app
 *   showBrand  {boolean}   Render the 3i badge and product name. OFF by
 *                          default: a host with its own 3iAtlas header would
 *                          otherwise show the product name twice. A bare mount
 *                          turns it on.
 */

export default function GameNav({
    gameName = null,
    questionAt = null,
    questionOf = null,
    onHome,
    onRestart = null,
    onStats = null,
    soundOn = true,
    onToggleSound = null,
    identity = null,
    showBrand = false,
}) {
    const showProgress =
        Number.isFinite(questionAt) && Number.isFinite(questionOf) && questionOf > 0;

    /* One button shape for the whole bar. 44px is the floor for a child's
     * fingertip on a tablet, and it is a floor rather than a target. */
    const control =
        'flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ' +
        'border-slate-300 text-slate-700 hover:bg-slate-100 ' +
        'dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors';

    return (
        <nav
            aria-label="Game navigation"
            className={`flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 ${SHELL.border} ${SHELL.surface}`}
        >
            {/*
             * The family mark, and ONLY when the host has not already shown
             * one. The games site renders its own 3iAtlas header above this
             * bar, so printing the badge and the product name again put
             * "Dictionary Games" on screen twice, six pixels apart. A host
             * that mounts `GameShell` bare still gets the mark.
             */}
            {showBrand && (
                <span className="mr-1 flex items-center gap-2">
                    <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ background: COLOR.badge }}
                        aria-hidden="true"
                    >
                        3i
                    </span>
                    <span className="hidden text-xs font-bold leading-none text-slate-800 dark:text-slate-100 sm:block">
                        Dictionary Games
                    </span>
                </span>
            )}

            <button type="button" onClick={onHome} className={control}>
                <Home size={16} aria-hidden="true" />
                Games Home
            </button>

            {onRestart && (
                <button type="button" onClick={onRestart} className={control}>
                    <RotateCcw size={16} aria-hidden="true" />
                    Restart
                </button>
            )}

            {onStats && (
                <button type="button" onClick={onStats} className={control}>
                    <BarChart3 size={16} aria-hidden="true" />
                    Progress
                </button>
            )}

            {gameName && (
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {gameName}
                </span>
            )}

            {showProgress && (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    {questionAt} / {questionOf}
                </span>
            )}

            <span className="ml-auto flex items-center gap-2">
                {onToggleSound && (
                    <button
                        type="button"
                        onClick={onToggleSound}
                        aria-pressed={soundOn}
                        aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
                        title={soundOn ? 'Sound on' : 'Sound off'}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        {soundOn ? (
                            <Volume2 size={18} aria-hidden="true" />
                        ) : (
                            <VolumeX size={18} aria-hidden="true" />
                        )}
                    </button>
                )}
                {/*
                 * NO POINTS TOTAL HERE.
                 *
                 * This read `session.xpEarned`, accumulated on this device from
                 * `xpFor(outcome)`. INV-016 (Accepted, binding platform-wide)
                 * says a client renders SETTLED awards and never infers one, so
                 * a running total assembled from local answer counts cannot be
                 * shown as points earned — it has no ledger row and would
                 * disagree with the same player's totals on another device.
                 *
                 * The slot stays empty rather than showing a zero: absence of a
                 * settlement is not evidence of no awards. This is the same
                 * reason stars were already withheld here, and the note that
                 * used to sit in this spot said so about stars while the points
                 * beside it did exactly what it warned against.
                 *
                 * Settled awards render on the completion screen, through
                 * `earnedBadges(awards)`, which is where the engine's response
                 * already arrives.
                 */}
                {identity}
            </span>
        </nav>
    );
}
