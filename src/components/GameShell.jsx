import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { MAX_PACK_SIZE, useGameSet } from '../hooks/useGameSet.js';
import { useGameSession } from '../hooks/useGameSession.js';
import { useProgressSync } from '../hooks/useProgressSync.js';
import { MODE, needsReview } from '../pedagogy.js';
import StatsScreen from './StatsScreen.jsx';
import GameNav from './GameNav.jsx';
import {
    DEFAULT_POLICY,
    LEARNER_STATE,
    emptyLiteracy,
    learnerState,
    literacyKey,
    mixForState,
    needsImmediateSupport,
    promoteIfReady,
    recordWord,
    UNIT_BANDS,
} from '../literacy.js';
import { emptyRecent, remember } from '../recent.js';
import LeaveGameDialog from './LeaveGameDialog.jsx';
import PointsBurst from './PointsBurst.jsx';
import {
    playCorrect,
    playIncorrect,
    playStreak,
    primeSound,
    setSoundEnabled,
    soundEnabled,
} from '../sound.js';
import {
    ADJUST,
    ADJUST_MESSAGE,
    GAME_SKILL,
    LEVEL,
    LEVEL_PROFILE,
    applyAdjustment,
    decideAdjustment,
    emptyPerformance,
    planRound,
    progressKey,
    recordOutcome,
} from '../difficulty.js';
import { SHORTAGE_MESSAGE, availabilityFor, partitionForGame } from '../playability.js';
import { COLOR, GRADIENT, accentFor, accentOnWhiteFor } from '../theme.js';
import {
    CALIBRATION,
    STAGE,
    countsTowardRanking,
    emptyCalibration,
    mayAdjustLevel,
    mayLowerLevel,
    opensWithSupport,
    recordCalibrationAnswer,
    requiresUniversalWords,
    stageOf,
} from '../calibration.js';
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
/**
 * Where the literacy profile lives for a guest.
 *
 * Separate from the difficulty offsets on purpose. An offset is a small,
 * disposable nudge inside a band; a literacy band is what the learner has
 * demonstrated, and losing it would put an adult who had worked up to five-unit
 * words back on three-unit ones.
 */
const LITERACY_KEY = 'aiwa-dict-literacy';
/*
 * Recently-served entry ids, per language+skill. Ids ONLY — see `recent.js`.
 * Kept beside the literacy record because it is the same kind of thing: local
 * progress state that shapes the next round and never leaves the device.
 */
const RECENT_KEY = 'aiwa-dict-recent';

/*
 * First-session progress, per language+skill. Two integers and a flag — no
 * dictionary content, in keeping with the rule that only bounded entry ids and
 * learner outcomes are ever written to the device.
 */
const CALIBRATION_KEY = 'aiwa-dict-calibration';

function readStoredRecent() {
    return readStoredMap(RECENT_KEY);
}

function readStoredLiteracy() {
    return readStoredMap(LITERACY_KEY);
}

function readStoredCalibration() {
    return readStoredMap(CALIBRATION_KEY);
}

function readStoredMap(key) {
    const stored = getLocalStorageItem(key);
    if (!stored.available || !stored.value) return {};
    try {
        const parsed = JSON.parse(stored.value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        /* Corrupt storage is a fresh start, never a crash on open. */
        return {};
    }
}

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
    accountId,
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

    /*
     * The progress/leaderboard view.
     *
     * A SEPARATE FLAG, not a fifth value of `phase`, and the distinction is
     * load-bearing. `phase` is the round's lifecycle — `leaveToHome` drives it
     * back to `setup` and clears the session with it — so a stats value living
     * there would make opening the leaderboard part of the same state machine
     * that decides whether a round survives.
     *
     * It is also why the control is offered only from `setup` and `complete`
     * (see `nav` below). Rendering it over `playing` would unmount the game in
     * front of the player, discarding the attempt counter, the tile state and
     * the clock of the question they are part-way through — the same defect the
     * level control was fixed for, arriving by a different door.
     */
    const [showStats, setShowStats] = useState(false);

    /* ── Active game words (sliced + filtered for the chosen game) ── */
    const [gameWords, setGameWords] = useState([]);
    /*
     * A dealt round that is SHORTER than the player asked for, waiting on them.
     *
     * `{ delivered, requested }` while the notice is up, null otherwise. The
     * deck itself is held in a ref rather than in state because it must not
     * re-render anything and must survive until the player answers.
     */
    const [shortRound, setShortRound] = useState(null);
    /*
     * Set when the round was filled by reaching past the learner's usual band.
     * Distinct from `shortRound`: that one is asked BEFORE the round, this one
     * is told during it, because there is nothing to decide.
     */
    const [widenNotice, setWidenNotice] = useState(null);
    const pendingDeckRef = useRef(null);
    /*
     * The reward moment for the answer just given.
     *
     * `token` increments per answer so two identical results in a row are two
     * separate bursts rather than one that never re-fires. It carries whether
     * the answer was CORRECT and the streak length — facts about the round —
     * and deliberately no award value: see INV-016 and the note in
     * `PointsBurst.jsx`.
     */
    const [burst, setBurst] = useState({ correct: false, streak: 0, token: 0 });
    const [soundOn, setSoundOn] = useState(() => soundEnabled());
    /* Set the moment the player taps a game card. After that the selection is
     * theirs and nothing may move it — see the auto-select effect below. */
    const gameChosenByPlayerRef = useRef(false);

    /* ── Hooks ── */
    /*
     * Declared ahead of `useGameSet` because the REQUEST depends on it: a
     * calibrating learner needs a pack of universal words, not a general pack
     * that is later filtered down to however few it happens to contain.
     */
    const calibrationRef = useRef(readStoredCalibration());
    const currentStage = stageOf(
        calibrationRef.current[literacyKey(sourceLanguage ?? '', GAME_SKILL[selectedGame])] ??
            emptyCalibration()
    );

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
         * Three times the round was enough to make the LEVEL selector work and
         * not enough to make VARIETY work. After the unit-band filter and the
         * split into current/review/stretch pools, thirty candidates can leave
         * a pool holding barely more words than the round needs — and a pool
         * with no slack deals the same words however well it shuffles. That is
         * how one fixed pack survived a correct mix.
         *
         * Six times the round with a floor of forty, capped at the BFF's own
         * ceiling. The Dictionary charges budget per returned entry, so this is
         * still a bounded multiple rather than "fetch everything"; it buys the
         * pools enough members to draw from.
         */
        limit: Math.min(MAX_PACK_SIZE, Math.max(wordCount * 6, 40)),
        /*
         * `listen_write` is the one game that cannot be played without audio,
         * so it asks the Dictionary for audio-verified entries only. The old
         * `includeAudio` flag asked for audio URLs to be ADDED to any entry;
         * this asks for entries that HAVE consented, verified audio, which is
         * the question the game actually has. An entry with no consented
         * recording is not a `listen_write` prompt.
         */
        audioVerifiedOnly: selectedGame === 'listen_write',
        /*
         * Ask the Dictionary for universal words while the learner is still
         * calibrating.
         *
         * The client filters again during selection, so this is not the
         * safety boundary — it is what makes the runway FILLABLE. A general
         * pack that happens to contain two universal words cannot fill five
         * runway questions, and the correct response to that is a narrower
         * request, never a quiet substitution of unfamiliar words.
         */
        universalOnly: requiresUniversalWords(currentStage),
    });

    /*
     * A GAME-NEUTRAL PACK, for answering "can this game be played at all?"
     *
     * The pack above is narrowed for the SELECTED game — `listen_write` asks
     * for audio-verified entries, calibration asks for universal ones — which
     * makes it the wrong evidence for judging the other five. Judging
     * `complete_sentence` by an audio-only pack would disable a game that is
     * perfectly playable.
     *
     * Fetched only WHEN the primary pack is narrowed: an empty `language`
     * makes the hook a no-op, so the ordinary case still issues one request
     * and this costs nothing.
     */
    const packIsNarrowed = selectedGame === 'listen_write' || requiresUniversalWords(currentStage);
    const {
        words: neutralWords,
        loading: neutralLoading,
        error: neutralError,
    } = useGameSet({
        bffPath,
        language: packIsNarrowed ? sourceLanguage : '',
        domain: selectedDomain,
        limit: Math.min(MAX_PACK_SIZE, Math.max(wordCount * 6, 40)),
    });
    const previewPack = packIsNarrowed ? neutralWords : fetchedWords;
    const previewLoading = packIsNarrowed ? neutralLoading : gameSetLoading;
    const previewError = packIsNarrowed ? neutralError : gameSetError;

    /*
     * WHETHER A GAME CAN BE OFFERED IS KNOWABLE BEFORE IT IS OFFERED.
     *
     * "No words are available for this game yet" used to appear AFTER the
     * player chose a game, chose a length and pressed Start — the answer to a
     * question they had already committed to, with no way back but to leave
     * the round. Every input to that answer is present here, at setup, so it
     * is answered here: an unplayable game is disabled and says what it needs.
     */
    const availability = useMemo(() => {
        const out = {};
        for (const game of GAME_TYPES) {
            out[game.id] = availabilityFor(previewPack, {
                gameId: game.id,
                languageCode: sourceLanguage ?? '',
                /* The gloss the games will actually render depends on the UI
                 * language, so availability must ask the same question. */
                uiLanguage: language,
            });
        }
        return out;
    }, [previewPack, sourceLanguage, language]);

    /*
     * Nothing is disabled while the evidence is still arriving. A game greyed
     * out because a fetch has not landed is a game the player believes is
     * broken.
     */
    /*
     * A SUCCESSFUL EMPTY PACK IS AN ANSWER.
     *
     * This required `previewPack.length > 0`, so a language or domain with no
     * entries at all left `availabilityKnown` false forever: nothing was
     * disabled, Start stayed enabled, and the player discovered the empty
     * corpus only after committing to a round — the exact defect the preview
     * exists to prevent, surviving in the case where the corpus is emptiest.
     *
     * Completion is now tracked apart from contents. An error is NOT completion:
     * a failed fetch means the answer is unknown, and an unknown answer must not
     * disable a game the corpus may well be able to play.
     */
    const availabilityKnown = !previewLoading && !previewError;
    const selectedAvailability = availability[selectedGame] ?? null;
    const selectedUnplayable =
        availabilityKnown && selectedAvailability ? !selectedAvailability.playable : false;

    /*
     * NEVER OPEN ON A GAME THAT CANNOT BE PLAYED.
     *
     * The default selection is the first game in the list, chosen before
     * anything is known about the corpus. In Mandinka today that is
     * `listen_write` and no entry has consented audio, so the screen the
     * player lands on is a disabled game above a disabled Start — which reads
     * as the whole product being broken rather than as one game being
     * unavailable.
     *
     * Only ever moves off a game the PLAYER has not chosen. Once they pick one
     * themselves the choice is theirs, disabled or not: it stays selected, its
     * reason stays on screen, and nothing is silently swapped underneath them.
     */
    useEffect(() => {
        if (!availabilityKnown) return;
        if (gameChosenByPlayerRef.current) return;
        if (availability[selectedGame]?.playable) return;
        const firstPlayable = GAME_TYPES.find((g) => availability[g.id]?.playable);
        if (firstPlayable) setSelectedGame(firstPlayable.id);
    }, [availabilityKnown, availability, selectedGame]);

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
     * Literacy profiles, keyed `${language}:${skill}`. A ref because results
     * arrive inside an async chain and must accumulate synchronously; mirrored
     * into state only when a band actually changes, which is what the screen
     * needs to know about.
     */
    const literacyRef = useRef(readStoredLiteracy());
    const recentRef = useRef(readStoredRecent());
    /*
     * Words this learner has missed, across rounds.
     *
     * A ref rather than derived from the current session: review is supposed to
     * bring a difficult word BACK, which means it must outlive the round that
     * missed it. Reading it off `session.results` would also make the loading
     * effect depend on every result and re-run mid-round.
     */
    const missedRef = useRef(new Set());
    const [bandNotice, setBandNotice] = useState(null);
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

    /*
     * Commit a dealt deck and enter the game.
     *
     * Shared by the ordinary path and by the shortfall notice: a player who
     * accepts a shorter round must get exactly the same session — the same
     * recent-word memory write, the same run id, the same return-visit event —
     * and not a second, subtly different start path. Two ways to begin a game
     * is two places for a start to go wrong.
     */
    const startWithDeck = useCallback(
        async (deck, token) => {
            const litKey = literacyKey(sourceLanguage ?? '', GAME_SKILL[selectedGame]);

            /* Remember what this round served, before it is played. Bounded ids
             * only, and written per language+skill so one language's history
             * never suppresses another's words. */
            recentRef.current[litKey] = remember(
                recentRef.current[litKey] ?? emptyRecent(),
                deck.map((w) => w?.uuid).filter(Boolean)
            );
            setLocalStorageItem(RECENT_KEY, JSON.stringify(recentRef.current));
            setSetupError(null);
            setShortRound(null);
            pendingDeckRef.current = null;

            try {
                await initSession({
                    gameType: selectedGame,
                    langSource: sourceLanguage ?? '',
                    domain: selectedDomain,
                    level: playerLevel,
                    words: deck,
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

            setGameWords(deck);
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
        },
        [addEvent, initSession, playerLevel, selectedDomain, selectedGame, sourceLanguage]
    );

    /** The player accepted the shorter round the corpus can actually fill. */
    const acceptShortRound = useCallback(() => {
        const deck = pendingDeckRef.current;
        if (!deck || deck.length === 0) {
            setShortRound(null);
            return;
        }
        runTokenRef.current += 1;
        startWithDeck(deck, runTokenRef.current);
    }, [startWithDeck]);

    /*
     * A shortfall notice belongs to ONE dealt deck. Change the game, the
     * domain, the level or the length and that deck is no longer the answer to
     * the question being asked, so the notice and the deck it held both go.
     * Leaving them would let "Play 2 words" start a round for a game the
     * player has since navigated away from.
     */
    useEffect(() => {
        pendingDeckRef.current = null;
        setShortRound(null);
    }, [selectedGame, selectedDomain, playerLevel, wordCount, sourceLanguage]);

    /** The player would rather pick something else. Keep every other choice. */
    const dismissShortRound = useCallback(() => {
        pendingDeckRef.current = null;
        setShortRound(null);
    }, []);

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
            /*
             * AN EMPTY CALIBRATION PACK IS NOT AN EMPTY LANGUAGE.
             *
             * `fetchedWords` is requested with `universalOnly` while a learner
             * is on the runway, so for a language whose corpus has no universal
             * entries it comes back empty — and this guard sent the player back
             * to setup with "there are no words yet", for a language that has
             * plenty.
             *
             * The selection-level relaxations further down (`universalOnly:
             * false` on an empty or over-long slice) could not save it: they
             * re-select from an array that is already empty.
             *
             * `neutralWords` is the unfiltered pack, already being fetched
             * whenever the primary one is narrowed — the same substitution the
             * setup preview makes with `previewPack`. Wait for it before
             * declaring anything empty, and only then say so.
             */
            if (packIsNarrowed && neutralLoading) return;
            const dealPack =
                fetchedWords.length > 0 || !packIsNarrowed ? fetchedWords : neutralWords;
            if (dealPack.length === 0) {
                setSetupError(SHORTAGE_MESSAGE.empty);
                setPhase('setup');
                return;
            }

            /*
             * THE GAME'S OWN RULES, BEFORE THE DEAL.
             *
             * Each game used to filter the deck itself, after Start. So a
             * ten-word round became however many words survived that filter,
             * and a game with nothing to play rendered "No words are available
             * for this game yet" as the answer to a question the player had
             * already committed to. Both are decided here now, while there is
             * still something the player can do about it.
             */
            const { playable: playableWords, reasons } = partitionForGame(
                dealPack,
                selectedGame,
                sourceLanguage ?? '',
                language
            );
            if (playableWords.length === 0) {
                const dominant = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0];
                setSetupError(SHORTAGE_MESSAGE[dominant] ?? SHORTAGE_MESSAGE.empty);
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
            /*
             * The literacy band drives selection, not just the score.
             *
             * A learner with no stored profile starts at THREE UNITS rather
             * than at unrestricted Practice. Most players here speak Mandinka
             * fluently and may never have written it: fluency is not literacy,
             * and handing an adult a word they cannot spell as their first
             * experience is the discouragement this design exists to avoid.
             */
            const litKey = literacyKey(sourceLanguage ?? '', skill);
            const literacy = literacyRef.current[litKey] ?? emptyLiteracy();

            /*
             * FIRST-SESSION CALIBRATION.
             *
             * Selection already refused to serve above the learner's ceiling.
             * What it did not do was distinguish a learner it knows nothing
             * about from one it knows a lot about: both got the same
             * 60/25/15 mix, so 15% of a brand-new player's very first round
             * came from a band they had never been shown to handle.
             *
             * Two corrections, both keyed off evidence rather than time:
             *
             *   stage   runway and placement draw ONLY from the universal-word
             *           set, because a three-unit word can still be culturally
             *           unfamiliar or awkward to write. Length is not
             *           familiarity.
             *   mix     80/20/0 while nothing has been demonstrated, then
             *           70/20/10, then 60/25/15 — a harder band appears only
             *           after unaided success at the band below.
             */
            const litKeyForDeal = litKey;
            const calibration = calibrationRef.current[litKey] ?? emptyCalibration();
            const stage = stageOf(calibration);
            const state = learnerState(literacy);
            const selectionOptions = {
                level: playerLevel,
                languageCode: sourceLanguage ?? '',
                gameId: selectedGame,
                offset: offsets[progressKey(sourceLanguage ?? '', skill)] ?? 0,
                count: wordCount,
                band: literacy.band,
                /* Feeds the review pool — words this learner has missed before
                 * come back through supported practice rather than vanishing. */
                needsReviewFor: (w) => missedRef.current.has(w?.uuid),
                /*
                 * Every new game and every new round draws a fresh set. This is
                 * what makes repetition mean something: a word comes back
                 * because the review pool chose it or because the approved
                 * corpus is genuinely small, never because selection had no
                 * reason to move on.
                 */
                recent: recentRef.current[litKey] ?? emptyRecent(),
                /* The mix follows the EVIDENCE, not a constant. */
                policy: { ...DEFAULT_POLICY, mix: mixForState(state) },
                /*
                 * A hard filter during calibration, a preference afterwards.
                 * It sits upstream of the recent-id memory and of the
                 * backfill, so neither can relax it: a runway topped up with
                 * words the learner may never have met is not a runway.
                 */
                universalOnly: requiresUniversalWords(stage),
                preferUniversal: stage === STAGE.RANKED && state !== LEARNER_STATE.ESTABLISHED,
                /*
                 * The selector's own guarantee is the stricter one — an
                 * uncertain learner's round comes back SHORT rather than
                 * reaching past their band. That is right for a library and
                 * wrong for a player who chose ten questions and was handed
                 * two without being told.
                 *
                 * The shell is the caller that can speak to the player, so it
                 * is the caller allowed to make this trade: reach one honest
                 * step further, easiest words first, and SAY SO below. What is
                 * never acceptable is the silent two-word round.
                 */
                widen: true,
            };

            let plan = planRound(playableWords, selectionOptions);
            let sliced = plan.words;

            /*
             * WHEN THE CORPUS CANNOT SUPPLY A RUNWAY, PLAY WITHOUT ONE.
             *
             * `universalOnly` is a hard filter on purpose: a runway topped up
             * with unfamiliar words is not a runway. But taken alone that
             * turns a language with no universal-flagged entries into a
             * language nobody can play at all — the learner is locked out of
             * the whole game by a filter meant to protect their first five
             * questions.
             *
             * So the fallback is at the SESSION level, not the word level:
             * either the runway is drawn entirely from verified universal
             * words, or there is no runway for this language yet and normal
             * selection applies. What is never done is mixing unfamiliar words
             * INTO a runway and still calling it one.
             *
             * This is the coverage question showing up in the product rather
             * than in a report: `swadesh` is a concept-level flag, so a
             * language's coverage is however many universal concepts have an
             * approved entry in it. Until that is measured per language, some
             * languages will land here — and the right behaviour for them is
             * to play, not to wait.
             */
            if (sliced.length === 0 && selectionOptions.universalOnly) {
                plan = planRound(playableWords, {
                    ...selectionOptions,
                    universalOnly: false,
                    preferUniversal: true,
                });
                sliced = plan.words;
            }

            /*
             * THE DECK OUTLIVES THE STAGE IT WAS DEALT FOR.
             *
             * Selection runs ONCE, when the deck is built. Calibration ends
             * after thirteen answers, but the session length is the player's
             * choice — the setup screen offers 10, 20 and 30, and defaults to
             * 20. So a learner starting a 20-word session became RANKED at
             * answer 13 and then played questions 14 to 20 out of a deck
             * dealt under calibration rules: universal-only, no reach, chosen
             * for a stage they had already left.
             *
             * Deal the deck in two segments instead. The calibration segment
             * is exactly as long as calibration has left to run; the rest is
             * dealt by ordinary ranked selection, excluding what the first
             * segment already took so no word appears twice in one round.
             */
            const answeredSoFar = (calibrationRef.current[litKeyForDeal] ?? emptyCalibration())
                .answered;
            const calibrationLeft = Math.max(
                0,
                CALIBRATION.runwayQuestions + CALIBRATION.placementQuestions - answeredSoFar
            );

            if (selectionOptions.universalOnly && sliced.length > calibrationLeft) {
                const head = sliced.slice(0, calibrationLeft);
                const takenIds = new Set(head.map((w) => w?.uuid).filter(Boolean));
                const tail = planRound(
                    playableWords.filter((w) => !takenIds.has(w?.uuid)),
                    {
                        ...selectionOptions,
                        universalOnly: false,
                        preferUniversal: true,
                        count: wordCount - head.length,
                    }
                ).words;
                sliced = [...head, ...tail];
            }

            /*
             * AN EMPTY DECK MUST NOT BECOME A SESSION.
             *
             * The fetch guard above rejects an empty PACK. It cannot catch an
             * empty ROUND, and selection can now produce one: `universalOnly`
             * is a hard filter, so a pack with no universal word at the
             * learner's band yields nothing — correctly, because the
             * alternative is serving unfamiliar words in the round that
             * promises familiar ones.
             *
             * Without this guard the session starts anyway, and `DomainFlash`
             * and `MeaningMatch` render null with no word to show and no way
             * to reach their completion handlers. That is the player trapped in
             * a blank game — the one invariant no game may break — arrived at
             * from the opposite direction to the usual one.
             *
             * Same transition as an empty pack: back to setup with a message,
             * and NO session created, so nothing resumable is left behind.
             */
            if (sliced.length === 0) {
                setSetupError(
                    'No words are ready for your level in this game yet. Try another game or domain.'
                );
                setPhase('setup');
                return;
            }

            /*
             * A SHORTER ROUND IS THE PLAYER'S TO ACCEPT, NOT OURS TO IMPOSE.
             *
             * The corpus genuinely cannot always fill the round that was asked
             * for — `listen_write` needs consented audio, `complete_sentence`
             * needs example sentences, and a narrow domain at a low band may
             * hold a handful of words. That is a legitimate short round and it
             * is the ONLY legitimate one.
             *
             * What it must never be is a surprise. The deck is already dealt
             * here, so its real length is known before a single question is
             * shown: hold it, say how long the round actually is, and let the
             * player start it or pick something else with every other choice
             * they made still in place.
             */
            if (sliced.length < wordCount) {
                if (runTokenRef.current !== token) return;
                pendingDeckRef.current = sliced;
                setShortRound({ delivered: sliced.length, requested: wordCount });
                setPhase('setup');
                return;
            }

            /*
             * THE ROUND IS FULL LENGTH — BECAUSE IT REACHED FOR IT.
             *
             * `planRound` reports `widened` when it had to fill the round from
             * outside the learner's permitted pools. That was being discarded
             * here, and the only notice shown was for a SHORT round — so the
             * trade-off this shell deliberately makes on the player's behalf
             * (longer words rather than a two-question session) happened
             * silently whenever the widening succeeded, which is most of the
             * time. A full deck of harder words is the case the player is least
             * likely to notice and most likely to feel.
             *
             * Said once, on the round it applies to, and never as a warning:
             * nothing is wrong, and the round is the length they asked for.
             */
            if (plan.widened) {
                setWidenNotice(
                    'Some words in this round are a little longer than usual — there were not enough short ones for a full round.'
                );
            } else {
                setWidenNotice(null);
            }

            await startWithDeck(sliced, token);
        };

        load();
    }, [
        startWithDeck,
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
        /* The neutral pack is a real input now, not just a preview source:
         * the deal falls back to it when calibration narrows the primary
         * pack to nothing. See the guard above. */
        packIsNarrowed,
        neutralLoading,
        neutralWords,
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
        /*
         * `hintsUsed` is the sixth argument, and it is not decorative: it is
         * what adaptation was missing. `recordOutcome` has always accepted it
         * and nothing ever passed it, so `hintRate` read zero however much help
         * a learner took, and any decision that consulted it was made on a
         * number that could not change.
         */
        (uuid, outcome, attempts, xp, timeMs, hintsUsed = 0) => {
            /*
             * UNLOCK AUDIO HERE, SYNCHRONOUSLY, WHILE THE TAP IS STILL LIVE.
             *
             * The sounds play inside the promise chain below, after an
             * IndexedDB write. That callback has left the tap's transient user
             * activation by then, so a context created at that point is
             * suspended and the first correct answer of a session is silent.
             * This line costs nothing after the first call.
             */
            primeSound();

            /*
             * Chain onto pendingResultRef so that back-to-back synchronous calls
             * (e.g. the final onResult + onComplete pair in DomainFlash) are serialized.
             * handleComplete awaits this chain before calling completeSession().
             */
            pendingResultRef.current = pendingResultRef.current
                .then(async () => {
                    const { session: updatedSession, accepted } = await recordResult(
                        uuid,
                        outcome,
                        attempts,
                        xp,
                        timeMs
                    );

                    /*
                     * A REJECTED RESULT STOPS THE WHOLE HANDLER.
                     *
                     * The guard used to be "does the last recorded result match
                     * the uuid I just submitted?", which a double-tap on the
                     * LAST word passes — the last result does match, because the
                     * first tap wrote it. So every duplicate carried on into the
                     * code below: a second `game_result` queued for the engine,
                     * calibration and adaptation advanced again, and the reward
                     * signals fired twice for one answer.
                     *
                     * `recordResult` now says `accepted` outright. Nothing after
                     * this line runs for a result the session refused.
                     */
                    if (!accepted || !updatedSession) return;

                    /*
                     * THE REWARD, FROM THE RECORDED RESULT.
                     *
                     * Read off `updatedSession` rather than off the arguments,
                     * so what the player is congratulated for is exactly what
                     * the session stored. A duplicate result returns the
                     * session unchanged, which means a double-tap replays no
                     * burst and awards no second streak — the display cannot
                     * drift from the ledger because it is reading the ledger.
                     */
                    /*
                     * The celebration is for the ANSWER, not for a number.
                     *
                     * It used to carry `recorded.xp` into a `+N POINTS!` burst.
                     * That number comes from `xpFor(outcome)` on this device, and
                     * INV-016 forbids a client inferring earned value. Whether
                     * the answer was right, and how many right answers are in a
                     * row, are facts about the round rather than awards — so
                     * those are what the burst says.
                     */
                    const recorded = updatedSession.results.at(-1);
                    let streak = 0;
                    for (let i = updatedSession.results.length - 1; i >= 0; i -= 1) {
                        if (updatedSession.results[i].outcome !== 'correct') break;
                        streak += 1;
                    }
                    if (recorded?.outcome === 'correct') {
                        setBurst((b) => ({ correct: true, streak, token: b.token + 1 }));
                        if (streak >= 3) playStreak(streak);
                        else playCorrect();
                    } else if (recorded?.outcome === 'incorrect') {
                        setBurst((b) => ({ correct: false, streak: 0, token: b.token + 1 }));
                        playIncorrect();
                    }

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
                    const answerLitKey = literacyKey(
                        sourceLanguage ?? '',
                        GAME_SKILL[selectedGame]
                    );

                    /*
                     * WHICH STAGE IS THIS ANSWER IN?
                     *
                     * Read BEFORE the calibration counter advances, so the
                     * answer is judged by the stage it was ASKED in rather
                     * than the one it pushed the learner into. The fifth
                     * runway answer is a runway answer.
                     *
                     * `calibration.js` declares that the runway counts toward
                     * no ranking and cannot move the learner in either
                     * direction. Those were policy functions nothing called:
                     * every runway answer still fed the adaptation window, the
                     * mastery map and the engine's scored result intake, so
                     * five supported warm-up questions supplied half the ten
                     * unique mastered words that promote a band. A stage
                     * declared non-adjusting was adjusting.
                     */
                    const answerStage = stageOf(
                        calibrationRef.current[answerLitKey] ?? emptyCalibration()
                    );
                    const ranked = countsTowardRanking(answerStage);

                    /*
                     * The rolling window drives `decideAdjustment`, including
                     * the step DOWN. Runway answers must stay out of it, or a
                     * learner who stumbles through a warm-up gets made easier
                     * on the strength of questions that were never a measure.
                     */
                    if (ranked) {
                        performanceRef.current[skillKey] = recordOutcome(
                            performanceRef.current[skillKey] ?? emptyPerformance(),
                            { outcome, attempts, hintsUsed, timeMs }
                        );
                    }

                    /*
                     * And to the literacy profile, which is a different
                     * question: adaptation asks "is this round pitched right?",
                     * literacy asks "is this learner ready for longer words?".
                     * Mastery here means first attempt, no hints — help is free
                     * of penalty but it is not evidence of readiness.
                     */
                    if (needsReview(outcome)) missedRef.current.add(uuid);
                    else missedRef.current.delete(uuid);

                    /*
                     * The mastery map promotes BANDS, so a runway answer must
                     * not write to it. Placement answers may — placement is
                     * allowed to move a learner up, and that is the evidence
                     * it moves them on.
                     */
                    const litKey = answerLitKey;
                    if (mayAdjustLevel(answerStage)) {
                        literacyRef.current[litKey] = recordWord(
                            literacyRef.current[litKey] ?? emptyLiteracy(),
                            {
                                wordUuid: uuid,
                                outcome,
                                attempts,
                                hintsUsed,
                                skill: GAME_SKILL[selectedGame],
                            }
                        );
                        setLocalStorageItem(LITERACY_KEY, JSON.stringify(literacyRef.current));
                    }

                    /*
                     * Advance the first-session counter on EVERY answer,
                     * whatever the outcome. Advancing only on success would
                     * strand a struggling learner inside the very stage built
                     * to support them — they would never reach placement, and
                     * the runway would stop being a runway and become a gate.
                     */
                    calibrationRef.current[litKey] = recordCalibrationAnswer(
                        calibrationRef.current[litKey] ?? emptyCalibration()
                    );
                    setLocalStorageItem(CALIBRATION_KEY, JSON.stringify(calibrationRef.current));

                    /*
                     * `game_result` is the ONE local event `syncNow()`
                     * translates into the engine's scored `game.result`
                     * intake. Sending it for a runway answer contradicts the
                     * stage's own declaration that it counts toward no
                     * ranking: the engine would settle XP against thirteen
                     * questions the learner was told did not count.
                     *
                     * The local session still recorded the answer above
                     * (`recordResult`), so the completion screen and the
                     * learner's own progress display are unaffected — what is
                     * withheld is the SETTLEMENT, which is the thing "unranked"
                     * means.
                     */
                    if (ranked) {
                        await addEvent({
                            type: 'game_result',
                            run_id: updatedSession?.runId ?? '',
                            word_uuid: uuid,
                            game: selectedGame,
                            outcome,
                            attempts,
                            time_ms: typeof timeMs === 'number' ? timeMs : 0,
                        });
                    }

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
        /*
         * Promotion is decided here, and it is a DIFFERENT decision from
         * adaptation. Adaptation nudges the window by ±2 inside a band;
         * promotion moves the learner to longer words and requires sustained
         * mastery across ten unique words. Accumulated XP never promotes.
         */
        const litKey = literacyKey(sourceLanguage ?? '', GAME_SKILL[selectedGame]);
        const promotion = promoteIfReady(literacyRef.current[litKey] ?? emptyLiteracy());
        if (promotion.promoted) {
            literacyRef.current[litKey] = promotion.literacy;
            const to = UNIT_BANDS.find((b) => b.id === promotion.to);
            setBandNotice(
                to
                    ? `You are ready for longer words — now up to ${
                          Number.isFinite(to.max) ? to.max : to.min + '+'
                      } letters.`
                    : null
            );
        } else {
            setBandNotice(null);
        }
        setLocalStorageItem(LITERACY_KEY, JSON.stringify(literacyRef.current));

        /*
         * LOWERING IS RESERVED FOR RANKED PLAY.
         *
         * `calibration.js` says placement may move a learner up and never
         * down, and that the runway may not move them at all. Nothing enforced
         * it here: `decideAdjustment` was applied to whatever the window held,
         * so a learner who ended a ten-question session while still in
         * placement could be made easier on the strength of the very questions
         * the stage declared unmeasured.
         *
         * Gating the WINDOW (above) keeps runway answers out of it. This gates
         * the DECISION, which is what covers placement: it may still be
         * adjusted upward, and a downward step is held until ranking begins.
         */
        const completionStage = stageOf(
            calibrationRef.current[literacyKey(sourceLanguage ?? '', GAME_SKILL[selectedGame])] ??
                emptyCalibration()
        );
        const proposed = decideAdjustment(performanceRef.current[skillKey], { adaptive });
        const adjustment =
            proposed === ADJUST.EASIER && !mayLowerLevel(completionStage) ? ADJUST.HOLD : proposed;

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

    /*
     * THE MODE A QUESTION IS PLAYED AT IS FIXED WHEN THE QUESTION STARTS.
     *
     * The strip under the nav says "Hints change now. Difficulty changes next
     * game." — and it was not true. `mode` was computed inline in the render
     * from the live `playerLevel`, and `ListenWrite`, `CompleteSentence` and
     * `LetterReveal` read that prop while resolving the CURRENT word. So
     * tapping Challenge halfway through a question cut the retry and reveal
     * budget of the question already on screen, which is both a promise broken
     * and a difficulty change nobody asked for mid-answer.
     *
     * `ArrangeWord` already captured mode at question start; this makes every
     * game behave the way that one does, in one place, rather than four.
     *
     * The key is the question's identity, not the level: a new deal or the next
     * word takes the latest level, and nothing in between does. Adjusting state
     * during render on a changed key is React's documented pattern for exactly
     * this — it re-renders before the children see the stale value, with no
     * effect and no flash of the wrong mode.
     */
    const requestedMode =
        opensWithSupport(currentStage) ||
        needsImmediateSupport(
            literacyRef.current[literacyKey(sourceLanguage ?? '', GAME_SKILL[selectedGame])]
        )
            ? MODE.PRACTICE
            : playerLevel === LEVEL.CHALLENGE
              ? MODE.CHALLENGE
              : MODE.PRACTICE;
    const questionKey = `${selectedGame}|${session?.startedAt ?? ''}|${session?.currentIndex ?? 0}`;
    const [heldMode, setHeldMode] = useState({ key: questionKey, mode: requestedMode });
    if (heldMode.key !== questionKey) setHeldMode({ key: questionKey, mode: requestedMode });
    const questionMode = heldMode.key === questionKey ? heldMode.mode : requestedMode;

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

    /*
     * ONE SOURCE FOR THE COUNTER, AND IT CANNOT OVERRUN.
     *
     * This read `session.currentIndex + 1` out of `gameWords.length` and
     * printed "3 / 2" on screen. Both halves were wrong:
     *
     *   the total   `gameWords` is the deck currently being PLAYED, and a
     *               resumed session is handed only the words that remain
     *               (`session.words.slice(currentIndex)`). The nav then
     *               divided an absolute position by a relative length.
     *   the number  `currentIndex` counts answers RECORDED, so after the last
     *               one it equals the deck length — and +1 put the counter one
     *               past the end for the frame between the final answer and
     *               the completion screen.
     *
     * The session is the authority for both: its `words` are the whole round
     * and its `currentIndex` the position within it. Clamped, so no ordering
     * of state updates can print a question that does not exist.
     */
    const questionTotal = session?.words?.length ?? gameWords.length;
    const questionNumber = Math.min((session?.currentIndex ?? 0) + 1, Math.max(questionTotal, 1));

    const nav = (
        <GameNav
            gameName={phase === 'setup' ? null : gameLabel}
            questionAt={phase === 'playing' ? questionNumber : null}
            questionOf={phase === 'playing' ? questionTotal : null}
            soundOn={soundOn}
            onToggleSound={() => setSoundOn(setSoundEnabled(!soundOn))}
            onHome={handleHome}
            onRestart={phase === 'playing' || phase === 'complete' ? handleRestart : null}
            /* Between rounds only — see the note on `showStats`. */
            onStats={
                !showStats && (phase === 'setup' || phase === 'complete')
                    ? () => setShowStats(true)
                    : null
            }
        />
    );

    /* Asked only when there is unfinished work; see `handleHome`. */
    const leaveDialog = confirmLeave && (
        <LeaveGameDialog onKeepPlaying={() => setConfirmLeave(null)} onLeave={leaveToHome} />
    );

    /* ── Render ── */

    /*
     * Progress and ranking. Rendered ahead of the phase branches because it is
     * a view over the whole account rather than a stage of a round: `Back`
     * returns to whichever phase the player left, with the round intact.
     *
     * `engineUrl`, `getSuiteToken` and `accountId` are forwarded, not
     * defaulted. A host that supplies none of them still gets a working screen
     * — the guest branch — rather than a broken one.
     */
    if (showStats) {
        return (
            <div className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-slate-900">
                {nav}
                <div className="px-4 pt-4">
                    <button
                        type="button"
                        onClick={() => setShowStats(false)}
                        className="min-h-[44px] rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        Back
                    </button>
                </div>
                <StatsScreen
                    engineUrl={engineUrl}
                    getSuiteToken={getSuiteToken}
                    accountId={accountId}
                    sourceLanguage={sourceLanguage}
                />
                {leaveDialog}
            </div>
        );
    }

    if (phase === 'loading') {
        return (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
                {nav}
                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin" style={{ color: '#E91E8C' }} size={40} />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Loading game set&hellip;
                    </p>
                    {gameSetError && <p className="text-red-500 text-sm">{gameSetError}</p>}
                </div>
                {leaveDialog}
            </div>
        );
    }

    if (phase === 'playing') {
        return (
            /* `relative`, because the reward burst is positioned over the whole
             * play area. It is `pointer-events: none` and takes no layout
             * space, so nothing below it moves or becomes unreachable. */
            <div className="relative flex flex-1 flex-col overflow-hidden bg-white dark:bg-slate-900">
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
                    <span className="text-slate-500 dark:text-slate-400">Level</span>
                    {Object.entries(LEVEL_PROFILE).map(([id, p]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setPlayerLevel(id)}
                            aria-pressed={playerLevel === id}
                            className="min-h-[44px] rounded-lg border px-3 font-medium"
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
                    {/*
                     * Says what actually happens, which is two different things
                     * at two different times.
                     *
                     * It read "Applies from the next question" — true of the
                     * assistance, false of the words. The deck is chosen when
                     * the round loads, so changing level mid-round cannot
                     * re-deal it; the code comments admitted this while the
                     * label told the player otherwise.
                     */}
                    <span className="w-full text-[11px] text-slate-500 dark:text-slate-400">
                        Hints change now. Difficulty changes next game.
                    </span>
                    <button
                        type="button"
                        onClick={() => setAdaptive((a) => !a)}
                        aria-pressed={adaptive}
                        /* 44px, like every other control. It sat at 32px beside
                         * the level buttons and had the same problem they did. */
                        className="ml-auto min-h-[44px] rounded-lg border border-slate-300 px-3 font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    >
                        {adaptive ? 'Adjusts as you learn' : 'Stays the same'}
                    </button>
                </div>

                {widenNotice && (
                    <p
                        role="status"
                        className="shrink-0 px-3 py-1.5 text-center text-xs text-slate-600 dark:text-slate-300"
                    >
                        {widenNotice}
                    </p>
                )}

                {adjustNotice && (
                    <p className="shrink-0 px-3 py-1.5 text-center text-xs text-slate-600 dark:text-slate-300">
                        {adjustNotice}
                    </p>
                )}

                <PointsBurst
                    correct={burst.correct}
                    streak={burst.streak}
                    token={burst.token}
                    gameId={selectedGame}
                />

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
                    /*
                     * SUPPORT IS NOT PURELY THE PLAYER'S CHOICE.
                     *
                     * `opensWithSupport` and `needsImmediateSupport` were
                     * written as policy and called by nothing, so the runway's
                     * promise — meaning and audio offered BEFORE the answer,
                     * not withheld as a penalty — did not reach a single game.
                     * A learner who picked Challenge got Challenge on question
                     * one of their first session, and two consecutive
                     * struggling answers could not raise assistance until they
                     * manually changed mode.
                     *
                     * Both override Challenge downward, never upward: the
                     * player can always ask for less help than the policy
                     * gives, and never less than it requires.
                     */
                    mode: questionMode,
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
            <div className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-slate-900">
                {nav}
                <SessionComplete
                    session={session}
                    learnedCount={learnedCount}
                    onPracticeMissed={handlePracticeMissed}
                    onPlayAgain={handlePlayAgain}
                    onChooseAnother={handleChooseAnother}
                    onHome={handleHome}
                    adjustNotice={bandNotice ?? adjustNotice}
                    /* Forwarded, not defaulted: a host that implements a
                     * Browse tab gets the control, and a host that does not
                     * gets no dead button. */
                    onStats={() => setShowStats(true)}
                    onBrowse={onBrowse}
                />
                {leaveDialog}
            </div>
        );
    }

    /* ── Setup screen ── */
    return (
        <div className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-slate-900">
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

                {/*
                 * THE SHORT ROUND, BEFORE IT STARTS.
                 *
                 * The deck is already dealt when this shows, so the number is
                 * the real one and not an estimate. Two actions, and the
                 * player's game, domain, level and length choices all survive
                 * either of them.
                 */}
                {shortRound && (
                    <div
                        className="rounded-xl border px-4 py-3"
                        style={{ borderColor: '#7B3FA0', background: 'rgba(123,63,160,0.08)' }}
                        role="status"
                    >
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                            This round will be {shortRound.delivered}{' '}
                            {shortRound.delivered === 1 ? 'word' : 'words'}, not{' '}
                            {shortRound.requested}.
                        </p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                            That is every word this game can use right now for your level and
                            domain. Play these, or pick another game or domain.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={acceptShortRound}
                                className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                                style={{ background: 'linear-gradient(135deg,#E91E8C,#7B3FA0)' }}
                            >
                                Play {shortRound.delivered}{' '}
                                {shortRound.delivered === 1 ? 'word' : 'words'}
                            </button>
                            <button
                                type="button"
                                onClick={dismissShortRound}
                                className="rounded-xl border-2 px-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200"
                                style={{ borderColor: '#d1d5db' }}
                            >
                                Choose something else
                            </button>
                        </div>
                    </div>
                )}

                {/* Language check */}
                {!sourceLanguage && (
                    <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center dark:border-slate-600">
                        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
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
                            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                Domain (optional)
                            </h3>
                            {domainsLoading ? (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Loading domains&hellip;
                                </p>
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
                                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
                                        aria-hidden="true"
                                    />
                                </div>
                            )}
                        </section>

                        {/* Game type */}
                        <section>
                            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                Game
                            </h3>
                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                                {GAME_TYPES.map((g) => {
                                    const status = availability[g.id];
                                    /* Only a KNOWN refusal disables a card. An
                                     * unanswered question is not a "no". */
                                    const blocked = availabilityKnown && status && !status.playable;
                                    const active = selectedGame === g.id;
                                    const accent = accentFor(g.id);
                                    return (
                                        <button
                                            key={g.id}
                                            type="button"
                                            onClick={() => {
                                                gameChosenByPlayerRef.current = true;
                                                setSelectedGame(g.id);
                                            }}
                                            disabled={blocked}
                                            aria-disabled={blocked || undefined}
                                            aria-pressed={active}
                                            title={blocked ? status.message : undefined}
                                            className={[
                                                'relative overflow-hidden rounded-xl border-2 p-3 text-left transition-all',
                                                /* The play area is the playful
                                                 * part: a selected card lifts.
                                                 * The shell around it does not
                                                 * move — see src/theme.js. */
                                                active ? 'scale-[1.02] shadow-lg' : '',
                                                blocked
                                                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60'
                                                    : active
                                                      ? 'border-transparent text-white'
                                                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500',
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            style={
                                                active
                                                    ? {
                                                          /* White label on this, so the
                                                           * contrast-checked variant —
                                                           * see the two accent maps in
                                                           * src/theme.js. */
                                                          background: `linear-gradient(135deg, ${accentOnWhiteFor(g.id)}, ${COLOR.purple})`,
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {/*
                                             * SELECTION IS NOT SAID IN COLOUR ALONE.
                                             *
                                             * The gradient reads as "chosen" only
                                             * to someone who can see it. The tick,
                                             * the left accent bar and `aria-pressed`
                                             * each say the same thing another way.
                                             */}
                                            {active && (
                                                <span
                                                    className="absolute right-2 top-2 text-sm font-black"
                                                    aria-hidden="true"
                                                >
                                                    ✓
                                                </span>
                                            )}
                                            {!active && !blocked && (
                                                <span
                                                    className="absolute inset-y-0 left-0 w-1"
                                                    style={{ background: accent }}
                                                    aria-hidden="true"
                                                />
                                            )}

                                            <span
                                                className="mb-1 block text-2xl"
                                                aria-hidden="true"
                                            >
                                                {g.emoji}
                                            </span>
                                            <span
                                                className={`block text-sm font-bold leading-tight ${
                                                    active
                                                        ? 'text-white'
                                                        : blocked
                                                          ? 'text-slate-500 dark:text-slate-400'
                                                          : 'text-slate-900 dark:text-slate-100'
                                                }`}
                                            >
                                                {g.label}
                                            </span>
                                            <span
                                                className={`mt-0.5 block text-xs leading-snug ${
                                                    active
                                                        ? 'text-white/85'
                                                        : 'text-slate-600 dark:text-slate-300'
                                                }`}
                                            >
                                                {g.description}
                                            </span>
                                            {/* The specific missing thing, never
                                             * "unavailable" on its own — a player
                                             * can act on "needs example sentences"
                                             * and cannot act on a grey card. */}
                                            {blocked && (
                                                <span className="mt-1.5 block text-xs font-semibold leading-snug text-amber-700 dark:text-amber-400">
                                                    {status.message}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Level. Three, chosen by the player and changeable at any
                         *  time — including mid-round from the strip below the game.
                         *  What no level changes is that Skip, reveal and navigation
                         *  stay available: a harder level is not a trap. */}
                        <section>
                            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
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
                                            style={
                                                playerLevel === m.id
                                                    ? { background: GRADIENT.deep }
                                                    : {}
                                            }
                                            className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                                                playerLevel === m.id
                                                    ? 'border-transparent text-white'
                                                    : 'border-slate-200 text-slate-800 hover:border-slate-300 dark:border-slate-700 dark:text-slate-100 dark:hover:border-slate-500'
                                            }`}
                                        >
                                            <span className="block text-sm font-bold">
                                                {playerLevel === m.id ? '✓ ' : ''}
                                                {m.label}
                                            </span>
                                            <span
                                                className={`block text-xs ${
                                                    playerLevel === m.id
                                                        ? 'text-white/85'
                                                        : 'text-slate-600 dark:text-slate-300'
                                                }`}
                                            >
                                                {m.hint}
                                            </span>
                                        </button>
                                    ))}
                            </div>
                        </section>

                        {/* Word count */}
                        <section>
                            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                Words per session
                            </h3>
                            <div className="flex gap-2">
                                {WORD_COUNTS.map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setWordCount(n)}
                                        aria-pressed={wordCount === n}
                                        className={`min-h-[48px] flex-1 rounded-xl border-2 text-base font-bold transition-colors ${
                                            wordCount === n
                                                ? 'border-transparent text-white'
                                                : 'border-slate-200 text-slate-800 hover:border-slate-300 dark:border-slate-700 dark:text-slate-100 dark:hover:border-slate-500'
                                        }`}
                                        style={wordCount === n ? { background: COLOR.magenta } : {}}
                                    >
                                        {wordCount === n ? `✓ ${n}` : n}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Start button. Disabled rather than allowed to fail:
                         *  starting a game that cannot deal a question is the
                         *  defect, and the reason sits beside the control that
                         *  would have triggered it. */}
                        {selectedUnplayable && (
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                {selectedAvailability?.message}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={handleStart}
                            disabled={selectedUnplayable}
                            aria-disabled={selectedUnplayable || undefined}
                            className={`mt-auto w-full rounded-xl py-4 text-base font-bold text-white transition-transform ${
                                selectedUnplayable ? 'cursor-not-allowed' : 'active:scale-[0.99]'
                            }`}
                            style={
                                selectedUnplayable
                                    ? { background: COLOR.panelRaised }
                                    : { background: GRADIENT.primary }
                            }
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
