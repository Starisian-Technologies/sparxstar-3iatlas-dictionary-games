import React, { useEffect, useState } from 'react';
import { BarChart3, Grid3x3, List, RotateCcw, Sparkles } from 'lucide-react';
import { PRODUCTION_GAMES } from '../constants.js';
import Celebration, { prefersReducedMotion } from './Celebration.jsx';
import BadgeCard from './BadgeCard.jsx';
import { earnedBadges } from '../awards.js';
import { RESULT, gradeSession, isWin, resultMessage } from '../results.js';
import { COLOR, GRADIENT } from '../theme.js';
import { playPartial, playTryAgain, playWin } from '../sound.js';

/**
 * SessionComplete — the end of a round, and it is not the same end every time.
 *
 * ==================== WHAT THIS SCREEN USED TO DO =====================
 *
 * Every round finished identically: a gold trophy on a magenta gradient,
 * confetti, and "Session complete!". A player who answered nothing correctly
 * and earned zero XP got exactly that, word for word and animation for
 * animation, alongside a player who got everything right.
 *
 * Under it sat six statistic tiles and up to six buttons of equal weight, so
 * the screen said everything and therefore nothing: what happened, what it
 * meant, and what to do next were all the same size.
 *
 * ==================== WHAT IT DOES NOW ===============================
 *
 * Three visibly different endings, graded in `src/results.js` from the
 * recorded results:
 *
 *   PERFECT / STRONG   the celebration. Confetti, a glow, the score counting
 *                      up, and the biggest treatment reserved for a perfect
 *                      round so there is something left to reach for.
 *   PARTIAL            warm and encouraging, no confetti. Names what was
 *                      achieved AND what is ready to practise, with practice
 *                      as the obvious next step.
 *   PRACTICE           quiet. No trophy, no confetti, a soft sound, and one
 *                      strong recovery action. The ROUND is called tough —
 *                      never the player.
 *
 * And one hierarchy, in one order: what happened, what it was worth, one
 * secondary fact if it is true, then the primary action, then the alternative,
 * then a quiet way out.
 */

/** Count a number up, for the one number worth watching arrive. */
function useCountUp(target, { enabled }) {
    const [shown, setShown] = useState(enabled ? 0 : target);

    useEffect(() => {
        if (!enabled || typeof requestAnimationFrame !== 'function' || target <= 0) {
            setShown(target);
            return undefined;
        }
        let frame = null;
        const started = Date.now();
        const duration = 900;
        const tick = () => {
            const progress = Math.min(1, (Date.now() - started) / duration);
            const eased = 1 - (1 - progress) ** 3;
            setShown(Math.round(target * eased));
            if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => {
            if (frame) cancelAnimationFrame(frame);
        };
    }, [target, enabled]);

    return shown;
}

export default function SessionComplete({
    session,
    learnedCount,
    onPracticeMissed,
    onPlayAgain,
    onChooseAnother,
    onHome,
    adjustNotice = null,
    awards = null,
    onStats = null,
    onBrowse = null,
}) {
    const [reduced] = useState(() => prefersReducedMotion());
    const grade = session ? gradeSession(session) : null;
    const xpTarget = grade?.xp ?? 0;
    const shownXp = useCountUp(xpTarget, { enabled: Boolean(grade) && !reduced });

    /*
     * The ending sound, once, when the screen arrives.
     *
     * Keyed on the tier rather than fired in render: a re-render for any other
     * reason must not replay the fanfare.
     */
    useEffect(() => {
        if (!grade) return;
        if (grade.tier === RESULT.PERFECT || grade.tier === RESULT.STRONG) playWin();
        else if (grade.tier === RESULT.PARTIAL) playPartial();
        else playTryAgain();
        /* eslint-disable-next-line react-hooks/exhaustive-deps -- once per ending */
    }, [grade?.tier]);

    if (!session || !grade) return null;

    const message = resultMessage(grade);
    const celebrate = isWin(grade.tier);
    const perfect = grade.tier === RESULT.PERFECT;
    /* Whatever the engine settled, looked up in the catalogue. Never computed
     * here — see the header of `src/awards.js`. */
    const badges = earnedBadges(awards);
    const isProductionGame = Boolean(PRODUCTION_GAMES?.has?.(session.gameType));

    /*
     * ONE secondary fact, and only when it is true.
     *
     * The brief asks for a single meaningful result beside the headline, not a
     * grid of six. A streak is shown when the results contain one; otherwise
     * the words waiting to be practised, which is the fact the next action
     * depends on. Neither is ever manufactured.
     */
    const secondary =
        grade.streak >= 3
            ? `Best run: ${grade.streak} in a row`
            : grade.reviewing > 0
              ? `${grade.reviewing} ready to practise`
              : null;

    /*
     * Practice leads when the round needs it and there is something to
     * practise. A strong round still offers it, as a quiet link — the player
     * who wants to drill the one word they missed can, without the screen
     * telling a winner to go and practise.
     */
    const practiceIsPrimary = grade.reviewing > 0 && !celebrate;

    const tierStyle = celebrate
        ? {
              ring: perfect ? COLOR.magenta : COLOR.purple,
              background: GRADIENT.primary,
              glow: `0 0 60px ${perfect ? COLOR.magenta : COLOR.purple}55`,
          }
        : grade.tier === RESULT.PARTIAL
          ? {
                ring: COLOR.warning,
                background: `linear-gradient(135deg, ${COLOR.warning}, ${COLOR.magenta})`,
                glow: 'none',
            }
          : { ring: COLOR.textMuted, background: COLOR.panelRaised, glow: 'none' };

    return (
        <div
            className="relative flex h-full flex-col items-center justify-center p-6 text-center"
            style={celebrate && !reduced ? { boxShadow: `inset ${tierStyle.glow}` } : undefined}
        >
            {/* Confetti is earned, not automatic. A round that needs practice
             *  gets none — see the tier note in the header. */}
            <Celebration active={celebrate} />

            {/*
             * The mark. A trophy only for a win; the practice ending gets a
             * quiet, non-judgemental icon instead of an empty podium.
             */}
            <div
                className="mb-5 flex h-20 w-20 items-center justify-center rounded-full text-4xl"
                style={{
                    background: tierStyle.background,
                    boxShadow: celebrate && !reduced ? tierStyle.glow : undefined,
                    animation: celebrate && !reduced ? 'aiwa-pop 520ms ease-out' : undefined,
                }}
                aria-hidden="true"
            >
                {perfect ? '🌟' : celebrate ? '🏆' : grade.tier === RESULT.PARTIAL ? '💪' : '🌱'}
            </div>

            {/* 1. The result. */}
            <h2 className="mb-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {message.headline}
            </h2>
            <p className="mb-5 max-w-xs text-sm text-slate-600 dark:text-slate-300">
                {message.detail}
            </p>

            {/* 2. Words worked out, and what they were worth. */}
            <div className="mb-3 grid w-full max-w-xs grid-cols-2 gap-3">
                <Figure label="Words worked out" value={`${grade.correct} / ${grade.answered}`} />
                <Figure label="Points earned" value={`+${shownXp}`} color={COLOR.success} />
            </div>

            {/* 3. One secondary fact, when there is a true one. */}
            {secondary && (
                <p className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <Sparkles size={15} aria-hidden="true" style={{ color: tierStyle.ring }} />
                    {secondary}
                </p>
            )}

            {badges.length > 0 && (
                <div className="mb-5 w-full max-w-xs">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        {badges.length === 1 ? 'New award' : 'New awards'}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        {badges.map((award) => (
                            <BadgeCard key={award.id} award={award} />
                        ))}
                    </div>
                </div>
            )}

            {/*
             * What adaptation decided, shown HERE.
             *
             * It was previously rendered only in the playing phase but set one
             * line before the transition to this screen, so the player never
             * saw it.
             */}
            {adjustNotice && (
                <p className="mb-5 rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {adjustNotice}
                </p>
            )}

            {/*
             * 4-6. The actions, in three weights.
             *
             * One primary, one alternative, and a quiet way out. The screen
             * previously offered "Choose Another Game" and "Return to Games
             * Home" as equal-weight buttons stacked under an equally weighted
             * "Play Again" and an equally weighted progress link — five things
             * competing to be the obvious next tap, which means none of them
             * was.
             *
             * The primary IS the recommended action and it changes with the
             * result: a round that went well offers another; a round that did
             * not offers the practice that will fix it.
             */}
            <div className="flex w-full max-w-xs flex-col gap-3">
                {/*
                 * THE PRIMARY IS THE RECOMMENDED ACTION, and it changes with
                 * the result. A round that went well offers another; a round
                 * that did not offers the practice that will fix it. Whichever
                 * is not the primary becomes a quiet link below, so it is
                 * still reachable without competing.
                 */}
                {practiceIsPrimary ? (
                    <PrimaryButton onClick={onPracticeMissed} background={GRADIENT.primary}>
                        <RotateCcw size={16} aria-hidden="true" />
                        {message.action} ({grade.reviewing})
                    </PrimaryButton>
                ) : (
                    <PrimaryButton onClick={onPlayAgain} background={GRADIENT.primary}>
                        <RotateCcw size={16} aria-hidden="true" />
                        {message.action}
                    </PrimaryButton>
                )}

                <SecondaryButton onClick={onChooseAnother}>
                    <Grid3x3 size={16} aria-hidden="true" />
                    Try another game
                </SecondaryButton>

                {/* The quiet row. Text weight, deliberately below the two
                 *  buttons — but still 44px tall, because "quiet" is about
                 *  visual weight and never about being hard to hit. */}
                <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
                    <QuietLink onClick={onHome}>Finish</QuietLink>
                    {practiceIsPrimary ? (
                        <QuietLink onClick={onPlayAgain}>Play again</QuietLink>
                    ) : (
                        grade.reviewing > 0 && (
                            <QuietLink onClick={onPracticeMissed}>
                                Practise {grade.reviewing}{' '}
                                {grade.reviewing === 1 ? 'word' : 'words'}
                            </QuietLink>
                        )
                    )}
                    {onStats && (
                        <QuietLink onClick={onStats}>
                            <BarChart3 size={14} aria-hidden="true" />
                            Your progress
                        </QuietLink>
                    )}
                    {/* Only when a host actually implements it — see the prop doc. */}
                    {onBrowse && (
                        <QuietLink onClick={onBrowse}>
                            <List size={14} aria-hidden="true" />
                            Browse dictionary
                        </QuietLink>
                    )}
                </div>
            </div>

            {/*
             * The cumulative count, demoted to a footnote.
             *
             * It is a lifetime number and this screen is about one round, so it
             * no longer sits in a gradient panel above the actions competing
             * with the result.
             *
             * "Words you have written correctly" — not "words you can write".
             * The count is incremented when a production game is answered
             * correctly, which is evidence of writing a word correctly once. It
             * is not evidence of mastery, and the old label claimed it was.
             * Recognition games do not contribute at all, which is why this is
             * hidden after them rather than shown as a total the round did not
             * move.
             */}
            {isProductionGame && (
                <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                    Words you have written correctly:{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                        {learnedCount}
                    </span>
                </p>
            )}

            <style>{`
                @keyframes aiwa-pop {
                    0%   { transform: scale(0.4) rotate(-12deg); opacity: 0; }
                    60%  { transform: scale(1.15) rotate(4deg); opacity: 1; }
                    100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

function Figure({ label, value, color }) {
    return (
        <div className="flex-1 rounded-xl bg-slate-100 p-3 text-center dark:bg-slate-800">
            <p className="text-xl font-bold" style={{ color: color ?? undefined }}>
                {value}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-300">
                {label}
            </p>
        </div>
    );
}

function PrimaryButton({ onClick, background, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-white transition-transform active:scale-[0.98]"
            style={{ background }}
        >
            {children}
        </button>
    );
}

function SecondaryButton({ onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
            {children}
        </button>
    );
}

function QuietLink({ onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-slate-500 underline-offset-4 transition-colors hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
        >
            {children}
        </button>
    );
}
