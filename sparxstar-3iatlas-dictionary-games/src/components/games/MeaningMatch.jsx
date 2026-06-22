import React, { useState, useMemo, useRef } from 'react';

/**
 * MeaningMatch — Game 4.3
 *
 * Written Mandinka headword → player selects the correct meaning
 * from three options (one correct, two distractors from same domain).
 *
 * Props:
 *   words      {Array}    Game-set words
 *   language   {string}   'en' | 'fr'
 *   onResult   {Function} (uuid, outcome, attempts, xp) => void
 *   onComplete {Function} () => void
 */
export default function MeaningMatch({ words, language, onResult, onComplete }) {
    const deck = useMemo(() => shuffle(words), [words]);
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState(null);
    const [revealed, setRevealed] = useState(false);
    const revealedRef = useRef(false);

    const word = deck[index];

    const options = useMemo(
        () => (word ? buildOptions(deck, index, language) : []),
        [word, index, deck, language]
    );

    if (!word) return null;

    const handleSelect = (idx) => {
        if (revealedRef.current) return;
        revealedRef.current = true;
        setSelected(idx);
        setRevealed(true);

        const isCorrect = options[idx].isCorrect;
        onResult(word.uuid, isCorrect ? 'correct' : 'learning', 1, isCorrect ? 5 : 0);

        setTimeout(() => {
            if (index + 1 >= deck.length) {
                onComplete();
            } else {
                setIndex((i) => i + 1);
                setSelected(null);
                setRevealed(false);
                revealedRef.current = false;
            }
        }, 1500);
    };

    const correctMeaning =
        language === 'fr' && word.translation_fr ? word.translation_fr : word.translation_en;

    return (
        <div className="flex flex-col h-full p-4 gap-4">
            {/* Header */}
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 shrink-0">
                <span className="font-semibold" style={{ color: '#E91E8C' }}>
                    Meaning Match
                </span>
                <span>
                    {index + 1} / {deck.length}
                </span>
            </div>

            <ProgressBar current={index} total={deck.length} />

            {/* Headword display */}
            <div className="shrink-0 text-center py-4">
                <p className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                    {word.headword}
                </p>
                {word.ipa && <p className="text-sm font-mono text-gray-400 mt-2">/{word.ipa}/</p>}
            </div>

            {/* Prompt */}
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center shrink-0">
                Choose the correct meaning
            </p>

            {/* Options */}
            <div className="flex flex-col gap-3 flex-1 justify-center">
                {options.map((opt, i) => {
                    let bg =
                        'bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700';
                    let textColor = 'text-gray-800 dark:text-gray-200';

                    if (revealed) {
                        if (opt.isCorrect) {
                            bg = 'border-2 border-green-400';
                            textColor = 'text-green-700 dark:text-green-300';
                        } else if (i === selected) {
                            bg = 'border-2 border-red-300 opacity-60';
                            textColor = 'text-red-500';
                        } else {
                            bg = 'border-2 border-gray-100 dark:border-gray-700 opacity-40';
                        }
                    } else if (i === selected) {
                        bg = 'border-2 border-pink-400';
                    }

                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => handleSelect(i)}
                            disabled={revealed}
                            className={`w-full px-5 py-4 rounded-xl font-medium text-base text-left transition-all ${bg} ${textColor}`}
                        >
                            {opt.text}
                            {revealed && opt.isCorrect && (
                                <span className="ml-2 text-green-500">✓</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* XP feedback */}
            {revealed && selected !== null && (
                <div className="shrink-0 text-center py-2">
                    {options[selected].isCorrect ? (
                        <span className="text-green-600 font-bold">+5 XP</span>
                    ) : (
                        <span className="text-gray-400 text-sm">Correct: {correctMeaning}</span>
                    )}
                </div>
            )}
        </div>
    );
}

function getTranslationText(word, language) {
    return language === 'fr' && word.translation_fr ? word.translation_fr : word.translation_en;
}

/**
 * Build up to 3 options: 1 correct + 2 unique distractors from same domain.
 * Distractors fall back to any other word in the deck.
 */
function buildOptions(deck, currentIndex, language) {
    const word = deck[currentIndex];
    const correctText = getTranslationText(word, language);

    /* Prefer distractors from same domain, then fall back to any other word. */
    const sameDomain = deck.filter((w, i) => i !== currentIndex && w.domain === word.domain);
    const others = deck.filter(
        (w, i) => i !== currentIndex && w.domain !== word.domain
    );

    const seenTexts = new Set([correctText]);
    const distractors = [];

    for (const candidate of [...shuffle(sameDomain), ...shuffle(others)]) {
        const text = getTranslationText(candidate, language);

        if (!text || seenTexts.has(text)) continue;

        distractors.push({ text, isCorrect: false });
        seenTexts.add(text);

        if (distractors.length === 2) break;
    }

    return shuffle([
        { text: correctText, isCorrect: true },
        ...distractors,
    ]);
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
