import React, { useState, useMemo } from 'react';
import { Volume2 } from 'lucide-react';

/**
 * DomainFlash — Game 4.6
 *
 * Flashcard through a semantic domain.
 * Front shows EN/FR meaning. Player recalls Mandinka word.
 * Reveal shows word + IPA + audio. Self-reported result.
 *
 * Props:
 *   words      {Array}    Game-set words
 *   language   {string}   'en' | 'fr'
 *   onResult   {Function} (uuid, outcome, attempts, xp) => void
 *   onComplete {Function} () => void
 */
export default function DomainFlash({ words, language, onResult, onComplete }) {
    const deck = useMemo(() => shuffle(words), [words]);
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [answered, setAnswered] = useState(false);

    const word = deck[index];
    if (!word) return null;

    const meaning =
        language === 'fr' && word.translation_fr ? word.translation_fr : word.translation_en;

    const handleReveal = () => setFlipped(true);

    const handleKnew = () => {
        if (answered) return;
        setAnswered(true);
        onResult(word.uuid, 'correct', 1, 5);
        next();
    };

    const handleLearning = () => {
        if (answered) return;
        setAnswered(true);
        onResult(word.uuid, 'learning', 1, 0);
        next();
    };

    const next = () => {
        if (index + 1 >= deck.length) {
            onComplete();
        } else {
            setIndex((i) => i + 1);
            setFlipped(false);
            setAnswered(false);
        }
    };

    const playAudio = (e) => {
        e.stopPropagation();
        if (word.audio_url) {
            new Audio(word.audio_url).play().catch(() => {});
        }
    };

    return (
        <div className="flex flex-col h-full p-4 gap-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 shrink-0">
                <span className="font-semibold" style={{ color: '#E91E8C' }}>
                    Domain Flash
                </span>
                <span>
                    {index + 1} / {deck.length} words
                </span>
            </div>

            <ProgressBar current={index} total={deck.length} />

            {/* Card */}
            <div
                className="flex-1 flex flex-col rounded-2xl shadow-lg overflow-hidden"
                style={{ perspective: 600 }}
            >
                {!flipped ? (
                    /* Front — meaning */
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-gray-800">
                        {word.domain && (
                            <span
                                className="mb-4 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full text-white"
                                style={{ background: '#7B3FA0' }}
                            >
                                {word.domain}
                            </span>
                        )}
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-snug">
                            {meaning}
                        </p>
                        <p className="mt-4 text-sm text-gray-400 italic">
                            Think of the Mandinka word&hellip;
                        </p>
                        <button
                            type="button"
                            onClick={handleReveal}
                            className="mt-8 px-8 py-3 rounded-xl font-semibold text-white text-base transition-colors"
                            style={{ background: '#E91E8C' }}
                        >
                            Reveal
                        </button>
                    </div>
                ) : (
                    /* Back — Mandinka word */
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-gray-800">
                        <p className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                            {word.headword}
                        </p>
                        {word.ipa && (
                            <p className="text-sm font-mono text-gray-400 mb-4">/{word.ipa}/</p>
                        )}
                        {word.audio_url && (
                            <button
                                type="button"
                                onClick={playAudio}
                                className="mb-4 p-3 rounded-full"
                                style={{ background: '#FCE4F3', color: '#E91E8C' }}
                                aria-label="Play pronunciation"
                            >
                                <Volume2 size={22} aria-hidden="true" />
                            </button>
                        )}
                        <div className="flex gap-3 mt-4 w-full max-w-xs">
                            <button
                                type="button"
                                onClick={handleLearning}
                                disabled={answered}
                                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
                            >
                                Still learning
                            </button>
                            <button
                                type="button"
                                onClick={handleKnew}
                                disabled={answered}
                                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-colors"
                                style={{ background: '#4CAF50' }}
                            >
                                I knew it ✓
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProgressBar({ current, total }) {
    const pct = total > 0 ? (current / total) * 100 : 0;
    return (
        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden shrink-0">
            <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: '#E91E8C' }}
            />
        </div>
    );
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
