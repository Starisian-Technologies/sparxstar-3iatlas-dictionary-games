import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './Celebration.jsx';
import { accentFor, accentOnWhiteFor } from '../theme.js';

/**
 * AnswerBurst — what a correct answer looks like.
 *
 * ==================== WHAT IT CELEBRATES, AND WHY ====================
 *
 * The first version of this component threw a glowing `+10 POINTS!` over the
 * board. It was wrong, and the review was right to stop it.
 *
 * INV-016 (Accepted 2026-09-05, binding platform-wide) says a client renders
 * SETTLED awards and never infers one: "No client may originate, compute, or
 * infer earned value… It may never derive the award itself from round
 * performance, elapsed time, placement, answer counts, dictionary content, or
 * any other local signal." The number this used to shout came from
 * `xpFor(outcome)` — a constant table in `pedagogy.js`, read on this device,
 * with no ledger row behind it and no settlement identifier. An inferred award
 * "teaches a learner that the reward is theatre", which is exactly what a
 * celebration is supposed not to be.
 *
 * So the celebration stayed and the claim went. WAS THIS ANSWER RIGHT is
 * something the client knows for certain — it just watched the player get it —
 * and HOW MANY IN A ROW is a count of answers, not of value. Both are facts
 * about the round. Neither is an award, and neither needs the engine's
 * permission to say.
 *
 * When a settlement response carries recognized award identifiers, they render
 * through `earnedBadges(awards)` on the completion screen, which is where the
 * engine's answer already arrives.
 *
 * ==================== AND IT STILL GETS OUT OF THE WAY ====================
 *
 *   - `pointer-events: none` over the whole overlay, and no layout space, so it
 *     can never sit on top of Skip, a hint, or the way out.
 *   - Short: 1100ms, then it unmounts itself.
 *   - `prefers-reduced-motion` keeps the message and drops the movement. The
 *     request was less motion, not less feedback.
 *   - The message is ANNOUNCED. An earlier version put `aria-hidden` on the
 *     whole overlay, which meant a screen-reader user got no feedback for a
 *     correct answer at all — the decoration was hidden and took the news with
 *     it. The sparks stay hidden; the words live in a polite region.
 */

const LIFETIME_MS = 1100;
const SPARKS = 14;

/**
 * One reward moment.
 *
 * @param {object}  props
 * @param {boolean} props.correct  Whether the answer just given was right.
 * @param {number}  [props.streak] Consecutive correct answers, for the streak line.
 * @param {string}  [props.gameId] Which game, for its accent colour.
 * @param {number}  [props.token]  Changes per answer, so two identical results
 *                                 in a row still produce two separate bursts.
 */
export default function PointsBurst({ correct = false, streak = 0, gameId, token = 0 }) {
    const [visible, setVisible] = useState(false);
    const [reduced] = useState(() => prefersReducedMotion());
    const lastTokenRef = useRef(token);

    useEffect(() => {
        if (!correct) return undefined;
        if (token === lastTokenRef.current && visible) return undefined;
        lastTokenRef.current = token;
        setVisible(true);
        const timer = setTimeout(() => setVisible(false), LIFETIME_MS);
        return () => clearTimeout(timer);
        /* `token` is the dependency that matters: the same result twice in a row
         * must fire twice, and `correct` alone would not change.
         * eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [token, correct]); // eslint-disable-line react-hooks/exhaustive-deps

    const accent = accentFor(gameId);
    /* Three and up is a streak worth naming. Two right answers is not a streak,
     * and calling it one devalues the word. */
    const showStreak = streak >= 3;
    const message = showStreak ? `Correct! ${streak} in a row` : 'Correct!';

    return (
        <>
            {/*
             * The announcement, always in the tree so it is registered before it
             * has anything to say — a live region created at the moment it gains
             * text is not reliably announced.
             */}
            <span role="status" aria-live="polite" className="sr-only">
                {visible ? message : ''}
            </span>

            {visible && (
                <div
                    className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
                    aria-hidden="true"
                >
                    {/*
                     * The accent wash over the play area.
                     *
                     * Promised in the first version and never implemented: the
                     * overlay was transparent, so "light up the answer area in
                     * the game's colour" did not happen. Kept faint, and behind
                     * the text rather than over it.
                     */}
                    {!reduced && (
                        <span
                            className="absolute inset-0"
                            style={{
                                background: `radial-gradient(circle at 50% 45%, ${accent}33, transparent 65%)`,
                                animation: `aiwa-wash ${LIFETIME_MS}ms ease-out forwards`,
                            }}
                        />
                    )}

                    {!reduced && (
                        <div className="absolute h-40 w-40">
                            {Array.from({ length: SPARKS }, (_, i) => {
                                const angle = (360 / SPARKS) * i;
                                return (
                                    <span
                                        key={i}
                                        className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full"
                                        style={{
                                            /*
                                             * The angle travels as a custom
                                             * property. The first version set
                                             * rotation inline and then read
                                             * `var(--a)` inside the keyframes
                                             * without ever defining it, so every
                                             * spark defaulted to 0deg and flew
                                             * straight up — fourteen sparks on
                                             * one path instead of a ring.
                                             */
                                            '--a': `${angle}deg`,
                                            background: i % 3 === 0 ? '#ffffff' : accent,
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
                            animation: reduced
                                ? undefined
                                : `aiwa-rise ${LIFETIME_MS}ms ease-out forwards`,
                        }}
                    >
                        Correct!
                    </span>

                    {showStreak && (
                        <span
                            className="mt-2 select-none rounded-full px-3 py-1 text-sm font-bold text-white"
                            style={{
                                /* White text sits on this, so it uses the
                                 * contrast-checked variant; the glow around it
                                 * stays the bright decorative accent. */
                                background: accentOnWhiteFor(gameId),
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
                     * Keyframes travel with the component: the games mount
                     * inside a host page whose stylesheet this package does not
                     * own, so a class defined in a global sheet may not be there.
                     */}
                    <style>{`
                        @keyframes aiwa-rise {
                            0%   { opacity: 0; transform: scale(0.6) translateY(10px); }
                            22%  { opacity: 1; transform: scale(1.12) translateY(0); }
                            45%  { opacity: 1; transform: scale(1) translateY(-6px); }
                            100% { opacity: 0; transform: scale(1) translateY(-42px); }
                        }
                        @keyframes aiwa-wash {
                            0%   { opacity: 0; }
                            25%  { opacity: 1; }
                            100% { opacity: 0; }
                        }
                        @keyframes aiwa-spark {
                            0% {
                                opacity: 0;
                                transform: rotate(var(--a, 0deg)) translateY(-8px) scale(0.5);
                            }
                            18% { opacity: 1; }
                            100% {
                                opacity: 0;
                                transform: rotate(var(--a, 0deg)) translateY(-70px) scale(0.2);
                            }
                        }
                    `}</style>
                </div>
            )}
        </>
    );
}
