import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SkipForward } from 'lucide-react';
import AnswerReveal from '../AnswerReveal.jsx';
import {
    MODE,
    beginWord,
    isResolved,
    recordAnswer,
    resultFor,
    skip,
    startClock,
} from '../../pedagogy.js';

/**
 * MeaningMatch — Game 4.3
 *
 * Written Mandinka headword → player selects the correct meaning
 * from three options (one correct, two distractors from same domain).
 *
 * Props:
 *   words      {Array}    Game-set words
 *   language   {string}   'en' | 'fr'
 *   onResult   {Function} (uuid, outcome, attempts, xp, timeMs) => void
 *   onComplete {Function} () => void
 */
export default function MeaningMatch({
    words,
    language,
    languageCode,
    mode = MODE.PRACTICE,
    onResult,
    onComplete,
    onEvent,
}) {
    const deck = useMemo(() => shuffle(words), [words]);
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState(null);
    /*
     * Wrong options the player has already ruled out. A wrong pick used to end
     * the question outright; it now eliminates that option and lets them try
     * again, which is the same "another attempt with stronger help" shape the
     * spelling games use — expressed as the mechanic this game actually has.
     */
    const [eliminated, setEliminated] = useState([]);
    const [attempt, setAttempt] = useState(() => startClock(beginWord({ mode })));
    const wordStartRef = useRef(Date.now());

    const word = deck[index];

    const options = useMemo(
        () => (word ? buildOptions(deck, index, language) : []),
        [word, index, deck, language]
    );

    /* Reset the per-word timer whenever a new word is presented. */
    useEffect(() => {
        wordStartRef.current = Date.now();
    }, [index]);

    if (!word) return null;

    const report = (resolved) => {
        const { outcome, attempts, xp, timeMs } = resultFor(resolved);
        onResult(word.uuid, outcome, attempts, xp, timeMs);
    };

    const handleSelect = (idx) => {
        if (isResolved(attempt) || eliminated.includes(idx)) return;
        setSelected(idx);

        const next = recordAnswer(attempt, options[idx].isCorrect);
        setAttempt(next);

        if (isResolved(next)) {
            report(next);
            return;
        }

        /* Another attempt: rule out the option they picked and let them choose
         * again. Nothing is scored until the question resolves. */
        setEliminated((prev) => [...prev, idx]);
        setSelected(null);
        onEvent?.({ type: 'game_retry_used', game: 'meaning_match', word_uuid: word.uuid });
    };

    const handleSkip = () => {
        if (isResolved(attempt)) return;
        const next = skip(attempt);
        setAttempt(next);
        report(next);
        onEvent?.({ type: 'game_skip_used', game: 'meaning_match', word_uuid: word.uuid });
    };

    const advance = () => {
        if (index + 1 >= deck.length) {
            onComplete();
        } else {
            setIndex((i) => i + 1);
            setSelected(null);
            setEliminated([]);
            setAttempt(startClock(beginWord({ mode })));
        }
    };

    /* `correctMeaning` is gone: the answer panel renders the meaning from the
     * adapted word, so this game no longer needs its own copy of that logic. */
    const resolved = isResolved(attempt);

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

            {resolved ? (
                /* The shared answer panel, and a Continue the player presses.
                 * This was a 1500ms timer and a `+5 XP` line. */
                <div className="flex-1 overflow-y-auto">
                    <AnswerReveal
                        word={word}
                        outcome={attempt.outcome}
                        languageCode={languageCode}
                        language={language}
                        onContinue={advance}
                        isLast={index + 1 >= deck.length}
                    />
                </div>
            ) : (
                <>
                    {/* Options. A wrong pick greys that option out and the
                     *  player chooses again — it no longer ends the question. */}
                    <div className="flex flex-1 flex-col justify-center gap-3">
                        {options.map((opt, i) => {
                            const isOut = eliminated.includes(i);
                            let bg =
                                'bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700';
                            let textColor = 'text-gray-800 dark:text-gray-200';

                            if (isOut) {
                                bg = 'border-2 border-gray-200 dark:border-gray-700 opacity-40';
                                textColor = 'text-gray-400 line-through';
                            } else if (i === selected) {
                                bg = 'border-2 border-pink-400';
                            }

                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleSelect(i)}
                                    disabled={isOut}
                                    className={`min-h-[56px] w-full rounded-xl px-5 py-4 text-left text-base font-medium transition-all ${bg} ${textColor}`}
                                >
                                    {opt.text}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-2">
                        <span className="text-xs text-gray-400">
                            {attempt.maxAttempts - attempt.attemptsUsed} left
                        </span>
                        <button
                            type="button"
                            onClick={handleSkip}
                            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                        >
                            Skip
                            <SkipForward size={16} aria-hidden="true" />
                        </button>
                    </div>
                </>
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
    const others = deck.filter((w, i) => i !== currentIndex && w.domain !== word.domain);

    const seenTexts = new Set([correctText]);
    const distractors = [];

    for (const candidate of [...shuffle(sameDomain), ...shuffle(others)]) {
        const text = getTranslationText(candidate, language);

        if (!text || seenTexts.has(text)) continue;

        distractors.push({ text, isCorrect: false });
        seenTexts.add(text);

        if (distractors.length === 2) break;
    }

    return shuffle([{ text: correctText, isCorrect: true }, ...distractors]);
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
