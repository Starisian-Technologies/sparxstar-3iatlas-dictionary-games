import React, { useState, useMemo, useRef } from 'react';

/**
 * LetterReveal — Game 4.5
 *
 * Blank tiles for each letter of the hidden word.
 * Player taps letters from a pool — correct letters reveal in word,
 * wrong letters increment a counter (5 wrong = word skipped).
 * Mandinka-specific characters are displayed in a second row.
 *
 * Props:
 *   words      {Array}    Game-set words
 *   language   {string}   'en' | 'fr'
 *   onResult   {Function} (uuid, outcome, attempts, xp) => void
 *   onComplete {Function} () => void
 */

const STANDARD_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const MANDINKA_CHARS = ['ŋ', 'ɓ', 'ɗ', 'ñ', 'ɲ', 'ʔ'];
const MAX_WRONG = 5;

export default function LetterReveal({ words, language, onResult, onComplete }) {
    const deck = useMemo(() => shuffle(words), [words]);
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(new Set());
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [wrongLetters, setWrongLetters] = useState(new Set());
    const [done, setDone] = useState(false);
    const [tiltCount, setTiltCount] = useState(0);
    const revealedRef = useRef(new Set());
    const wrongGuessesRef = useRef(0);
    const wrongLettersRef = useRef(new Set());
    const doneRef = useRef(false);

    const word = deck[index];
    if (!word) return null;

    const letters = word.headword.toLowerCase().split('');
    const uniqueLetters = new Set(letters);
    const meaning =
        language === 'fr' && word.translation_fr ? word.translation_fr : word.translation_en;

    const allRevealed = [...uniqueLetters].every((l) => revealed.has(l));

    const handleLetterTap = (letter) => {
        if (
            doneRef.current ||
            revealedRef.current.has(letter) ||
            wrongLettersRef.current.has(letter)
        ) {
            return;
        }

        if (uniqueLetters.has(letter)) {
            /*
             * Update the ref synchronously BEFORE scheduling the state update.
             * Doing it inside the setRevealed updater leaves revealedRef.current
             * stale until React flushes, so a rapid double-tap of the same letter
             * passes the guard twice — duplicate onResult + overlapping timeouts.
             */
            const next = new Set(revealedRef.current).add(letter);
            revealedRef.current = next;
            setRevealed(next);

            /* Check if word is fully revealed. */
            const complete = [...uniqueLetters].every((l) => next.has(l));
            if (complete) {
                doneRef.current = true;
                setDone(true);
                onResult(word.uuid, 'correct', 1, 5);
                setTimeout(() => advance(), 1200);
            }
        } else {
            const nextWrong = wrongGuessesRef.current + 1;
            const nextWrongLetters = new Set(wrongLettersRef.current).add(letter);

            wrongGuessesRef.current = nextWrong;
            wrongLettersRef.current = nextWrongLetters;

            setWrongGuesses(nextWrong);
            setWrongLetters(nextWrongLetters);
            setTiltCount((c) => c + 1);

            if (nextWrong >= MAX_WRONG) {
                doneRef.current = true;
                setDone(true);
                onResult(word.uuid, 'learning', 1, 0);
                setTimeout(() => advance(), 1800);
            }
        }
    };

    const advance = () => {
        if (index + 1 >= deck.length) {
            onComplete();
        } else {
            setIndex((i) => i + 1);
            revealedRef.current = new Set();
            wrongGuessesRef.current = 0;
            wrongLettersRef.current = new Set();
            doneRef.current = false;
            setRevealed(new Set());
            setWrongGuesses(0);
            setWrongLetters(new Set());
            setDone(false);
            setTiltCount(0);
        }
    };

    /* Word characters that are in neither the standard alphabet nor the fixed
     * Mandinka row (e.g. accented vowels) — surface them in the tap pool so the
     * word can actually be completed rather than soft-locking. */
    const extraMandinka = letters.filter(
        (c) => !STANDARD_ALPHABET.includes(c) && !MANDINKA_CHARS.includes(c)
    );

    return (
        <div className="flex flex-col h-full p-4 gap-3">
            {/* Header */}
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 shrink-0">
                <span className="font-semibold" style={{ color: '#E91E8C' }}>
                    Letter Reveal
                </span>
                <span>
                    {index + 1} / {deck.length}
                </span>
            </div>

            <ProgressBar current={index} total={deck.length} />

            {/* Meaning hint */}
            <p className="text-center text-base font-semibold text-gray-800 dark:text-gray-200 shrink-0">
                {meaning}
            </p>

            {/* Pottery vessel — tilts on wrong answers (cultural engagement hook). */}
            {/* OQ-G3: Replace emoji with AIWA-approved cultural visual when confirmed. */}
            <div
                className="shrink-0 flex justify-center text-4xl transition-transform duration-300"
                style={{
                    transform: `rotate(${Math.min(tiltCount * 8, 40)}deg)`,
                    filter: done && allRevealed ? 'none' : 'grayscale(0)',
                }}
                aria-hidden="true"
            >
                🏺
            </div>

            {/* Wrong guess counter */}
            <div className="shrink-0 flex justify-center gap-1">
                {Array.from({ length: MAX_WRONG }).map((_, i) => (
                    <div
                        key={i}
                        className="w-5 h-5 rounded-full border-2 transition-colors"
                        style={
                            i < wrongGuesses
                                ? { background: '#E91E8C', borderColor: '#E91E8C' }
                                : { borderColor: '#d1d5db' }
                        }
                    />
                ))}
            </div>

            {/* Word tiles */}
            <div className="flex flex-wrap gap-2 justify-center shrink-0 px-2">
                {letters.map((letter, i) => {
                    const isRevealed = revealed.has(letter) || (done && wrongGuesses >= MAX_WRONG);
                    return (
                        <div
                            key={i}
                            className="w-9 h-10 flex items-center justify-center rounded-lg border-b-2 font-bold text-lg uppercase"
                            style={
                                isRevealed
                                    ? {
                                          background: '#E8F5E9',
                                          borderColor: '#4CAF50',
                                          color: '#2E7D32',
                                      }
                                    : { borderColor: '#E91E8C', color: 'transparent' }
                            }
                        >
                            {isRevealed ? letter : '_'}
                        </div>
                    );
                })}
            </div>

            {/* Correct feedback */}
            {done && allRevealed && (
                <p className="text-center text-green-600 font-bold shrink-0">+5 XP ✓</p>
            )}
            {done && wrongGuesses >= MAX_WRONG && (
                <p className="text-center text-gray-500 text-sm shrink-0">Still learning</p>
            )}

            {/* Standard alphabet pool */}
            <div className="flex-1 flex flex-col gap-2 justify-end">
                <div className="flex flex-wrap gap-1.5 justify-center">
                    {STANDARD_ALPHABET.map((letter) => (
                        <LetterButton
                            key={letter}
                            letter={letter}
                            state={
                                revealed.has(letter)
                                    ? 'correct'
                                    : wrongLetters.has(letter)
                                      ? 'wrong'
                                      : 'idle'
                            }
                            onClick={() => handleLetterTap(letter)}
                            disabled={done}
                        />
                    ))}
                </div>

                {/* Mandinka-specific character row — always shown. */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                    {[...MANDINKA_CHARS, ...Array.from(new Set(extraMandinka))].map((letter) => (
                        <LetterButton
                            key={letter}
                            letter={letter}
                            state={
                                revealed.has(letter)
                                    ? 'correct'
                                    : wrongLetters.has(letter)
                                      ? 'wrong'
                                      : 'mandinka'
                            }
                            onClick={() => handleLetterTap(letter)}
                            disabled={done}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function LetterButton({ letter, state, onClick, disabled }) {
    let bg = '#f3f4f6';
    let color = '#374151';
    let extraClass = '';

    if (state === 'correct') {
        bg = '#E8F5E9';
        color = '#2E7D32';
    } else if (state === 'wrong') {
        bg = '#FFEBEE';
        color = '#C62828';
        extraClass = 'line-through opacity-60';
    } else if (state === 'mandinka') {
        bg = '#FCE4F3';
        color = '#E91E8C';
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || state === 'correct' || state === 'wrong'}
            className={`w-8 h-8 rounded font-semibold text-sm uppercase transition-colors ${extraClass}`}
            style={{ background: bg, color }}
            aria-label={letter}
        >
            {letter}
        </button>
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
