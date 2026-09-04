import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, SkipForward } from 'lucide-react';
import AnswerReveal from '../AnswerReveal.jsx';
import {
    MODE,
    beginWord,
    currentHintLevel,
    isResolved,
    recordAnswer,
    resultFor,
    skip,
    startClock,
    takeHint,
} from '../../pedagogy.js';
import { partitionSpellable, segmentHeadword } from '../../orthography.js';

/**
 * Arrange the Word — tap the scrambled units into order.
 *
 * ===================== WHAT WAS WRONG HERE =====================
 *
 * This game had NO FAILURE PATH. A wrong arrangement shook, returned the tiles
 * to the pool, and waited. There was no attempt counter, no hint, no Skip, no
 * reveal, and no `onResult` call for anything but success — so a player who
 * could not spell the word was stuck on it permanently, the word was never
 * recorded, and it never entered the review queue. It was the clearest case of
 * a game that tested knowledge instead of teaching it: if you already knew the
 * word you passed, and if you did not, the game had nothing for you.
 *
 * It also reported `onResult(uuid, 'correct', 1, 5, …)` — a hardcoded attempt
 * count of 1 no matter how many times the player had failed, and an XP value
 * that matched neither the other games nor what the engine settles.
 *
 * And it built its tile pool with `headword.split('')`, which is the wrong
 * reading of this orthography: `njemboo` became seven tiles, `n j e m b o o`,
 * when the word is five units, `nj e m b oo`. Measured on the approved corpus,
 * `oo` appears in 34.8% of headwords and `aa` in 29.6%
 * (`scripts/analyze-orthography.mjs`).
 *
 * ===================== WHAT IT DOES NOW =====================
 *
 * Tiles are orthographic units. Three attempts, then the answer, with help
 * getting stronger each time: first the first unit's position, then the first
 * two, then the answer. Skip is always available. Nothing auto-advances — the
 * player presses Continue when they have finished reading.
 *
 * Words that cannot be spelled are never dealt (`partitionSpellable`), which is
 * how `0`, `00jo0` and `toolee. - 126-` stop reaching a spelling game.
 */
export default function ArrangeWord({
    words,
    language,
    languageCode,
    mode = MODE.PRACTICE,
    onResult,
    onComplete,
    onEvent,
}) {
    /*
     * Only spellable words, decided before the round starts.
     *
     * The rejects are reported rather than silently dropped: a player who asked
     * for ten words and gets eight deserves the count to be honest, and an
     * operator deserves to know the corpus is feeding unplayable rows into a
     * game. `onEvent` is optional so the component still works unwired.
     */
    const { deck, rejected } = useMemo(() => {
        const partitioned = partitionSpellable(words ?? [], languageCode);
        return { deck: shuffle(partitioned.spellable), rejected: partitioned.rejected };
    }, [words, languageCode]);

    const [index, setIndex] = useState(0);
    const [attempt, setAttempt] = useState(() => startClock(beginWord({ mode })));
    const [tileState, setTileState] = useState({ pool: [], answer: [], initialPool: [] });
    const [shake, setShake] = useState(false);
    const reportedRef = useRef(new Set());

    const word = deck[index];
    const target = useMemo(
        () => (word ? segmentHeadword(word.headword.toLowerCase(), languageCode) : []),
        [word, languageCode]
    );

    /* Tell the host once about anything the corpus could not offer. */
    useEffect(() => {
        if (rejected.length > 0) {
            onEvent?.({
                type: 'game_words_unplayable',
                game: 'arrange_word',
                count: rejected.length,
                reasons: [...new Set(rejected.map((r) => r.reason))],
            });
        }
    }, [rejected, onEvent]);

    /* Build the pool for whichever word is in play, and reset the attempt. */
    useEffect(() => {
        if (!word) return;
        const pool = shuffle(target.map((unit, i) => ({ unit, id: `${unit}-${i}` })));
        setTileState({ pool, answer: [], initialPool: pool });
        setAttempt(startClock(beginWord({ mode })));
        setShake(false);
        onEvent?.({
            type: 'game_question_shown',
            game: 'arrange_word',
            word_uuid: word.uuid,
            units: target.length,
        });
    }, [word, target, mode, onEvent]);

    /** Report exactly once per word, then hand the outcome up. */
    const report = useCallback(
        (resolved) => {
            if (!word || reportedRef.current.has(word.uuid)) return;
            reportedRef.current.add(word.uuid);
            const { outcome, attempts, xp, timeMs } = resultFor(resolved);
            onResult(word.uuid, outcome, attempts, xp, timeMs);
        },
        [word, onResult]
    );

    /* Check the arrangement once the answer row is full. */
    useEffect(() => {
        if (!word || isResolved(attempt) || tileState.answer.length !== target.length) return;

        const submitted = tileState.answer.map((t) => t.unit).join('');
        const next = recordAnswer(attempt, submitted === target.join(''));
        setAttempt(next);

        if (isResolved(next)) {
            report(next);
            return;
        }

        /* Another attempt. Shake, then return the tiles WITHOUT reshuffling, so
         * the player keeps their mental map of what is available. */
        onEvent?.({ type: 'game_retry_used', game: 'arrange_word', word_uuid: word.uuid });
        setShake(true);
        const timer = setTimeout(() => {
            setShake(false);
            setTileState((prev) => ({ ...prev, pool: prev.initialPool, answer: [] }));
        }, 600);
        return () => clearTimeout(timer);
    }, [tileState.answer, target, word, attempt, report, onEvent]);

    const advance = useCallback(() => {
        if (index + 1 >= deck.length) onComplete();
        else setIndex((i) => i + 1);
    }, [index, deck.length, onComplete]);

    const handleHint = useCallback(() => {
        setAttempt((a) => takeHint(a));
        onEvent?.({ type: 'game_hint_used', game: 'arrange_word', word_uuid: word?.uuid });
    }, [word, onEvent]);

    const handleSkip = useCallback(() => {
        const next = skip(attempt);
        setAttempt(next);
        report(next);
        onEvent?.({ type: 'game_skip_used', game: 'arrange_word', word_uuid: word?.uuid });
    }, [attempt, report, word, onEvent]);

    const pickFromPool = useCallback(
        (tileId) => {
            /* Taps during the shake would be discarded when the row resets. */
            if (isResolved(attempt) || shake || !word) return;
            setTileState((prev) => {
                const idx = prev.pool.findIndex((t) => t.id === tileId);
                if (idx === -1) return prev; /* guard: already picked */
                return {
                    ...prev,
                    pool: prev.pool.filter((_, i) => i !== idx),
                    answer: [...prev.answer, prev.pool[idx]],
                };
            });
        },
        [attempt, shake, word]
    );

    const returnToPool = useCallback(
        (answerIdx) => {
            if (isResolved(attempt)) return;
            setTileState((prev) => {
                const tile = prev.answer[answerIdx];
                if (typeof tile === 'undefined') return prev;
                /* Reinsert at its original pool position so the pool does not
                 * reorder under the player's fingers. */
                const originalIdx = prev.initialPool.indexOf(tile);
                const insertAt = prev.pool.findIndex(
                    (poolTile) => prev.initialPool.indexOf(poolTile) > originalIdx
                );
                const pool =
                    insertAt === -1
                        ? [...prev.pool, tile]
                        : [...prev.pool.slice(0, insertAt), tile, ...prev.pool.slice(insertAt)];
                return {
                    ...prev,
                    pool,
                    answer: prev.answer.filter((_, i) => i !== answerIdx),
                };
            });
        },
        [attempt]
    );

    if (!word) {
        /*
         * Nothing spellable in the whole set. An empty screen would read as a
         * loading failure, so say what happened and let the player leave.
         */
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-gray-700 dark:text-gray-200">
                    None of these words can be arranged as a spelling round.
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

    const meaning =
        language === 'fr' && word.translation_fr ? word.translation_fr : word.translation_en;
    const hintLevel = currentHintLevel(attempt);
    /* Progressive help: how many leading units are shown in place. Capped one
     * short of the word so a hint never simply answers it. */
    const unitsGiven = Math.min(hintLevel, Math.max(0, target.length - 1));
    const resolved = isResolved(attempt);

    return (
        <div className="flex h-full flex-col gap-4 p-4">
            <div className="flex shrink-0 items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold" style={{ color: '#E91E8C' }}>
                    Arrange the Word
                </span>
                <span>
                    {index + 1} / {deck.length}
                </span>
            </div>

            <ProgressBar current={index} total={deck.length} />

            <div className="shrink-0 py-2 text-center">
                <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{meaning}</p>
                {word.domain && (
                    <span
                        className="mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white"
                        style={{ background: '#7B3FA0' }}
                    >
                        {word.domain}
                    </span>
                )}
            </div>

            {resolved ? (
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
                    {/* Answer row. Empty slots show any units the hint has given. */}
                    <div className="flex min-h-[52px] shrink-0 flex-wrap justify-center gap-2 px-2">
                        {tileState.answer.map((tile, i) => (
                            <Tile
                                key={tile.id}
                                unit={tile.unit}
                                onClick={() => returnToPool(i)}
                                variant="answer"
                                shake={shake}
                            />
                        ))}
                        {Array.from({ length: target.length - tileState.answer.length }).map(
                            (_, i) => {
                                const slot = tileState.answer.length + i;
                                const given = slot < unitsGiven ? target[slot] : null;
                                return (
                                    <div
                                        key={`empty-${i}`}
                                        className="flex h-11 min-w-[44px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 px-1 font-mono text-gray-400 dark:border-gray-700"
                                    >
                                        {given}
                                    </div>
                                );
                            }
                        )}
                    </div>

                    <div className="flex flex-1 flex-wrap content-center justify-center gap-2 px-2">
                        {tileState.pool.map((tile) => (
                            <Tile
                                key={tile.id}
                                unit={tile.unit}
                                onClick={() => pickFromPool(tile.id)}
                                variant="pool"
                                shake={false}
                            />
                        ))}
                    </div>

                    {/* Escape and help. Both always present, in both modes. */}
                    <div className="flex shrink-0 items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={handleHint}
                            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                        >
                            <Lightbulb size={16} aria-hidden="true" />
                            Hint
                        </button>
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

/**
 * One tile.
 *
 * `min-w-[44px] h-11` rather than the previous `w-10 h-10`: 40px is below the
 * minimum comfortable tap target, and a tile now holds a UNIT, so `oo` and `nj`
 * need more width than one letter. No `uppercase` — it changes the glyph the
 * player is being asked to match, and not every orthography has a case pair.
 */
function Tile({ unit, onClick, variant, shake }) {
    const bg = variant === 'answer' ? '#E91E8C' : '#7B3FA0';
    return (
        <button
            type="button"
            onClick={onClick}
            className={`h-11 min-w-[44px] select-none rounded-lg px-2 text-lg font-bold text-white transition-all${shake ? ' animate-shake' : ''}`}
            style={{ background: bg }}
            aria-label={unit}
        >
            {unit}
        </button>
    );
}

function ProgressBar({ current, total }) {
    const pct = total > 0 ? (current / total) * 100 : 0;
    return (
        <div className="h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
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
