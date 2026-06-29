import React from 'react';
import { CheckCircle2, RotateCcw, List } from 'lucide-react';
import { PRODUCTION_GAMES } from '../constants.js';

/**
 * SessionComplete — post-session summary screen.
 *
 * Props:
 *   session        {object}   Completed session from useGameSession
 *   learnedCount   {number}   Cumulative total of uniquely written words (production games only)
 *   onPracticeMissed {Function} Re-play with "Still learning" words
 *   onBrowse         {Function} Switch to Browse tab
 *   onPlayAgain      {Function} Start a new session with same settings
 */
export default function SessionComplete({
    session,
    learnedCount,
    onPracticeMissed,
    onBrowse,
    onPlayAgain,
}) {
    if (!session) return null;

    const total = session.words?.length ?? 0;
    const correct = session.results.filter((r) => r.outcome === 'correct').length;
    const missed = session.results.filter((r) => r.outcome === 'learning').length;
    const xp = session.xpEarned ?? 0;
    const isProductionGame = Boolean(PRODUCTION_GAMES?.has?.(session.gameType));

    return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
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

            {/* Stats row */}
            <div className="flex gap-4 mb-6 w-full max-w-xs">
                <StatCard label="You knew" value={correct} color="#E91E8C" />
                <StatCard label="Still learning" value={missed} color="#7B3FA0" />
                <StatCard label="XP earned" value={`+${xp}`} color="#009688" />
            </div>

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
                {missed > 0 && (
                    <button
                        type="button"
                        onClick={onPracticeMissed}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-colors border-2"
                        style={{ borderColor: '#E91E8C', color: '#E91E8C' }}
                    >
                        <RotateCcw size={16} aria-hidden="true" />
                        Practice missed words ({missed})
                    </button>
                )}

                <button
                    type="button"
                    onClick={onBrowse}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-colors"
                >
                    <List size={16} aria-hidden="true" />
                    Browse dictionary
                </button>

                <button
                    type="button"
                    onClick={onPlayAgain}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm text-white transition-colors"
                    style={{ background: '#E91E8C' }}
                >
                    <CheckCircle2 size={16} aria-hidden="true" />
                    Play again
                </button>
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
