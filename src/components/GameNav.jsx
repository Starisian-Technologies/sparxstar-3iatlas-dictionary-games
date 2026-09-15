import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, Home, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { COLOR, SHELL } from '../theme.js';
import { prefersReducedMotion } from './Celebration.jsx';

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
 *   points     {number}    XP earned so far this session
 *   onHome     {Function}  REQUIRED — leave the game and return to the menu
 *   onRestart  {Function}  Restart this game; omitted outside gameplay
 *   onStats    {Function}  Open the progress screen. OPTIONAL, and omitted
 *                          means no button — the same rule `onBrowse` taught.
 *   soundOn    {boolean}   Whether game sounds are on. OPTIONAL; omitting
 *                          `onToggleSound` removes the control entirely.
 *   onToggleSound {Function} OPTIONAL.
 *   identity   {node}      Sign-in state supplied by the host app
 */

/**
 * Count a number up to its new value.
 *
 * The score used to jump, which is the one moment it should not: the whole
 * point of a running total is watching it move. Bounded at ~420ms so it has
 * always finished before the next question, and it lands on the exact target
 * rather than drifting — a counter that settles on the wrong number is worse
 * than one that jumps.
 */
function useCountUp(value, { enabled = true } = {}) {
    const [shown, setShown] = useState(value);
    const fromRef = useRef(value);
    const frameRef = useRef(null);

    useEffect(() => {
        if (!enabled || typeof requestAnimationFrame !== 'function') {
            setShown(value);
            fromRef.current = value;
            return undefined;
        }
        const from = fromRef.current;
        if (from === value) return undefined;

        const started = Date.now();
        const duration = 420;
        const tick = () => {
            const progress = Math.min(1, (Date.now() - started) / duration);
            /* Ease-out: fast at first, settling into the final number. */
            const eased = 1 - (1 - progress) ** 3;
            setShown(Math.round(from + (value - from) * eased));
            if (progress < 1) frameRef.current = requestAnimationFrame(tick);
            else fromRef.current = value;
        };
        frameRef.current = requestAnimationFrame(tick);
        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            /* Interrupted mid-count: the next run starts from the last number
             * actually shown, not from a value nobody saw. */
            fromRef.current = value;
            setShown(value);
        };
    }, [value, enabled]);

    return shown;
}

export default function GameNav({
    gameName = null,
    questionAt = null,
    questionOf = null,
    points = 0,
    onHome,
    onRestart = null,
    onStats = null,
    soundOn = true,
    onToggleSound = null,
    identity = null,
}) {
    const showProgress =
        Number.isFinite(questionAt) && Number.isFinite(questionOf) && questionOf > 0;
    const [reduced] = useState(() => prefersReducedMotion());
    const shownPoints = useCountUp(points, { enabled: !reduced });

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
            {/* The family mark. Cyan "3i" + product name, as WordPad's TopBar. */}
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
                 * Points, live and counting. Stars would sit beside this — the
                 * brief asks for them — but no canonical star rule exists for
                 * the dictionary games and RLC spec v4.0 §1.6 places stars with
                 * myCred, not with this client. Rendering an invented number
                 * here would be worse than rendering none, so the slot stays
                 * empty until the rule is decided.
                 *
                 * `aria-label` carries the SETTLED total, not the animating
                 * one: a screen reader should be told the score, not read a
                 * count-up frame by frame.
                 */}
                <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: COLOR.success }}
                    aria-label={`${points} points this session`}
                >
                    <span aria-hidden="true">{shownPoints}</span> pts
                </span>
                {identity}
            </span>
        </nav>
    );
}
