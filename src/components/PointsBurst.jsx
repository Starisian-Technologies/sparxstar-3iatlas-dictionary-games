import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './Celebration.jsx';
import { accentFor } from '../theme.js';

/**
 * PointsBurst — what a correct answer looks like.
 *
 * ======================= WHAT THIS REPLACES ==========================
 *
 * A correct answer used to change a small number in the corner of the header
 * and print "+10 XP" in grey. For a child, that is indistinguishable from
 * nothing happening — the game gave no sign that anything had gone right.
 *
 * ======================= AND WHAT IT IS NOT ==========================
 *
 * The brief draws a hard line: energetic arcade feedback, and nothing that
 * borrows from betting. So there are no coins, no chips, no cascading
 * jackpots, no spinning reels, no cash, and nothing that pretends a reward is
 * bigger than it is. The number shown is the number the scoring engine
 * recorded, and a streak line appears only when the streak is real.
 *
 * ======================= AND IT GETS OUT OF THE WAY ==================
 *
 *   - `pointer-events: none` over the whole overlay, and it takes no layout
 *     space. It can never sit on top of Skip, a hint, or the way out — a
 *     celebration that blocks a control is the trap this release exists to fix.
 *   - It is short. 1100ms, then the element unmounts itself.
 *   - `prefers-reduced-motion` keeps the message and drops the movement: the
 *     player still sees what they scored, it simply does not fly. Removing the
 *     feedback entirely would take the reward away from the people who asked
 *     for less motion, which is not what they asked for.
 */

const LIFETIME_MS = 1100;
const SPARKS = 14;

/**
 * One reward moment.
 *
 * @param {object}  props
 * @param {number}  props.points   XP recorded for this question. 0 renders nothing.
 * @param {number}  [props.streak] Current run of correct answers, for the streak line.
 * @param {string}  [props.gameId] Which game, for its accent colour.
 * @param {number}  [props.token]  Changes per answer, so two identical scores
 *                                 in a row still produce two separate bursts.
 * @param {Function} [props.onDone] Called when the burst has finished.
 */
export default function PointsBurst({ points = 0, streak = 0, gameId, token = 0, onDone }) {
    const [visible, setVisible] = useState(false);
    const [reduced] = useState(() => prefersReducedMotion());
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    useEffect(() => {
        if (!(points > 0)) return undefined;
        setVisible(true);
        const timer = setTimeout(() => {
            setVisible(false);
            doneRef.current?.();
        }, LIFETIME_MS);
        return () => clearTimeout(timer);
        /* `token` is the dependency that matters: the same score twice in a row
         * must fire twice, and `points` alone would not change. */
    }, [token, points]);

    if (!visible || !(points > 0)) return null;

    const accent = accentFor(gameId);
    /* Three and up is a streak worth naming. Below that it is just two right
     * answers, and calling that a streak devalues the word. */
    const showStreak = streak >= 3;

    return (
        <div
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
            aria-hidden="true"
        >
            {!reduced && (
                <div className="absolute h-40 w-40">
                    {Array.from({ length: SPARKS }, (_, i) => {
                        const angle = (360 / SPARKS) * i;
                        return (
                            <span
                                key={i}
                                className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full"
                                style={{
                                    background: i % 3 === 0 ? '#ffffff' : accent,
                                    transform: `rotate(${angle}deg) translateY(-8px)`,
                                    animation: `aiwa-spark ${LIFETIME_MS}ms ease-out forwards`,
                                    animationDelay: `${(i % 4) * 28}ms`,
                                }}
                            />
                        );
                    })}
                </div>
            )}

            <span
                className="select-none text-4xl font-black tracking-tight sm:text-5xl"
                style={{
                    color: '#ffffff',
                    textShadow: `0 0 18px ${accent}, 0 0 38px ${accent}, 0 2px 4px rgba(0,0,0,0.45)`,
                    animation: reduced ? undefined : `aiwa-rise ${LIFETIME_MS}ms ease-out forwards`,
                }}
            >
                +{points} POINTS!
            </span>

            {showStreak && (
                <span
                    className="mt-2 select-none rounded-full px-3 py-1 text-sm font-bold text-white"
                    style={{
                        background: accent,
                        boxShadow: `0 0 20px ${accent}`,
                        animation: reduced
                            ? undefined
                            : `aiwa-rise ${LIFETIME_MS}ms ease-out 80ms forwards`,
                    }}
                >
                    {streak} IN A ROW!
                </span>
            )}

            {/*
             * Keyframes travel with the component.
             *
             * The games are mounted inside a host page whose stylesheet this
             * package does not own, so a class defined in a global sheet may
             * or may not be there. This cannot fail to load.
             */}
            <style>{`
                @keyframes aiwa-rise {
                    0%   { opacity: 0; transform: scale(0.6) translateY(10px); }
                    22%  { opacity: 1; transform: scale(1.12) translateY(0); }
                    45%  { opacity: 1; transform: scale(1) translateY(-6px); }
                    100% { opacity: 0; transform: scale(1) translateY(-42px); }
                }
                @keyframes aiwa-spark {
                    0%   { opacity: 0; transform: rotate(var(--a,0deg)) translateY(-8px) scale(0.5); }
                    18%  { opacity: 1; }
                    100% { opacity: 0; transform: translateY(-70px) scale(0.2); }
                }
            `}</style>
        </div>
    );
}
