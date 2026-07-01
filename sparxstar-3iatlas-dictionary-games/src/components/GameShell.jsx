import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import * as GameSetHookModule from '../hooks/useGameSet.js';
import * as useGameSessionModule from '../hooks/useGameSession.js';
import * as useProgressSyncModule from '../hooks/useProgressSync.js';
import SessionComplete from './SessionComplete.jsx';
import DomainFlash from './games/DomainFlash.jsx';
import MeaningMatch from './games/MeaningMatch.jsx';
import ArrangeWord from './games/ArrangeWord.jsx';
import LetterReveal from './games/LetterReveal.jsx';
import CompleteSentence from './games/CompleteSentence.jsx';
import ListenWrite from './games/ListenWrite.jsx';

const useGameSet = GameSetHookModule.useGameSet ?? GameSetHookModule.default;
if (!useGameSet) {
    throw new Error('useGameSet hook is not exported from useGameSet.js');
const useGameSet = GameSetHookModule.useGameSet ?? GameSetHookModule.default;
if (!useGameSet) {
    throw new Error('useGameSet hook is not exported from useGameSet.js');
}
const useGameSession = useGameSessionModule.useGameSession ?? useGameSessionModule.default;
if (!useGameSession) {
    throw new Error('useGameSession hook is not exported from useGameSession.js');
}
if (!useGameSession) {
    throw new Error('useGameSession hook is not exported from useGameSession.js');
}

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
 * GameShell — top-level game orchestrator.
 *
 * Handles session setup, game-set loading, game routing, and
 * post-session summary. Integrates with useGameSession and useProgressSync.
 *
 * Props:
 *   restUrl        {string}   Base REST URL
 *   language       {string}   'en' | 'fr'
 *   sourceLanguage {string|null}  Currently selected language slug
 *   languages      {Array}    Available languages from /languages
 *   onSourceLanguage {Function}  (slug) => void — change source language
 *   onBrowse         {Function}  () => void — switch to Browse tab
 */
export default function GameShell({
    restUrl,
    language,
    sourceLanguage,
    languages,
    onSourceLanguage,
    onBrowse,
}) {
    /* ── Setup state ── */
    const [selectedDomain, setSelectedDomain] = useState('');
    const [selectedGame, setSelectedGame] = useState(GAME_TYPES[0].id);
    const [wordCount, setWordCount] = useState(20);
    const [domains, setDomains] = useState([]);
    const [domainsLoading, setDomainsLoading] = useState(false);
    const [setupError, setSetupError] = useState(null);

    /* ── Session phase: 'setup' | 'loading' | 'playing' | 'complete' ── */
    const [phase, setPhase] = useState('setup');

    /* ── Active game words (sliced + filtered for the chosen game) ── */
    const [gameWords, setGameWords] = useState([]);

    /* ── Hooks ── */
    const {
        words: fetchedWords,
        loading: gameSetLoading,
        error: gameSetError,
    } = useGameSet({
        restUrl,
        langSource: sourceLanguage,
        domain: selectedDomain,
        limit: wordCount,
        includeAudio: selectedGame === 'listen_write',
    });

    const { session, learnedCount, initSession, recordResult, completeSession, clearSession } =
        useGameSession();

    const useProgressSync = useProgressSyncModule.useProgressSync || useProgressSyncModule.default;
    const { addEvent, syncNow } = useProgressSync({ restUrl });

    /*
     * Promise chain for result writes.  Game components call onResult() synchronously
     * (no await), so consecutive calls — including the final onResult + onComplete pair
     * in DomainFlash — must be serialized here to prevent handleComplete from running
     * before the last recordResult write has finished.
     */
    const pendingResultRef = useRef(Promise.resolve());

    /* ── Fetch domains when source language changes ── */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        if (!sourceLanguage) {
            setDomains([]);
            setDomainsLoading(false);
            setSetupError(null);
            return;
        }
        setDomainsLoading(true);
        fetch(`${restUrl}/domains?lang_source=${encodeURIComponent(sourceLanguage)}`, {
            signal: controller.signal,
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                if (!cancelled && json?.success && Array.isArray(json.data?.domains)) {
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
    }, [sourceLanguage, restUrl]);

    /* ── Resume an in-progress session when the Play tab is opened ── */
    useEffect(() => {
        if (session && session.completedAt === null && phase === 'setup') {
            /* Session is in progress — offer to resume. */
            /* For simplicity, we auto-resume: rebuild gameWords from session. */
            const remainingWords = session.words.slice(session.currentIndex);
            if (remainingWords.length > 0) {
                setGameWords(remainingWords);
                setSelectedGame(session.gameType);
                setSelectedDomain(session.domain ?? '');
                onSourceLanguage(session.langSource ?? '');
                setPhase('playing');
            }
        }
    }, [session, phase, onSourceLanguage]); // resume once session loads asynchronously; phase guard prevents re-entry

    /* ── When game-set loads (after Start is tapped), kick off the session ── */
    useEffect(() => {
        const load = async () => {
            try {
                if (phase !== 'loading') return;
                if (gameSetLoading) return;
                if (gameSetError) {
        const load = async () => {
            try {
                if (phase !== 'loading') return;
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

                const sliced = fetchedWords.slice(0, wordCount);
                setSetupError(null);

                try {
                    await initSession({
                        gameType: selectedGame,
                        langSource: sourceLanguage ?? '',
                        domain: selectedDomain,
                        words: sliced,
                    });
                } catch (error) {
                    setSetupError(error?.message ?? 'Unable to start the game session.');
                    setPhase('setup');
                    return;
                }

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
            } catch (error) {
                setSetupError(error?.message ?? 'An unexpected error occurred');
                setPhase('setup');
            }
        };

        load();
    }, [
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

    /* ── Handle a single word result from any game component ── */
    const handleWordResult = useCallback(
        (uuid, outcome, attempts, xp) => {
            /*
             * Chain onto pendingResultRef so that back-to-back synchronous calls
             * (e.g. the final onResult + onComplete pair in DomainFlash) are serialized.
             * handleComplete awaits this chain before calling completeSession().
             */
            pendingResultRef.current = pendingResultRef.current.then(async () => {
                const updatedSession = await recordResult(uuid, outcome, attempts, xp);

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

                        await addEvent({ type: 'aiwa_game_new_word_practiced', word_uuid: uuid });
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
                        if (recent.length === 3 && recent.every((r) => r.outcome === 'correct')) {
                            await addEvent({ type: 'aiwa_game_streak_3' });
                        }
                    }
                }
            });
        },
        [recordResult, addEvent, selectedGame]
    );

    /* ── Handle game session complete ── */
    const handleComplete = useCallback(async () => {
        /* Await any in-flight result write before marking the session complete. */
        await pendingResultRef.current;
        await completeSession();
        await addEvent({ type: 'aiwa_game_session_complete', domain: selectedDomain });
        await syncNow();
        setPhase('complete');
    }, [completeSession, addEvent, syncNow, selectedDomain]);

    /* ── Start button ── */
    const handleStart = () => {
        if (!sourceLanguage) return;
        setSetupError(null);
        setPhase('loading');
    };

    /* ── Practice missed words ── */
    const handlePracticeMissed = useCallback(async () => {
        if (!session) return;
        const missed = session.results
            .filter((r) => r.outcome === 'learning')
            .map((r) => session.words.find((w) => w.uuid === r.wordUuid))
            .filter(Boolean);

        if (missed.length === 0) return;

        setSetupError(null);

        try {
            await initSession({
                gameType: selectedGame,
                langSource: sourceLanguage ?? '',
                domain: selectedDomain,
                words: missed,
            });
        } catch (error) {
            setSetupError(error?.message ?? 'Unable to restart the game session.');
            setPhase('setup');
            return;
        }

        setGameWords(missed);
        setPhase('playing');
    }, [session, initSession, selectedGame, sourceLanguage, selectedDomain]);

    /* ── Play again ── */
    const handlePlayAgain = useCallback(async () => {
        await clearSession();
        setGameWords([]);
        setPhase('loading');
    }, [clearSession]);

    /* ── Render ── */

    if (phase === 'loading') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <Loader2 className="animate-spin" style={{ color: '#E91E8C' }} size={40} />
                <p className="text-gray-400 text-sm">Loading game set&hellip;</p>
                {gameSetError && <p className="text-red-500 text-sm">{gameSetError}</p>}
            </div>
        );
    }

    if (phase === 'playing') {
        return (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
                {renderGame(selectedGame, gameWords, language, handleWordResult, handleComplete)}
            </div>
        );
    }

    if (phase === 'complete') {
        return (
            <div className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-gray-900">
                <SessionComplete
                    session={session}
                    learnedCount={learnedCount}
                    onPracticeMissed={handlePracticeMissed}
                    onBrowse={onBrowse}
                    onPlayAgain={handlePlayAgain}
                />
            </div>
        );
    }

    /* ── Setup screen ── */
    return (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-5 bg-white dark:bg-gray-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 shrink-0">Play</h2>

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
    );
}

/** Route to the correct game component based on game type. */
function renderGame(gameType, words, language, onResult, onComplete) {
    const props = { words, language, onResult, onComplete };

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
