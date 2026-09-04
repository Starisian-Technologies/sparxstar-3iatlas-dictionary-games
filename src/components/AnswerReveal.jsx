import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, ArrowRight, Check, X, SkipForward } from 'lucide-react';
import { OUTCOME, xpFor } from '../pedagogy.js';
import { segmentHeadword } from '../orthography.js';

/**
 * The answer panel every game shows once a word resolves.
 *
 * ======================== WHY THIS EXISTS ========================
 *
 * Correct-answer feedback used to be a colour change and a timer. Six games
 * each did their own version, three auto-advanced after 1200–1500ms, and
 * `ArrangeWord` had no failure panel at all because it had no failure path. A
 * player who did not know the word learned nothing from getting it wrong — and
 * one who did learned nothing either, because the screen turned green and moved
 * on before anything could be read.
 *
 * So this panel does the teaching, and it is the same panel in all six games:
 * the word, how it is built, what it means, how it sounds, and a Continue the
 * player presses when they are ready.
 *
 * ======================== NOTHING IS INVENTED ========================
 *
 * Every field here comes from the Dictionary's game-pack projection via
 * `src/api/gamePackAdapter.js`. Where a field is absent, the row is absent.
 * Nothing is generated, guessed, or backfilled from a neighbouring field:
 *
 *   - `definition` comes back an EMPTY STRING for licensed third-party content
 *     whose redistribution is not permitted. That is a rights decision made
 *     upstream; this panel honours it by showing nothing. It must never be
 *     reconstructed, and a translation is not a substitute for it.
 *   - `audio_url: null` means no consented recording exists. The replay control
 *     is not rendered. It does not mean audio failed to load.
 *   - There is NO image field in the projection today, so there is no image.
 *     The layout leaves room and will take one when the Dictionary publishes
 *     it; inventing one meanwhile is forbidden.
 *
 * Media failing at runtime degrades to the same state as media not existing,
 * and never blocks Continue. A player on a phone charged at a neighbour's house
 * must always be able to finish the round.
 *
 * MOBILE-FIRST. Every control is at least 44px tall, the layout is one column
 * at every width, and long content scrolls inside this panel rather than
 * pushing Continue off the screen — a button a player cannot reach is the same
 * bug as a button that does not exist.
 */

/** What the player is told happened, per outcome. */
const VERDICT = {
    [OUTCOME.CORRECT]: {
        label: 'Correct',
        Icon: Check,
        tone: 'text-emerald-600 dark:text-emerald-400',
    },
    [OUTCOME.LEARNING]: {
        label: 'Got there',
        Icon: Check,
        tone: 'text-sky-600 dark:text-sky-400',
    },
    [OUTCOME.INCORRECT]: {
        label: 'The answer',
        Icon: X,
        tone: 'text-amber-600 dark:text-amber-400',
    },
    [OUTCOME.SKIPPED]: {
        label: 'Skipped',
        Icon: SkipForward,
        tone: 'text-gray-500 dark:text-gray-400',
    },
};

/**
 * @param {object} props
 * @param {object} props.word            Adapted game word.
 * @param {string} props.outcome         One of OUTCOME.
 * @param {string} props.languageCode    ISO code of the language being learned.
 * @param {string} [props.language]      UI language, 'en' | 'fr'.
 * @param {Function} props.onContinue    Called when the player is ready.
 * @param {boolean} [props.isLast]       Last word of the round.
 */
export default function AnswerReveal({
    word,
    outcome,
    languageCode,
    language = 'en',
    onContinue,
    isLast = false,
}) {
    const [audioState, setAudioState] = useState('idle');
    const audioRef = useRef(null);
    const continueRef = useRef(null);

    const verdict = VERDICT[outcome] ?? VERDICT[OUTCOME.INCORRECT];
    const xp = xpFor(outcome);

    /*
     * The units the word is built from — the same segmentation the spelling
     * games use. Showing it is the point: a learner who has just failed to
     * spell `njemboo` should see that `nj` and `oo` are each one thing, because
     * that is what they got wrong.
     */
    const units = word?.headword ? segmentHeadword(word.headword, languageCode) : [];

    /*
     * Focus Continue when the panel appears, so a keyboard or screen-reader
     * player lands on the action instead of hunting for it — and so a phone
     * keyboard's Go key works immediately.
     */
    useEffect(() => {
        continueRef.current?.focus();
    }, []);

    /* Stop any playing audio when the panel goes away, so it cannot bleed into
     * the next word. */
    useEffect(
        () => () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        },
        []
    );

    const playAudio = useCallback(() => {
        if (!word?.audio_url) return;
        setAudioState('playing');
        try {
            const audio = new Audio(word.audio_url);
            audioRef.current = audio;
            audio.addEventListener('ended', () => setAudioState('idle'));
            /* A failed play is a missing-media condition, not an error worth
             * interrupting the round for: the control returns to a retryable
             * state and nothing else depends on it. */
            audio.addEventListener('error', () => setAudioState('unavailable'));
            audio.play().catch(() => setAudioState('unavailable'));
        } catch {
            setAudioState('unavailable');
        }
    }, [word]);

    if (!word) return null;

    const translation = language === 'fr' ? word.translation_fr : word.translation_en;
    const example = word.example_sentences?.[0];
    const audioLabel =
        audioState === 'playing'
            ? 'Playing…'
            : audioState === 'unavailable'
              ? 'Audio unavailable — tap to retry'
              : 'Hear it again';

    return (
        <div
            className="flex flex-col gap-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60"
            role="status"
            aria-live="polite"
        >
            <div className={`flex items-center gap-2 text-sm font-semibold ${verdict.tone}`}>
                <verdict.Icon size={20} aria-hidden="true" />
                <span>{verdict.label}</span>
                {/* Zero is shown rather than hidden. It is the honest number,
                 *  and it is the number the reward ledger will hold. */}
                <span className="ml-auto tabular-nums text-gray-500 dark:text-gray-400">
                    +{xp} XP
                </span>
            </div>

            <p
                className="break-words text-center text-4xl font-bold text-gray-900 dark:text-gray-100"
                lang={languageCode}
            >
                {word.headword}
            </p>

            {/* How the word is built. Shown only when segmentation says
             *  something — for a single-unit word it says nothing. */}
            {units.length > 1 && (
                <ul
                    className="flex flex-wrap justify-center gap-1.5"
                    aria-label="Letters and letter groups"
                >
                    {units.map((unit, i) => (
                        <li
                            key={`${unit}-${i}`}
                            className="rounded-lg bg-white px-2.5 py-1 font-mono text-lg text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                            lang={languageCode}
                        >
                            {unit}
                        </li>
                    ))}
                </ul>
            )}

            {word.audio_url && (
                <button
                    type="button"
                    onClick={playAudio}
                    disabled={audioState === 'playing'}
                    className="mx-auto flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
                >
                    <Volume2 size={18} aria-hidden="true" />
                    {audioLabel}
                </button>
            )}

            {/* Long content scrolls here rather than pushing Continue away. */}
            <dl className="max-h-48 space-y-2 overflow-y-auto text-sm">
                {translation && (
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-400">Means</dt>
                        <dd className="text-gray-800 dark:text-gray-100">{translation}</dd>
                    </div>
                )}
                {/* Empty is WITHHELD, not missing. No fallback, no reconstruction. */}
                {word.definition && (
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-400">
                            Definition
                        </dt>
                        <dd className="text-gray-800 dark:text-gray-100">{word.definition}</dd>
                    </div>
                )}
                {word.ipa && (
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-400">
                            Pronounced
                        </dt>
                        <dd className="font-mono text-gray-600 dark:text-gray-300">/{word.ipa}/</dd>
                    </div>
                )}
                {example?.sentence && (
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-400">In use</dt>
                        <dd className="text-gray-800 dark:text-gray-100">
                            <span lang={languageCode}>{example.sentence}</span>
                            {example.translation_en && (
                                <span className="mt-0.5 block text-gray-500 dark:text-gray-400">
                                    {example.translation_en}
                                </span>
                            )}
                        </dd>
                    </div>
                )}
            </dl>

            <button
                type="button"
                ref={continueRef}
                onClick={onContinue}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gray-900 text-base font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
            >
                {isLast ? 'Finish' : 'Continue'}
                <ArrowRight size={18} aria-hidden="true" />
            </button>
        </div>
    );
}
