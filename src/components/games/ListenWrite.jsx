import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Volume2, RotateCcw } from 'lucide-react';
import AccessoryBar from '../AccessoryBar.jsx';
import AnswerReveal from '../AnswerReveal.jsx';
import { MODE, OUTCOME, xpFor } from '../../pedagogy.js';
import { isSpellable, segmentHeadword } from '../../orthography.js';
import { SkipForward } from 'lucide-react';

/**
 * ListenWrite — Game 4.1
 *
 * The most important game. Audio plays automatically → player writes the word.
 * Only words with audio_url are used.
 * Wrong answers progressively reveal letters (up to 3 attempts).
 * Correct answer shows tiles fill green and IPA/translation confirmation.
 *
 * Props:
 *   words      {Array}    Game-set words
 *   language   {string}   'en' | 'fr'
 *   onResult   {Function} (uuid, outcome, attempts, xp, timeMs) => void
 *   onComplete {Function} () => void
 */
export default function ListenWrite({
    words,
    language,
    languageCode,
    mode = MODE.PRACTICE,
    onResult,
    onComplete,
    onEvent,
}) {
    /*
     * Needs a recording AND a spellable headword: the player types the word,
     * so an unspellable one is unwinnable even with perfect audio.
     */
    const deck = useMemo(
        () =>
            shuffle(
                words.filter((w) => !!w.audio_url && isSpellable(w.headword ?? '', languageCode))
            ),
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
    const audioRef = useRef(null);
    const wordStartRef = useRef(Date.now());

    const word = deck[index];

    /* Reset the per-word timer whenever a new word is presented. */
    useEffect(() => {
        wordStartRef.current = Date.now();
    }, [index]);

    /* Auto-play audio when word changes — reuse a single Audio instance. */
    useEffect(() => {
        if (!word?.audio_url) return;
        const audio = audioRef.current ?? (audioRef.current = new Audio());
        audio.pause();
        audio.src = word.audio_url;
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return () => {
            audio.pause();
        };
    }, [index, word?.audio_url]);

    if (deck.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                <p className="text-gray-400 italic text-sm">
                    No words with audio in this set.
                    <br />
                    Try a different domain or language.
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
                    None of these words have a recording to listen to.
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

    const playAudio = () => {
        const audio = audioRef.current;
        if (!audio || !word?.audio_url) return;
        audio.pause();
        audio.currentTime = 0;
        audio.play().catch(() => {});
    };

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
        onEvent?.({ type: 'game_skip_used', game: 'listen_write', word_uuid: word.uuid });
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
                    Listen &amp; Write
                </span>
                <span>
                    {index + 1} / {deck.length}
                </span>
            </div>

            <ProgressBar current={index} total={deck.length} />

            {/* Audio section */}
            <div className="shrink-0 flex flex-col items-center gap-3 py-4">
                <button
                    type="button"
                    onClick={playAudio}
                    className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #E91E8C 0%, #7B3FA0 100%)' }}
                    aria-label="Play pronunciation audio"
                >
                    <Volume2 size={36} className="text-white" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={playAudio}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-pink-500 transition-colors"
                >
                    <RotateCcw size={12} aria-hidden="true" /> Play again
                </button>
            </div>

            {/* IPA */}
            {word.ipa && (
                <p className="text-center text-sm font-mono text-gray-400 shrink-0">/{word.ipa}/</p>
            )}

            {/* Blank tiles */}
            <div className="flex gap-1.5 justify-center flex-wrap shrink-0">
                {target.split('').map((char, i) => {
                    const isKnown = i < revealed.length || status === 'correct';
                    return (
                        <div
                            key={i}
                            className="w-8 h-10 flex items-center justify-center rounded border-b-2 font-bold text-base uppercase"
                            style={
                                isKnown
                                    ? {
                                          background: status === 'correct' ? '#E8F5E9' : '#FFEBEE',
                                          borderColor: status === 'correct' ? '#4CAF50' : '#E91E8C',
                                          color: '#374151',
                                      }
                                    : { borderColor: '#7B3FA0', color: 'transparent' }
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

            {/* Input */}
            {outcome === null && (
                <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Write what you heard (${target.length} letters)`}
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
            {attempts > 0 && outcome === null && (
                <p className="text-xs text-gray-400 text-center shrink-0">
                    Starts with &ldquo;{revealed}&rdquo;
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

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
