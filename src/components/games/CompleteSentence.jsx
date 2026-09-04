import React, { useState, useMemo, useRef, useEffect } from 'react';
import AccessoryBar from '../AccessoryBar.jsx';
import AnswerReveal from '../AnswerReveal.jsx';
import { MODE, OUTCOME, xpFor } from '../../pedagogy.js';
import { isSpellable, segmentHeadword } from '../../orthography.js';
import { SkipForward } from 'lucide-react';

/**
 * CompleteSentence — Game 4.4
 *
 * An example sentence is shown with the target word blanked out.
 * Player types the missing word using the keyboard + AccessoryBar.
 * Wrong answers progressively reveal letters.
 *
 * Only words with an example sentence are used. Supports both the /game-set shape
 * (word.example: { sentence, translation_en }) and the /lookup shape
 * (word.example_sentences[0]: { sentence, translation_en, translation_fr, ... }).
 *
 * Props:
 *   words      {Array}    Game-set words
 *   language   {string}   'en' | 'fr'
 *   onResult   {Function} (uuid, outcome, attempts, xp, timeMs) => void
 *   onComplete {Function} () => void
 */
export default function CompleteSentence({
    words,
    language,
    languageCode,
    mode = MODE.PRACTICE,
    onResult,
    onComplete,
    onEvent,
}) {
    // Require the headword to actually appear in the sentence — otherwise the blank
    // substitution is a no-op and the answer is left visible, defeating the game.
    const deck = useMemo(
        () =>
            shuffle(
                words.filter((w) => {
                    /* Spellable first: the player has to WRITE the word into
                     * the blank, so `0`, `00jo0` and `suno tey` are rounds
                     * that cannot be won however good the sentence is. */
                    if (!isSpellable(w.headword ?? '', languageCode)) return false;
                    const example = w.example ?? w.example_sentences?.[0] ?? null;
                    return (
                        example?.sentence &&
                        w.headword &&
                        new RegExp(escapeRegex(w.headword), 'i').test(example.sentence)
                    );
                })
            ),
        /* `languageCode` belongs here: the spellable filter depends on it, so
         * omitting it left the previous language's deck in place after a
         * language change — the same stale-state class as the domain filter
         * bug in GameShell. */
        [words, languageCode]
    );

    const [index, setIndex] = useState(0);
    const [input, setInput] = useState('');
    const [attempts, setAttempts] = useState(0);
    const [revealed, setRevealed] = useState('');
    const [status, setStatus] = useState(null);
    /*
     * The outcome this word resolved to. Held rather than derived from
     * `status`, because `status: 'wrong'` cannot distinguish out-of-attempts
     * from skipped, and those are different outcomes.
     */
    const [outcome, setOutcome] = useState(null); /* 'correct' | 'wrong' | null */
    const inputRef = useRef(null);
    const wordStartRef = useRef(Date.now());

    const word = deck[index];

    /* Reset the per-word timer whenever a new word is presented. */
    useEffect(() => {
        wordStartRef.current = Date.now();
    }, [index]);

    if (deck.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                <p className="text-gray-400 italic text-sm">
                    No words with example sentences in this set.
                </p>
                <button
                    type="button"
                    onClick={onComplete}
                    className="px-4 py-2 rounded-xl font-semibold text-sm text-white transition-colors"
                    style={{ background: '#E91E8C' }}
                >
                    Return to Menu
                </button>
            </div>
        );
    }

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
                    None of these words have a sentence that can be completed.
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

    const target = word.headword;
    const example = word.example ?? word.example_sentences?.[0] ?? null;
    const sentence = example?.sentence ?? '';
    const sentenceTranslation =
        language === 'fr' && example?.translation_fr
            ? example.translation_fr
            : (example?.translation_en ?? '');

    /* Replace first occurrence of the headword (case-insensitive) with blanks. */
    const regex = new RegExp(`(${escapeRegex(target)})`, 'i');
    const blankDisplay =
        status === 'correct'
            ? target
            : revealed + '_'.repeat(Math.max(0, target.length - revealed.length));
    const displaySentence = sentence.replace(regex, `[${blankDisplay}]`);

    const handleSubmit = (e) => {
        e?.preventDefault();
        if (status === 'correct') return;

        const attempt = input.trim();
        const isCorrect = attempt.toLowerCase() === target.toLowerCase();

        if (isCorrect) {
            setStatus('correct');
            /*
             * Full credit only on the first attempt with no letters given.
             * After a retry this is the engine manifest's `learning` — got
             * there, with help — which is what pays 5 rather than 10. The old
             * code always reported `correct`, so a player who needed all three
             * attempts was paid the same as one who knew it outright.
             */
            const resolved = attempts === 0 ? OUTCOME.CORRECT : OUTCOME.LEARNING;
            setOutcome(resolved);
            onResult(
                word.uuid,
                resolved,
                attempts + 1,
                xpFor(resolved),
                Date.now() - wordStartRef.current
            );
        } else {
            const nextAttempts = attempts + 1;
            setAttempts(nextAttempts);
            setInput('');

            if (nextAttempts >= 3) {
                /* Show full word and advance. */
                setRevealed(target);
                setStatus('wrong');
                /*
                 * Out of attempts is `incorrect`, worth nothing. This reported
                 * `learning`, which the engine's manifest scores at +5 — so a
                 * word the player never got right was paid for server-side
                 * while the screen showed 0. The ledger and the UI disagreed,
                 * and the ledger was the generous one.
                 */
                setOutcome(OUTCOME.INCORRECT);
                onResult(
                    word.uuid,
                    OUTCOME.INCORRECT,
                    nextAttempts,
                    xpFor(OUTCOME.INCORRECT),
                    Date.now() - wordStartRef.current
                );
            } else {
                /*
                 * Reveal the next ORTHOGRAPHIC UNIT, not the next character.
                 * `substring(0, 1)` of `njemboo` gives `n`, which is half of
                 * `nj` and teaches the wrong shape of the word.
                 */
                /*
                 * Challenge mode holds the reveal back one attempt, matching
                 * `hintLevelFor`. It does not remove it: a player who cannot
                 * get the word must still be able to finish, in either mode.
                 */
                const unitsGiven = mode === MODE.CHALLENGE ? nextAttempts - 1 : nextAttempts;
                setRevealed(
                    segmentHeadword(target, languageCode).slice(0, Math.max(0, unitsGiven)).join('')
                );
            }
        }
    };

    /* Skip. Always available, in both modes — neither game had any way out
     * short of spending all three attempts. */
    const handleSkip = () => {
        if (status === 'correct' || outcome !== null) return;
        setRevealed(target);
        setStatus('wrong');
        setOutcome(OUTCOME.SKIPPED);
        onResult(
            word.uuid,
            OUTCOME.SKIPPED,
            Math.max(1, attempts),
            xpFor(OUTCOME.SKIPPED),
            Date.now() - wordStartRef.current
        );
        onEvent?.({ type: 'game_skip_used', game: 'complete_sentence', word_uuid: word.uuid });
    };

    const advance = () => {
        if (index + 1 >= deck.length) {
            onComplete();
        } else {
            setIndex((i) => i + 1);
            setInput('');
            setAttempts(0);
            setRevealed('');
            setStatus(null);
            setOutcome(null);
        }
    };

    return (
        <div className="flex flex-col h-full p-4 gap-4">
            {/* Header */}
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 shrink-0">
                <span className="font-semibold" style={{ color: '#E91E8C' }}>
                    Complete the Sentence
                </span>
                <span>
                    {index + 1} / {deck.length}
                </span>
            </div>

            <ProgressBar current={index} total={deck.length} />

            {/* Sentence display */}
            <div
                className="shrink-0 p-4 rounded-xl border-l-4"
                style={{ background: '#F8F9FA', borderColor: '#E91E8C' }}
            >
                <p className="text-base text-gray-800 leading-relaxed">{displaySentence}</p>
                {sentenceTranslation && (
                    <p className="text-sm text-gray-500 italic mt-2">{sentenceTranslation}</p>
                )}
            </div>

            {/* Blank tiles (word length indicator) */}
            <div className="flex gap-1.5 justify-center flex-wrap shrink-0">
                {target.split('').map((char, i) => {
                    const isKnown = i < revealed.length || status === 'correct';
                    return (
                        <div
                            key={i}
                            className="w-8 h-9 flex items-center justify-center rounded border-b-2 font-bold text-base uppercase"
                            style={
                                isKnown
                                    ? {
                                          borderColor: status === 'correct' ? '#4CAF50' : '#E91E8C',
                                          color: '#374151',
                                      }
                                    : { borderColor: '#E91E8C', color: 'transparent' }
                            }
                        >
                            {isKnown ? (i < revealed.length ? revealed[i] : char) : '_'}
                        </div>
                    );
                })}
            </div>

            {/* Resolved: the shared answer panel. Nothing auto-advances —
             *  the 1500/2000ms timers took the answer away before it could be
             *  read, which is the opposite of what feedback is for. */}
            {outcome !== null && (
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

            {/* Escape, always available. */}
            {outcome === null && (
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

            {/* Input form */}
            {outcome === null && (
                <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Type the missing word (${target.length} letters)`}
                        className="flex-1 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none text-sm"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-aiwa-input="true"
                    />
                    <button
                        type="submit"
                        className="px-4 py-3 rounded-xl font-semibold text-sm text-white transition-colors"
                        style={{ background: '#E91E8C' }}
                    >
                        Check
                    </button>
                </form>
            )}

            {/* Hint for attempts */}
            {attempts > 0 && !status && (
                <p className="text-xs text-gray-400 text-center shrink-0">
                    Hint: starts with &ldquo;{revealed}&rdquo;
                </p>
            )}

            {/* Accessory bar — rendered at fixed bottom above keyboard */}
            <AccessoryBar />
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

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
