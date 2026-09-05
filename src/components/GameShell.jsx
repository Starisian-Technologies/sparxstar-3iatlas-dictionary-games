import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { useGameSet } from '../hooks/useGameSet.js';
import { useGameSession } from '../hooks/useGameSession.js';
import { useProgressSync } from '../hooks/useProgressSync.js';
import { MODE, needsReview } from '../pedagogy.js';
import GameNav from './GameNav.jsx';
import LeaveGameDialog from './LeaveGameDialog.jsx';
import {
    ADJUST,
    ADJUST_MESSAGE,
    GAME_SKILL,
    LEVEL,
    LEVEL_PROFILE,
    applyAdjustment,
    decideAdjustment,
    emptyPerformance,
    progressKey,
    recordOutcome,
    selectForLevel,
} from '../difficulty.js';
import SessionComplete from './SessionComplete.jsx';
import DomainFlash from './games/DomainFlash.jsx';
import MeaningMatch from './games/MeaningMatch.jsx';
import ArrangeWord from './games/ArrangeWord.jsx';
import LetterReveal from './games/LetterReveal.jsx';
import CompleteSentence from './games/CompleteSentence.jsx';
import ListenWrite from './games/ListenWrite.jsx';

/** Word count options available in session setup. */
const WORD_COUNTS = [10, 20, 30];

/** Available game types with display labels. */
const GAME_TYPES = [
    {
        id: 'listen_write',
        label: 'Listen & Write',
        description: 'Hear the word — write it',
        emoji: '🎧',
        requiresAudio: true,
    },
    {
        id: 'arrange_word',
        label: 'Arrange the Word',
        description: 'Tap scrambled letters into order',
        emoji: '🔤',
        requiresAudio: false,
    },
    {
        id: 'meaning_match',
        label: 'Meaning Match',
        description: 'Match the written word to its meaning',
        emoji: '🎯',
        requiresAudio: false,
    },
    {
        id: 'complete_sentence',
        label: 'Complete the Sentence',
        description: 'Fill in the missing word in a real sentence',
        emoji: '📝',
        requiresAudio: false,
    },
    {
        id: 'letter_reveal',
        label: 'Letter Reveal',
        description: 'Tap letters to uncover the hidden word',
        emoji: '🔍',
        requiresAudio: false,
    },
    {
        id: 'domain_flash',
        label: 'Domain Flash',
        description: 'Flashcards through a semantic domain',
        emoji: '⚡',
        requiresAudio: false,
    },
];

/** Where per-language, per-skill difficulty offsets live for a guest. */
const OFFSETS_KEY = 'aiwa-dict-difficulty-offsets';

const getLocalStorageItem = (key) => {
    try {
        return {
            available: true,
            value: window.localStorage.getItem(key),
        };
    } catch {
        return {
            available: false,
            value: null,
        };
    }
};

const setLocalStorageItem = (key, value) => {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

/**
 * Read stored difficulty offsets, tolerating anything unexpected.
 *
 * A corrupt or hand-edited value must not stop the games loading, and a
 * non-numeric offset must not reach `applyAdjustment` — so every entry is
 * validated rather than trusted, and anything odd is simply dropped.
 */
function readStoredOffsets() {
    const { value } = getLocalStorageItem(OFFSETS_KEY);
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(
            Object.entries(parsed).filter(
                ([key, offset]) => typeof key === 'string' && Number.isFinite(offset)
            )
        );
    } catch {
        return {};
    }
}

/**
 * GameShell — top-level game orchestrator.
 *
 * Handles session setup, game-set loading, game routing, and
 * post-session summary. Integrates with useGameSession and useProgressSync.
 *
 * Props:
 *   bffPath        {string}   Base path of the games BFF (`/api/dictionary`).
 *     SAME-ORIGIN, and the only dictionary address this component knows. The
 *     Dictionary API is private: the browser never addresses it, the BFF holds
 *     the credential. Replaces the former `restUrl`, which was the dictionary's
 *     own origin.
 *   language       {string}   'en' | 'fr'
 *   sourceLanguage {string|null}  Currently selected ISO 639-3 language code
 *   languages      {Array}    Available languages from the BFF
 *   onSourceLanguage {Function}  (slug) => void — change source language
 *   onBrowse         {Function}  () => void — switch to Browse tab
 *   engineUrl        {string}   [optional] RLC node-engine base URL, for
 *     progress sync (GAME-SERVICE-INTAKE-SPEC-v1.0). Omit to stay local-only.
 *   getSuiteToken     {Function} [optional] () => (string|null|Promise<string|null>).
 *     Bearer token for the engine's batch endpoint. Omit to stay local-only.
 */
export default function GameShell({
    bffPath,
    language,
    sourceLanguage,
    languages,
    onSourceLanguage,
    onBrowse,
    engineUrl,
    getSuiteToken,
}) {
    /* ── Setup state ── */
    /*
     * The domain selection is TAGGED WITH THE LANGUAGE IT WAS MADE FOR, and
     * the effective filter is derived from that tag rather than stored.
     *
     * Storing the bare code and clearing it in an effect is not enough, and the
     * reason is ordering: `useGameSet` is called above the effect that would do
     * the clearing, so its own effect runs FIRST on the render where the
     * language changed. For that one commit the hook sees the new language
     * beside the old language's domain code, and issues a request for a filter
     * that does not exist in the corpus it is now asking about — the player
     * gets an empty pack, and the corrected request follows behind it.
     *
     * Deriving it closes the window instead of narrowing it: a selection made
     * for `mnk` is simply not a selection once the language is `wol`, on the
     * very first render, with no effect involved.
     */
    const [domainChoice, setDomainChoice] = useState({ language: null, code: '' });
    const selectedDomain = domainChoice.language === sourceLanguage ? domainChoice.code : '';
    const setSelectedDomain = useCallback(
        (code) => setDomainChoice({ language: sourceLanguage, code }),
        [sourceLanguage]
    );
    const [selectedGame, setSelectedGame] = useState(GAME_TYPES[0].id);
    /*
     * The player's chosen level, and whether the system may fine-tune within it.
     *
     * Manual choice plus automatic fine-tuning, in that order of authority: the
     * player picks the level and can change or freeze it at any time, and
     * adaptation only reorders and reselects questions INSIDE that choice. It
     * never moves anybody between levels.
     *
     * Practice is the default — the middle of the three, and the one that does
     * not assume anything about a player nobody has met yet.
     */
    const [playerLevel, setPlayerLevel] = useState(LEVEL.PRACTICE);
    const [adaptive, setAdaptive] = useState(true);
    /* What the last adjustment was, so the player can be told plainly. */
    const [adjustNotice, setAdjustNotice] = useState(null);

    /*
     * Difficulty offsets, keyed `${languageCode}:${skill}`.
     *
     * Separate by BOTH, deliberately: a learner may read meanings readily and
     * still be working out spelling, and Mandinka progress says nothing about
     * Wolof. One general ability score would let strength in one skill raise
     * the difficulty of another.
     *
     * Guest progress stays on the device, in localStorage. Nothing is sent
     * anywhere and no RLC change is needed for any of it.
     *
     * The previous version of this comment claimed localStorage and there was
     * none — every learned offset was discarded on remount. A comment that
     * promises a behaviour the code does not have is worse than the missing
     * behaviour, because the next reader stops looking.
     *
     * Only the OFFSETS persist. The rolling performance window stays
     * session-scoped on purpose: it is meant to reflect how the last few
     * minutes went, and a window restored from last week would adapt on
     * evidence the player has outgrown.
     */
    const [offsets, setOffsets] = useState(() => readStoredOffsets());
    const performanceRef = useRef({});
    const [wordCount, setWordCount] = useState(20);
    const [domains, setDomains] = useState([]);
    const [domainsLoading, setDomainsLoading] = useState(false);
    const [setupError, setSetupError] = useState(null);

    /* ── Session phase: 'setup' | 'loading' | 'playing' | 'complete' ── */
    const [phase, setPhase] = useState('setup');
    /*
     * Set when leaving would discard unfinished work, so the player is asked
     * rather than losing a half-finished round to a mis-tap. Null means no
     * question is pending.
     */
    const [confirmLeave, setConfirmLeave] = useState(null);

    /* ── Active game words (sliced + filtered for the chosen game) ── */
    const [gameWords, setGameWords] = useState([]);

    /* ── Hooks ── */
    const {
        words: fetchedWords,
        loading: gameSetLoading,
        error: gameSetError,
    } = useGameSet({
        bffPath,
        language: sourceLanguage,
        domain: selectedDomain,
        /*
         * A SURPLUS, not `wordCount`.
         *
         * `selectForLevel` was being handed exactly as many candidates as the
         * round needed, so it returned all of them whatever the level or the
         * adaptation offset — the level selector changed nothing about which
         * words were played. Selection needs more candidates than it keeps.
         *
         * Three times the round, capped at the hook's own 50 ceiling. The
         * Dictionary charges budget per returned entry, so this is deliberately
         * a small multiple rather than "fetch everything".
         */
        limit: Math.min(50, wordCount * 3),
        /*
         * `listen_write` is the one game that cannot be played without audio,
         * so it asks the Dictionary for audio-verified entries only. The old
         * `includeAudio` flag asked for audio URLs to be ADDED to any entry;
         * this asks for entries that HAVE consented, verified audio, which is
         * the question the game actually has. An entry with no consented
         * recording is not a `listen_write` prompt.
         */
        audioVerifiedOnly: selectedGame === 'listen_write',
    });

    const { session, learnedCount, initSession, recordResult, completeSession, clearSession } =
        useGameSession();

    const { addEvent, syncNow } = useProgressSync({ engineUrl, getSuiteToken });

    /*
     * Promise chain for result writes.  Game components call onResult() synchronously
     * (no await), so consecutive calls — including the final onResult + onComplete pair
     * in DomainFlash — must be serialized here to prevent handleComplete from running
     * before the last recordResult write has finished.
     */
    const pendingResultRef = useRef(Promise.resolve());
    /*
     * Set when the player deliberately LEAVES a round.
     *
     * The resume effect below auto-re-enters any session that is not marked
     * complete, which is right after a reload and catastrophic after an exit:
     * a result write still in flight when the player leaves lands after
     * `clearSession()` and re-persists the very session that was deleted, and
     * the resume effect then drags them straight back into the game they just
     * left. A flag, not a state, because it must be readable synchronously
     * before any await.
     */
    const suppressResumeRef = useRef(false);
    /*
     * Bumped on every deliberate transition. The loading effect captures it
     * and re-checks after each await, so an initialisation the player has
     * already walked away from cannot install its deck or force `playing`.
     */
    const runTokenRef = useRef(0);

    /* ── Fetch domains when source language changes ── */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        /*
         * CLEARED FIRST, not on success.
         *
         * Domain codes are per-language, so leaving the previous language's
         * list on screen while the new one loads — or forever, if the request
         * fails — offers the player domains that do not exist in the language
         * they selected. The SELECTION is handled by deriving it (see
         * `domainChoice` above) rather than clearing it here, because an effect
         * runs too late to keep a stale code out of the first request.
         */
        setDomains([]);

        if (!sourceLanguage) {
            setDomainsLoading(false);
            setSetupError(null);
            return;
        }
        setDomainsLoading(true);
        /*
         * Same-origin, through the BFF. No credential and no page token: the
         * Dictionary API is private and the browser does not address it.
         *
         * KNOWN GAP: the Dictionary Node publishes no `/domains` route (the
         * WordPress original had one; the Node port did not carry it over), so
         * the BFF answers an empty list. The selector already treats "no
         * domains" as "All domains", so the filter degrades quietly rather
         * than blocking play — which is why this stays a soft failure and not
         * an error banner.
         */
        fetch(`${bffPath}/domains?language=${encodeURIComponent(sourceLanguage)}`, {
            credentials: 'omit',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                if (!cancelled && Array.isArray(json?.data?.domains)) {
                    setDomains(json.data.domains);
                }
            })
            .catch((error) => {
                if (error?.name === 'AbortError') {
                    return;
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setDomainsLoading(false);
                }
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [sourceLanguage, bffPath]);

    /* ── Resume an in-progress session when the Play tab is opened ── */
    useEffect(() => {
        /* A deliberate exit is not a crash: do not resume what was left. */
        if (suppressResumeRef.current) return;
        if (session && session.completedAt === null && phase === 'setup') {
            /* Session is in progress — offer to resume. */
            /* For simplicity, we auto-resume: rebuild gameWords from session. */
            const remainingWords = session.words.slice(session.currentIndex);
            if (remainingWords.length > 0) {
                setGameWords(remainingWords);
                setSelectedGame(session.gameType);
                /*
                 * Restore the level the round BEGAN under, so a resume plays by
                 * the rules the player chose rather than the default. A session
                 * persisted before levels existed has no `level`, so it keeps
                 * whatever is currently selected.
                 */
                if (session.level && LEVEL_PROFILE[session.level]) {
                    setPlayerLevel(session.level);
                }
                /*
                 * Restored as a PAIR, tagged with the session's own language.
                 * `onSourceLanguage` is the parent's state, so it lands on a
                 * later render; tagging the resumed domain with whatever
                 * language happens to be selected right now would make the
                 * resumed filter evaporate the moment the resumed language
                 * arrives.
                 */
                setDomainChoice({
                    language: session.langSource ?? '',
                    code: session.domain ?? '',
                });
                onSourceLanguage(session.langSource ?? '');
                setPhase('playing');
            }
        }
    }, [session, phase, onSourceLanguage]); // resume once session loads asynchronously; phase guard prevents re-entry

    /* ── When game-set loads (after Start is tapped), kick off the session ── */
    useEffect(() => {
        const load = async () => {
            if (phase !== 'loading') return;
            /* Captured once; re-checked after every await so a load the player
             * has abandoned cannot resurrect the game around them. */
            const token = runTokenRef.current;
            if (gameSetLoading) return;
            if (gameSetError) {
                setSetupError(gameSetError);
                setPhase('setup');
                return;
            }
            if (fetchedWords.length === 0) {
                setSetupError('No words are available for this game yet.');
                setPhase('setup');
                return;
            }

            /*
             * Choose FOR THE LEVEL rather than taking the first N.
             *
             * `selectForLevel` orders by the Dictionary's own `difficulty`
             * band first and only then by the other factors, and applies this
             * skill's adaptation offset. It only orders and selects: the
             * playability rules still run inside each game afterwards, which
             * is what makes it impossible for any offset to deal an unplayable
             * word.
             */
            const skill = GAME_SKILL[selectedGame];
            const sliced = selectForLevel(fetchedWords, {
                level: playerLevel,
                languageCode: sourceLanguage ?? '',
                gameId: selectedGame,
                offset: offsets[progressKey(sourceLanguage ?? '', skill)] ?? 0,
                count: wordCount,
            });
            setSetupError(null);

            try {
                await initSession({
                    gameType: selectedGame,
                    langSource: sourceLanguage ?? '',
                    domain: selectedDomain,
                    level: playerLevel,
                    words: sliced,
                });
            } catch (error) {
                if (runTokenRef.current !== token) return;
                setSetupError(error?.message ?? 'Unable to start the game session.');
                setPhase('setup');
                return;
            }

            /* The player left while this was initialising. Do not put them back
             * into a game they walked away from. */
            if (runTokenRef.current !== token) return;

            setGameWords(sliced);
            setPhase('playing');

            /* Fire return-visit event. */
            const today = new Date().toDateString();
            const lastVisit = getLocalStorageItem('aiwa-dict-last-play');
            if (lastVisit.available && lastVisit.value !== today) {
                const didPersistVisit = setLocalStorageItem('aiwa-dict-last-play', today);
                if (didPersistVisit) {
                    await addEvent({ type: 'aiwa_game_return_visit' });
                }
            }
        };

        load();
    }, [
        /* `playerLevel` and `offsets` belong here: they choose WHICH words the
         * round gets, so a stale pair would deal the previous level's deck.
         * The effect is gated on `phase === 'loading'`, so listing them cannot
         * refetch a round already in play. */
        playerLevel,
        offsets,
        phase,
        gameSetLoading,
        gameSetError,
        fetchedWords,
        wordCount,
        selectedGame,
        selectedDomain,
        sourceLanguage,
        initSession,
        addEvent,
    ]);

    /* Persist the offsets whenever they change. Storage may be unavailable
     * (private browsing, quota); `setLocalStorageItem` already swallows that,
     * and losing an offset is a degraded nudge, never a lost reward. */
    useEffect(() => {
        if (Object.keys(offsets).length === 0) return;
        setLocalStorageItem(OFFSETS_KEY, JSON.stringify(offsets));
    }, [offsets]);

    /* ── Handle a single word result from any game component ── */
    const handleWordResult = useCallback(
        (uuid, outcome, attempts, xp, timeMs) => {
            /*
             * Chain onto pendingResultRef so that back-to-back synchronous calls
             * (e.g. the final onResult + onComplete pair in DomainFlash) are serialized.
             * handleComplete awaits this chain before calling completeSession().
             */
            pendingResultRef.current = pendingResultRef.current
                .then(async () => {
                    const updatedSession = await recordResult(uuid, outcome, attempts, xp, timeMs);

                    /* Report every outcome (not just correct) toward the engine's
                     * game.result intake (GAME-SERVICE-INTAKE-SPEC-v1.0 OQ-3) — the
                     * dictionaryQuizManifest scores correct/incorrect/learning, so
                     * this must carry all three, with attempts and time_ms, to be a
                     * conformant GameResultEvent. This is a distinct local event type
                     * from the aiwa_game_* bonus signals below: only this one is
                     * translated to game.result by syncNow(); the bonus signals stay
                     * local-only (the engine has no scoring path for them).
                     *
                     * `run_id` and `word_uuid` together are what the engine's
                     * per-question award claim is keyed on — the run this result
                     * belongs to, and the question within it (they become the
                     * payload's `session_id` and `deal_id`). `dictionary_quiz` is
                     * question_scoped, so an event missing either is refused
                     * outright (`run_id_required` / `question_id_required`) rather
                     * than settled without idempotency. The run id comes from the
                     * session recordResult just wrote, so it is the same id for
                     * every result in this play-through. */
                    /*
                     * Fold the outcome into this language-and-skill's rolling
                     * window. A window, not lifetime XP: a player who has
                     * improved should not be held back by old answers, and a
                     * bad ten minutes should recover within the session.
                     */
                    const skillKey = progressKey(sourceLanguage ?? '', GAME_SKILL[selectedGame]);
                    performanceRef.current[skillKey] = recordOutcome(
                        performanceRef.current[skillKey] ?? emptyPerformance(),
                        { outcome, attempts, timeMs }
                    );

                    await addEvent({
                        type: 'game_result',
                        run_id: updatedSession?.runId ?? '',
                        word_uuid: uuid,
                        game: selectedGame,
                        outcome,
                        attempts,
                        time_ms: typeof timeMs === 'number' ? timeMs : 0,
                    });

                    /* Queue MyCred events. */
                    if (outcome === 'correct') {
                        /* Check if this is the first time practicing this word. */
                        const practiceKey = `aiwa-dict-practiced:${uuid}`;
                        let practiceMarker = null;
                        let canPersistPracticeMarker = true;
                        try {
                            practiceMarker = window.localStorage.getItem(practiceKey);
                        } catch {
                            canPersistPracticeMarker = false;
                        }
                        const shouldQueueFirstPracticeEvent = practiceMarker === null;

                        if (shouldQueueFirstPracticeEvent) {
                            if (canPersistPracticeMarker) {
                                setLocalStorageItem(practiceKey, '1');
                            }

                            await addEvent({
                                type: 'aiwa_game_new_word_practiced',
                                word_uuid: uuid,
                            });
                        }

                        if (selectedGame === 'listen_write') {
                            await addEvent({
                                type: 'aiwa_game_listen_write_correct',
                                word_uuid: uuid,
                                game: selectedGame,
                            });
                        } else {
                            await addEvent({
                                type: 'aiwa_game_word_correct',
                                word_uuid: uuid,
                                game: selectedGame,
                            });
                        }

                        /* Streak detection: use updatedSession.results (already includes
                         * the result just recorded) rather than the stale session state
                         * closure, which is typically one result behind at this point. */
                        if (updatedSession) {
                            const recent = updatedSession.results.slice(-3);
                            if (
                                recent.length === 3 &&
                                recent.every((r) => r.outcome === 'correct')
                            ) {
                                await addEvent({ type: 'aiwa_game_streak_3' });
                            }
                        }
                    }
                })
                .catch((error) => {
                    /* Keep the chain alive — a single failed write (quota, IDB error)
                     * must not stop the rest of the session from recording. */
                    console.error('Failed to record word result:', error);
                });
        },
        [recordResult, addEvent, selectedGame, sourceLanguage]
    );

    /* ── Handle game session complete ── */
    const handleComplete = useCallback(async () => {
        /* Await any in-flight result write before marking the session complete. */
        await pendingResultRef.current;

        /*
         * Adapt ONCE, at the end of a round — the conservative boundary this
         * change deliberately stays inside.
         *
         * Adjusting mid-round would change the difficulty of a session a player
         * is in the middle of, from a window that is still filling. At the end
         * there is a whole round of evidence, the change applies to the NEXT
         * round, and the player is told about it rather than discovering it.
         *
         * `decideAdjustment` holds below its evidence floor, so a short round
         * moves nothing, and one mistake never moves anything.
         */
        const skillKey = progressKey(sourceLanguage ?? '', GAME_SKILL[selectedGame]);
        const adjustment = decideAdjustment(performanceRef.current[skillKey], { adaptive });
        if (adjustment !== ADJUST.HOLD) {
            setOffsets((prev) => ({
                ...prev,
                [skillKey]: applyAdjustment(prev[skillKey] ?? 0, adjustment),
            }));
            setAdjustNotice(ADJUST_MESSAGE[adjustment]);
            await addEvent({
                type: 'game_difficulty_adjusted',
                game: selectedGame,
                skill: GAME_SKILL[selectedGame],
                direction: adjustment,
            });
        } else {
            setAdjustNotice(null);
        }

        await completeSession();
        await addEvent({ type: 'aiwa_game_session_complete', domain: selectedDomain });
        await syncNow();
        setPhase('complete');
    }, [
        completeSession,
        addEvent,
        syncNow,
        selectedDomain,
        selectedGame,
        sourceLanguage,
        adaptive,
    ]);

    /* ── Start button ── */
    const handleStart = () => {
        if (!sourceLanguage) return;
        /* A deliberate start clears the "do not resume" flag set by a
         * deliberate exit — the player is choosing to play again. */
        suppressResumeRef.current = false;
        runTokenRef.current += 1;
        setSetupError(null);
        setPhase('loading');
    };

    /* ── Practice missed words ── */
    const handlePracticeMissed = useCallback(async () => {
        if (!session) return;
        /*
         * Every word the player did not get first time, not just `learning`.
         *
         * This filtered `outcome === 'learning'` only, so a word answered
         * outright wrong — or skipped — never came back. Those are precisely
         * the words that need reinforcing, and they were the ones being
         * dropped. `needsReview` is the single definition of "missed", shared
         * with the games so the queue and the scoring cannot drift apart.
         */
        const missed = session.results
            .filter((r) => needsReview(r.outcome))
            .map((r) => session.words.find((w) => w.uuid === r.wordUuid))
            .filter(Boolean);

        if (missed.length === 0) return;

        setSetupError(null);

        try {
            await initSession({
                gameType: selectedGame,
                langSource: sourceLanguage ?? '',
                domain: selectedDomain,
                level: playerLevel,
                words: missed,
            });
        } catch (error) {
            setSetupError(error?.message ?? 'Unable to restart the game session.');
            setPhase('setup');
            return;
        }

        setGameWords(missed);
        setPhase('playing');
    }, [session, initSession, selectedGame, sourceLanguage, selectedDomain, playerLevel]);

    /* ── Play again ── */
    const handlePlayAgain = useCallback(async () => {
        /* Play Again can run while a final result is still being written, so
         * it takes the same ordering as the other destructive transitions. */
        suppressResumeRef.current = true;
        runTokenRef.current += 1;
        setGameWords([]);

        try {
            await pendingResultRef.current;
            await clearSession();
        } catch (error) {
            console.warn('Could not clear the session before replaying:', error);
        }

        suppressResumeRef.current = false;
        runTokenRef.current += 1;
        setPhase('loading');
    }, [clearSession]);

    /* ── Leaving a game ── */

    /*
     * `Games Home` from anywhere.
     *
     * The defect: there was no way out of a round at all, and the one control
     * that looked like an exit — "Browse dictionary" on the summary — called a
     * host callback wired to an empty function.
     *
     * Unfinished work is confirmed, finished work is not: once the round is
     * over there is nothing left to lose, so asking would be noise.
     */
    const leaveToHome = useCallback(async () => {
        setConfirmLeave(null);
        /*
         * Navigation FIRST, storage second, and never the other way round.
         *
         * An earlier version awaited `clearSession()` before changing phase.
         * `clearSession` propagates an IndexedDB deletion failure, so on a
         * device where storage is unavailable the await rejected and the phase
         * never changed — making `Games Home` a dead control exactly in the
         * conditions where a player most needs it. The exit this release exists
         * to provide cannot itself depend on the disk.
         *
         * The flags are set before the first await, so the resume effect and
         * any in-flight load both see the exit immediately.
         */
        suppressResumeRef.current = true;
        runTokenRef.current += 1;
        setGameWords([]);
        setAdjustNotice(null);
        setPhase('setup');

        /* Now tidy up, best effort. `pendingResultRef` is awaited BEFORE the
         * delete so a result still being written cannot re-persist the session
         * after it is removed. */
        try {
            await pendingResultRef.current;
            await clearSession();
        } catch (error) {
            /* The player has already left; a failed cleanup must not follow
             * them. The stale record cannot resume — `suppressResumeRef`. */
            console.warn('Could not clear the session on leaving:', error);
        }
    }, [clearSession]);

    const handleHome = useCallback(() => {
        const started = phase === 'playing' && (session?.results?.length ?? 0) > 0;
        if (started) {
            setConfirmLeave('home');
            return;
        }
        leaveToHome();
    }, [phase, session, leaveToHome]);

    /* Restart deals a fresh round of the same game rather than resuming. */
    const handleRestart = useCallback(async () => {
        setConfirmLeave(null);
        /* Same ordering as `leaveToHome`, and for the same reasons: a restart
         * that cannot delete the old record must still restart. */
        suppressResumeRef.current = true;
        runTokenRef.current += 1;
        setGameWords([]);
        setAdjustNotice(null);

        try {
            await pendingResultRef.current;
            await clearSession();
        } catch (error) {
            console.warn('Could not clear the session on restarting:', error);
        }

        /* Only now ask for a new round, so the fresh session is created after
         * the old one has gone rather than racing it. */
        suppressResumeRef.current = false;
        runTokenRef.current += 1;
        setPhase('loading');
    }, [clearSession]);

    /*
     * `Choose another game` — home, but the intent is explicit. It is the same
     * transition as `Games Home` because the setup screen IS the game chooser;
     * naming it separately on the summary is what the brief asks for and costs
     * nothing to honour.
     */
    const handleChooseAnother = handleHome;

    /*
     * One nav, rendered by every branch below.
     *
     * Built here rather than inside each branch on purpose: a branch that
     * forgets it is the trap this fixes, and a shared constant cannot be
     * forgotten by one of them.
     */
    const gameLabel = GAME_TYPES.find((g) => g.id === selectedGame)?.label ?? null;
    const nav = (
        <GameNav
            gameName={phase === 'setup' ? null : gameLabel}
            questionAt={phase === 'playing' ? (session?.currentIndex ?? 0) + 1 : null}
            questionOf={phase === 'playing' ? gameWords.length : null}
            points={session?.xpEarned ?? 0}
            onHome={handleHome}
            onRestart={phase === 'playing' || phase === 'complete' ? handleRestart : null}
        />
    );

    /* Asked only when there is unfinished work; see `handleHome`. */
    const leaveDialog = confirmLeave && (
        <LeaveGameDialog onKeepPlaying={() => setConfirmLeave(null)} onLeave={leaveToHome} />
    );

    /* ── Render ── */

    if (phase === 'loading') {
        return (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
                {nav}
                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin" style={{ color: '#E91E8C' }} size={40} />
                    <p className="text-gray-400 text-sm">Loading game set&hellip;</p>
                    {gameSetError && <p className="text-red-500 text-sm">{gameSetError}</p>}
                </div>
                {leaveDialog}
            </div>
        );
    }

    if (phase === 'playing') {
        return (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
                {nav}
                {/*
                 * Transparency strip. The current level is always visible and
                 * the player can change it or freeze adaptation at any time.
                 * Nobody is silently locked into a tier.
                 *
                 * A level change takes effect at the NEXT question, and the
                 * control says so rather than leaving the player to infer it.
                 * Two reasons, both found in review: the words for a round are
                 * chosen when the round loads, so changing level mid-round
                 * cannot re-deal a deck already in play; and changing the
                 * assistance mid-WORD reset the tiles, attempt counter and
                 * clock of the question in front of the player — discarding
                 * their work, and letting retries be refreshed by toggling the
                 * control.
                 *
                 * So: assistance from the next question, deck from the next
                 * round. Play again is one tap from the summary.
                 */}
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 text-xs dark:border-gray-800">
                    <span className="text-gray-400">Level</span>
                    {Object.entries(LEVEL_PROFILE).map(([id, p]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setPlayerLevel(id)}
                            aria-pressed={playerLevel === id}
                            className="min-h-[32px] rounded-lg border px-2 font-medium"
                            style={
                                playerLevel === id
                                    ? {
                                          background: '#7B3FA0',
                                          borderColor: 'transparent',
                                          color: 'white',
                                      }
                                    : { borderColor: '#e5e7eb', color: '#6b7280' }
                            }
                        >
                            {p.label}
                        </button>
                    ))}
                    <span className="w-full text-[11px] text-gray-400">
                        Applies from the next question
                    </span>
                    <button
                        type="button"
                        onClick={() => setAdaptive((a) => !a)}
                        aria-pressed={adaptive}
                        className="ml-auto min-h-[32px] rounded-lg border border-gray-200 px-2 font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
                    >
                        Adaptive: {adaptive ? 'on' : 'off'}
                    </button>
                </div>

                {adjustNotice && (
                    <p className="shrink-0 px-3 py-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
                        {adjustNotice}
                    </p>
                )}

                {renderGame({
                    gameType: selectedGame,
                    words: gameWords,
                    language,
                    languageCode: sourceLanguage ?? '',
                    /* The learn-loop takes a MODE (how much help, how soon);
                     * the player chooses a LEVEL. Learn and Practice both want
                     * help early, so both map to the loop's practice mode;
                     * Challenge holds it back. The level itself drives which
                     * words are dealt, above. */
                    mode: playerLevel === LEVEL.CHALLENGE ? MODE.CHALLENGE : MODE.PRACTICE,
                    onResult: handleWordResult,
                    onComplete: handleComplete,
                    onEvent: addEvent,
                })}
                {leaveDialog}
            </div>
        );
    }

    if (phase === 'complete') {
        return (
            <div className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-gray-900">
                {nav}
                <SessionComplete
                    session={session}
                    learnedCount={learnedCount}
                    onPracticeMissed={handlePracticeMissed}
                    onPlayAgain={handlePlayAgain}
                    onChooseAnother={handleChooseAnother}
                    onHome={handleHome}
                    adjustNotice={adjustNotice}
                    /* Forwarded, not defaulted: a host that implements a
                     * Browse tab gets the control, and a host that does not
                     * gets no dead button. */
                    onBrowse={onBrowse}
                />
                {leaveDialog}
            </div>
        );
    }

    /* ── Setup screen ── */
    return (
        <div className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-gray-900">
            {nav}
            <div className="flex flex-1 flex-col gap-5 p-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 shrink-0">
                    Play
                </h2>

                {setupError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                        {setupError}
                    </div>
                )}

                {/* Language check */}
                {!sourceLanguage && (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                            Choose a source language to start playing
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {languages.map((lang) => (
                                <button
                                    key={lang.slug}
                                    type="button"
                                    onClick={() => onSourceLanguage(lang.slug)}
                                    className="px-4 py-2 rounded-full text-sm font-medium text-white transition-colors"
                                    style={{ background: '#E91E8C' }}
                                >
                                    {lang.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {sourceLanguage && (
                    <>
                        {/* Domain selector */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                                Domain (optional)
                            </h3>
                            {domainsLoading ? (
                                <p className="text-sm text-gray-400">Loading domains&hellip;</p>
                            ) : (
                                <div className="relative">
                                    <select
                                        value={selectedDomain}
                                        onChange={(e) => setSelectedDomain(e.target.value)}
                                        className="w-full appearance-none px-4 py-3 pr-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none"
                                    >
                                        <option value="">All domains</option>
                                        {domains.map((d) => (
                                            <option key={d.slug} value={d.slug}>
                                                {d.name}
                                                {d.count > 0 ? ` (${d.count})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown
                                        size={16}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                                        aria-hidden="true"
                                    />
                                </div>
                            )}
                        </section>

                        {/* Game type */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                                Game
                            </h3>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {GAME_TYPES.map((g) => (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => setSelectedGame(g.id)}
                                        className="p-3 rounded-xl text-left border-2 transition-all"
                                        style={
                                            selectedGame === g.id
                                                ? {
                                                      background:
                                                          'linear-gradient(135deg,#E91E8C,#7B3FA0)',
                                                      borderColor: 'transparent',
                                                      color: 'white',
                                                  }
                                                : {
                                                      borderColor: '#f3f4f6',
                                                      background: 'white',
                                                  }
                                        }
                                    >
                                        <span className="block text-xl mb-1" aria-hidden="true">
                                            {g.emoji}
                                        </span>
                                        <span
                                            className="block text-xs font-bold"
                                            style={{
                                                color: selectedGame === g.id ? 'white' : '#1f2937',
                                            }}
                                        >
                                            {g.label}
                                        </span>
                                        <span
                                            className="block text-xs mt-0.5 leading-snug"
                                            style={{
                                                color:
                                                    selectedGame === g.id
                                                        ? 'rgba(255,255,255,0.8)'
                                                        : '#9ca3af',
                                            }}
                                        >
                                            {g.description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Level. Three, chosen by the player and changeable at any
                         *  time — including mid-round from the strip below the game.
                         *  What no level changes is that Skip, reveal and navigation
                         *  stay available: a harder level is not a trap. */}
                        <section>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                Level
                            </h3>
                            <div className="flex gap-2">
                                {Object.entries(LEVEL_PROFILE)
                                    .map(([id, p]) => ({
                                        id,
                                        label: p.label,
                                        hint: p.blurb,
                                    }))
                                    .map((m) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => setPlayerLevel(m.id)}
                                            aria-pressed={playerLevel === m.id}
                                            className="flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
                                            style={
                                                playerLevel === m.id
                                                    ? {
                                                          background: '#7B3FA0',
                                                          borderColor: 'transparent',
                                                          color: 'white',
                                                      }
                                                    : { borderColor: '#f3f4f6', color: '#374151' }
                                            }
                                        >
                                            <span className="block text-sm font-semibold">
                                                {m.label}
                                            </span>
                                            <span className="block text-xs opacity-80">
                                                {m.hint}
                                            </span>
                                        </button>
                                    ))}
                            </div>
                        </section>

                        {/* Word count */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                                Words per session
                            </h3>
                            <div className="flex gap-2">
                                {WORD_COUNTS.map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setWordCount(n)}
                                        className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors border-2"
                                        style={
                                            wordCount === n
                                                ? {
                                                      background: '#E91E8C',
                                                      borderColor: 'transparent',
                                                      color: 'white',
                                                  }
                                                : { borderColor: '#f3f4f6', color: '#374151' }
                                        }
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Start button */}
                        <button
                            type="button"
                            onClick={handleStart}
                            className="w-full py-4 rounded-xl font-bold text-base text-white transition-colors mt-auto"
                            style={{ background: 'linear-gradient(135deg,#E91E8C,#7B3FA0)' }}
                        >
                            Start
                        </button>
                    </>
                )}
            </div>
            {leaveDialog}
        </div>
    );
}

/**
 * Route to the correct game component based on game type.
 *
 * `languageCode` is the language being LEARNED and is distinct from `language`,
 * which is the interface language. The games need the first to segment a
 * headword into orthographic units; passing the second would segment Mandinka
 * with an English profile, which is the class of bug `src/orthography.js`
 * exists to remove.
 *
 * `mode` and `onEvent` are threaded through the same way so every game gets the
 * same learn-loop and the same telemetry, rather than six variations.
 */
function renderGame({
    gameType,
    words,
    language,
    languageCode,
    mode,
    onResult,
    onComplete,
    onEvent,
}) {
    const props = { words, language, languageCode, mode, onResult, onComplete, onEvent };

    switch (gameType) {
        case 'listen_write':
            return <ListenWrite {...props} />;
        case 'arrange_word':
            return <ArrangeWord {...props} />;
        case 'meaning_match':
            return <MeaningMatch {...props} />;
        case 'complete_sentence':
            return <CompleteSentence {...props} />;
        case 'letter_reveal':
            return <LetterReveal {...props} />;
        case 'domain_flash':
            return <DomainFlash {...props} />;
        default:
            return <DomainFlash {...props} />;
    }
}
