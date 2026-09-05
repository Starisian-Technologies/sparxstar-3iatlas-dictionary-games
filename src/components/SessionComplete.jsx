import React from 'react';
import { CheckCircle2, RotateCcw, List, Home, Grid3x3 } from 'lucide-react';
import { PRODUCTION_GAMES } from '../constants.js';
import { needsReview } from '../pedagogy.js';
import Celebration from './Celebration.jsx';

/**
 * SessionComplete — post-session summary screen.
 *
 * Props:
 *   session        {object}   Completed session from useGameSession
 *   learnedCount   {number}   Cumulative total of uniquely written words (production games only)
 *   onPracticeMissed {Function} Re-play with "Still learning" words
 *   onPlayAgain      {Function} Start a new session with same settings
 *   onChooseAnother  {Function} Back to the game chooser
 *   onHome           {Function} Back to the games menu
 *   adjustNotice     {string}   What adaptation decided at the end of this round
 *   onBrowse         {Function} OPTIONAL. Switch to the host's Browse tab.
 *                               Rendered only when a host actually supplies one
 *                               — the games site passed an empty function, so
 *                               this button shipped as the only exit from a
 *                               screen that had no other, and did nothing.
 */
export default function SessionComplete({
    session,
    learnedCount,
    onPracticeMissed,
    onPlayAgain,
    onChooseAnother,
    onHome,
    adjustNotice = null,
    onBrowse = null,
}) {
    if (!session) return null;

    /*
     * Every category, not three of them.
     *
     * The screen previously reported `correct`, `learning` and XP, which do not
     * add up to the number of questions played — a player who got some wrong or
     * skipped some saw a summary that silently lost them. `answered` is derived
     * from the same `results` array the others come from, so the reconciliation
     * test has one source to check against.
     */
    const total = session.words?.length ?? 0;
    const results = session.results ?? [];
    const correct = results.filter((r) => r.outcome === 'correct').length;
    const missed = results.filter((r) => r.outcome === 'learning').length;
    const incorrect = results.filter((r) => r.outcome === 'incorrect').length;
    const skipped = results.filter((r) => r.outcome === 'skipped').length;
    const reviewing = results.filter((r) => needsReview(r.outcome)).length;
    const answered = results.length;
    const xp = session.xpEarned ?? 0;
    const isProductionGame = Boolean(PRODUCTION_GAMES?.has?.(session.gameType));

    return (
        <div className="relative flex h-full flex-col items-center justify-center p-6 text-center">
            <Celebration />
            {/* Trophy / success icon */}
            <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-5 text-4xl"
                style={{ background: 'linear-gradient(135deg, #E91E8C 0%, #7B3FA0 100%)' }}
                aria-hidden="true"
            >
                🏆
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                Session complete!
            </h2>

            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                You practised{' '}
                <span className="font-semibold text-gray-800 dark:text-gray-200">{total}</span>{' '}
                words
            </p>

            {/*
             * Stats row.
             *
             * The four OUTCOME tiles — knew, still learning, not yet, skipped —
             * are mutually exclusive and sum to `answered`. "To review" is not
             * one of them: it is the union of the three non-correct outcomes,
             * shown because it is what `Practice these words` will replay. It
             * deliberately overlaps, so do not add it into a total.
             */}
            <div className="mb-3 grid w-full max-w-xs grid-cols-3 gap-3">
                <StatCard label="You knew" value={correct} color="#E91E8C" />
                <StatCard label="Still learning" value={missed} color="#7B3FA0" />
                <StatCard label="Not yet" value={incorrect} color="#9CA3AF" />
                <StatCard label="Skipped" value={skipped} color="#9CA3AF" />
                <StatCard label="To review" value={reviewing} color="#F5A623" />
                <StatCard label="XP earned" value={`+${xp}`} color="#009688" />
            </div>

            <p className="mb-6 text-xs text-gray-400">
                {answered} of {total} questions answered
            </p>

            {/*
             * What adaptation decided, shown HERE.
             *
             * It was previously rendered only in the playing phase but set one
             * line before the transition to this screen, so the player never
             * saw it — the `Adaptive: on` label was the only evidence that
             * anything adapted, which is the reported defect.
             */}
            {adjustNotice && (
                <p className="mb-6 rounded-xl bg-gray-50 px-4 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {adjustNotice}
                </p>
            )}

            {/*
             * Cumulative production count — only shown for games that require
             * the player to produce (write/type/arrange) the word.
             * DomainFlash and MeaningMatch are recognition-only; showing a
             * "words you can write" count after them would misrepresent progress.
             */}
            {isProductionGame && (
                <div
                    className="w-full max-w-xs rounded-2xl p-4 mb-6"
                    style={{ background: 'linear-gradient(135deg, #E91E8C 0%, #7B3FA0 100%)' }}
                >
                    <p className="text-white/80 text-xs font-semibold uppercase tracking-wider mb-1">
                        Total words you can write
                    </p>
                    <p className="text-white text-3xl font-bold">{learnedCount}</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 w-full max-w-xs">
                {/*
                 * Gated on `reviewing`, not `missed`.
                 *
                 * `handlePracticeMissed` replays everything `needsReview()`
                 * covers — learning, incorrect AND skipped — but this button
                 * was shown only when a `learning` result existed. A round
                 * where the player skipped every card therefore had words
                 * waiting in the review queue and no way to practise them,
                 * which became reachable the moment DomainFlash gained a Skip.
                 * One predicate now decides both what is replayed and whether
                 * the offer appears.
                 */}
                {reviewing > 0 && (
                    <button
                        type="button"
                        onClick={onPracticeMissed}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-colors border-2"
                        style={{ borderColor: '#E91E8C', color: '#E91E8C' }}
                    >
                        <RotateCcw size={16} aria-hidden="true" />
                        Practice these words ({reviewing})
                    </button>
                )}

                <button
                    type="button"
                    onClick={onPlayAgain}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors"
                    style={{ background: '#E91E8C' }}
                >
                    <CheckCircle2 size={16} aria-hidden="true" />
                    Play Again
                </button>

                <button
                    type="button"
                    onClick={onChooseAnother}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition-colors dark:bg-gray-800 dark:text-gray-200"
                >
                    <Grid3x3 size={16} aria-hidden="true" />
                    Choose Another Game
                </button>

                <button
                    type="button"
                    onClick={onHome}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700 transition-colors dark:border-gray-600 dark:text-gray-200"
                >
                    <Home size={16} aria-hidden="true" />
                    Return to Games Home
                </button>

                {/* Only when a host actually implements it — see the prop doc. */}
                {onBrowse && (
                    <button
                        type="button"
                        onClick={onBrowse}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-gray-500 transition-colors dark:text-gray-400"
                    >
                        <List size={16} aria-hidden="true" />
                        Browse dictionary
                    </button>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value, color }) {
    return (
        <div className="flex-1 rounded-xl p-3 bg-gray-50 dark:bg-gray-800 text-center">
            <p className="text-xl font-bold" style={{ color }}>
                {value}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{label}</p>
        </div>
    );
}
