import React, { useState, useMemo, useRef } from 'react';
import { SkipForward } from 'lucide-react';
import AnswerReveal from '../AnswerReveal.jsx';
import { MODE, OUTCOME, xpFor } from '../../pedagogy.js';
import { keysFor, partitionSpellable, segmentHeadword } from '../../orthography.js';

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
 *   onResult   {Function} (uuid, outcome, attempts, xp, timeMs) => void
 *   onComplete {Function} () => void
 */

/*
 * ==================== WHAT WAS WRONG HERE ====================
 *
 * This game shipped two hardcoded inventories and the corpus contradicts both:
 *
 *   const STANDARD_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('')
 *   const MANDINKA_CHARS = ['ŋ', 'ɓ', 'ɗ', 'ñ', 'ɲ', 'ʔ']
 *
 * Measured over 488 real entries (`scripts/analyze-orthography.mjs`), NOT ONE
 * of those six characters occurs — zero occurrences each. The "Mandinka row"
 * was six permanent buttons that could never be a correct answer, taking space
 * on a phone screen from a keyboard the player does need. Meanwhile `v`, `x`
 * and `z` never occur either, and `q` (0.10%) and `g` (0.03%) sit at or below
 * the elimination threshold Mattiev et al. apply.
 *
 * What the corpus DOES have is long vowels: `oo` in 34.8% of headwords, `aa` in
 * 29.6%. Splitting with `.split('')` made those two taps of the same key rather
 * than one unit, so the game taught that `njemboo` ends in two o's instead of
 * one long vowel.
 *
 * The inventory now comes from `keysFor()`, which is derived from the data and
 * always includes every unit the answer needs — so no round can be unwinnable
 * for want of a key.
 */
/*
 * Wrong LETTER guesses allowed, by mode.
 *
 * Five rather than the shared loop's three attempts, because a guess here is
 * one letter and not one attempt at the whole word — three would end most
 * rounds before a player could reason the word out. Challenge allows three,
 * which is the mode difference made real rather than cosmetic.
 *
 * Whichever number applies, the invariant the shared loop protects still holds:
 * the round always ends, the answer is always shown, and Skip is always there.
 */
const MAX_WRONG_BY_MODE = { [MODE.PRACTICE]: 5, [MODE.CHALLENGE]: 3 };

export default function LetterReveal({
    words,
    language,
    languageCode,
    mode = MODE.PRACTICE,
    onResult,
    onComplete,
    onEvent,
}) {
    /* Only words that can be spelled. Keeps `0`, `00jo0`, `suno tey` and
     * `toolee. - 126-` — all real sampled headwords — out of a letter game. */
    const deck = useMemo(
        () => shuffle(partitionSpellable(words ?? [], languageCode).spellable),
        [words, languageCode]
    );
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(new Set());
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [wrongLetters, setWrongLetters] = useState(new Set());
    const [done, setDone] = useState(false);
    /*
     * The outcome this word resolved to, held rather than re-derived.
     *
     * It cannot be inferred from the board: a word that is not fully revealed
     * is EITHER out-of-guesses (`incorrect`) OR skipped (`skipped`), and those
     * are different facts that happen to look identical on screen. Deriving it
     * would have silently reported one as the other.
     */
    const [outcome, setOutcome] = useState(null);
    const [tiltCount, setTiltCount] = useState(0);
    const revealedRef = useRef(new Set());
    const wrongGuessesRef = useRef(0);
    const wrongLettersRef = useRef(new Set());
    const doneRef = useRef(false);
    const wordStartRef = useRef(Date.now());

    const maxWrong = MAX_WRONG_BY_MODE[mode] ?? MAX_WRONG_BY_MODE[MODE.PRACTICE];

    const word = deck[index];

    if (!word) {
        /*
         * Nothing this game can deal. Returning null rendered a BLANK SCREEN,
         * which reads as a loading failure and leaves the player with nothing
         * to press — the same dead end, arrived at differently. Say what
         * happened and offer the way out.
         */
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-gray-700 dark:text-gray-200">
                    None of these words can be played as a letter round.
                </p>
                <button
                    type="button"
                    onClick={onComplete}
                    className="min-h-[44px] rounded-xl bg-gray-900 px-5 font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                >
                    Back
                </button>
            </div>
        );
    }

    /* Orthographic units, not code points: `oo` and `nj` are one tap each. */
    const letters = segmentHeadword(word.headword.toLowerCase(), languageCode);
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
                /*
                 * `correct` only if the player never guessed wrong. Otherwise
                 * this is the manifest's `learning` — got there, with misses
                 * along the way — which is what pays 5 rather than 10. The old
                 * code reported `correct` with a hardcoded `attempts` of 1 no
                 * matter how many wrong letters had been tapped.
                 */
                const clean = wrongGuessesRef.current === 0;
                const resolved = clean ? OUTCOME.CORRECT : OUTCOME.LEARNING;
                setOutcome(resolved);
                onResult(
                    word.uuid,
                    resolved,
                    Math.max(1, wrongGuessesRef.current + 1),
                    /* `resolved`, not the `outcome` state — that setter has not
                     * flushed yet, so reading it here reports the PREVIOUS
                     * word's outcome (or null, worth 0) for a correct answer. */
                    xpFor(resolved),
                    Date.now() - wordStartRef.current
                );
            }
        } else {
            const nextWrong = wrongGuessesRef.current + 1;
            const nextWrongLetters = new Set(wrongLettersRef.current).add(letter);

            wrongGuessesRef.current = nextWrong;
            wrongLettersRef.current = nextWrongLetters;

            setWrongGuesses(nextWrong);
            setWrongLetters(nextWrongLetters);
            setTiltCount((c) => c + 1);

            if (nextWrong >= maxWrong) {
                doneRef.current = true;
                setDone(true);
                /*
                 * Out of guesses is `incorrect`, which pays nothing. It used to
                 * report `learning`, and the engine's manifest scores that at
                 * +5 — so a player who never revealed the word was paid five
                 * points server-side while the screen showed 0.
                 *
                 * MAX_WRONG stays at 5 rather than the shared default of 3:
                 * a guess here is one LETTER, not one attempt at the whole
                 * word, so three would end most rounds before a player could
                 * work the word out. The invariant the shared loop protects —
                 * that the round always ends and the answer is always shown —
                 * holds either way.
                 */
                setOutcome(OUTCOME.INCORRECT);
                onResult(
                    word.uuid,
                    OUTCOME.INCORRECT,
                    nextWrong,
                    xpFor(OUTCOME.INCORRECT),
                    Date.now() - wordStartRef.current
                );
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
            wordStartRef.current = Date.now();
            setRevealed(new Set());
            setWrongGuesses(0);
            setWrongLetters(new Set());
            setDone(false);
            setOutcome(null);
            setTiltCount(0);
        }
    };

    /*
     * The keys to offer, derived from the corpus and from this word.
     *
     * `keysFor` guarantees every unit the answer needs is present, which is the
     * trap-prevention half of the old `extraMandinka` workaround — except it no
     * longer needs a second row of invented characters to work around.
     */
    const keys = keysFor(word.headword, languageCode);

    /* Skip. Always available, in both modes, at any point in the round —
     * the game previously had no way out other than five wrong guesses. */
    const handleSkip = () => {
        if (doneRef.current) return;
        doneRef.current = true;
        setDone(true);
        setOutcome(OUTCOME.SKIPPED);
        onResult(
            word.uuid,
            OUTCOME.SKIPPED,
            Math.max(1, wrongGuessesRef.current),
            xpFor(OUTCOME.SKIPPED),
            Date.now() - wordStartRef.current
        );
        onEvent?.({ type: 'game_skip_used', game: 'letter_reveal', word_uuid: word.uuid });
    };

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
                {Array.from({ length: maxWrong }).map((_, i) => (
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
                    const isRevealed = revealed.has(letter) || done;
                    return (
                        <div
                            key={i}
                            /* No `uppercase`: it changes the glyph the player is matching,
                             * a unit like `oo` needs the width, and not every
                             * orthography has a case pair. */
                            className="flex h-11 min-w-[36px] items-center justify-center rounded-lg border-b-2 px-1 text-lg font-bold"
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

            {/* Resolved: the shared answer panel, and nothing auto-advances.
             *  This used to be a `+5 XP ✓` line and a 1200ms timer, which took
             *  the answer away before it could be read. */}
            {done && (
                <div className="flex-1 overflow-y-auto">
                    <AnswerReveal
                        word={word}
                        outcome={outcome}
                        languageCode={languageCode}
                        language={language}
                        onContinue={advance}
                        isLast={index + 1 >= deck.length}
                    />
                </div>
            )}

            {/* Escape. Present in both modes and at any point in the round —
             *  previously the only way out was five wrong guesses. */}
            {!done && (
                <div className="flex shrink-0 justify-end">
                    <button
                        type="button"
                        onClick={handleSkip}
                        className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        Skip
                        <SkipForward size={16} aria-hidden="true" />
                    </button>
                </div>
            )}

            {/* One keyboard, measured. The second row of six invented Mandinka
             *  characters is gone — none of them occurs in the corpus. */}
            <div className={`flex flex-1 flex-col justify-end gap-2${done ? ' hidden' : ''}`}>
                <div className="flex flex-wrap justify-center gap-1.5">
                    {keys.map((letter) => (
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
