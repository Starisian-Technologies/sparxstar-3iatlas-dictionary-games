/**
 * Game sounds, synthesised — no audio files, no network, no dependency.
 *
 * ===================== WHY IT IS SYNTHESISED =========================
 *
 * The audience is a phone on a slow connection. A set of sound files is a set
 * of extra requests to make before a game can feel responsive, and the first
 * correct answer would land silently while they were still downloading. These
 * are a few oscillator notes through the Web Audio API: nothing to fetch,
 * nothing to cache, and no bytes on a metered connection.
 *
 * It is also the only way to keep the promise about the Dictionary's audio.
 * `audio_url` is a consented RECORDING of a Mandinka word and is governed;
 * these are interface sounds and are not recordings of anything. Keeping them
 * in separate code makes it impossible for one to be served as the other.
 *
 * ===================== THE RULES IT FOLLOWS ==========================
 *
 *   - OFF is remembered, and off means silent: no context is created at all.
 *   - Nothing plays before a gesture. Browsers suspend an AudioContext created
 *     without one, and a suspended context that is never resumed is a slow
 *     leak; this one is created lazily on the first sound after a tap.
 *   - Every entry point is wrapped. An environment without Web Audio (jsdom,
 *     a locked-down browser, a device with audio disabled) must lose the
 *     sound and nothing else — a game that throws because it could not play a
 *     blip is worse than a silent game.
 *   - `prefers-reduced-motion` is NOT treated as "no sound". They are
 *     different preferences and conflating them takes away feedback from
 *     someone who only asked for less movement.
 */

const STORAGE_KEY = 'aiwa-dict-sound';

/** Module-level so one context is shared by every sound in the tab. */
let context = null;
let enabled = null;

/** Is Web Audio available here at all? */
function audioContextClass() {
    if (typeof window === 'undefined') return null;
    return window.AudioContext ?? window.webkitAudioContext ?? null;
}

/**
 * Whether sound is on.
 *
 * Defaults to ON: these are games, and a child who has to find a setting to
 * hear anything will not find it. The player's choice, once made, wins.
 */
export function soundEnabled() {
    if (enabled !== null) return enabled;
    try {
        const stored = window.localStorage?.getItem(STORAGE_KEY);
        enabled = stored === null || stored === undefined ? true : stored === 'on';
    } catch {
        /* Private mode, or storage disabled. Play, and forget the choice. */
        enabled = true;
    }
    return enabled;
}

/** Turn sound on or off and remember it. Returns the new state. */
export function setSoundEnabled(next) {
    enabled = Boolean(next);
    try {
        window.localStorage?.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
        /* Unstorable is not unusable — the choice holds for this tab. */
    }
    if (!enabled && context) {
        try {
            context.close();
        } catch {
            /* Already closed, or closing unsupported. */
        }
        context = null;
    }
    return enabled;
}

/** For tests, which must not inherit one another's state. */
export function resetSoundForTests() {
    enabled = null;
    context = null;
}

/**
 * Create and unlock the audio context WHILE A GESTURE IS STILL IN HAND.
 *
 * Every sound in this file is played after `await recordResult(...)`, which
 * includes an IndexedDB write. By the time it resolves the callback has left
 * the transient user activation the tap gave it, and Chromium will create or
 * resume an AudioContext in the `suspended` state — so the first correct answer
 * of a session is silent, which is exactly the one that most needs not to be.
 *
 * Called synchronously from the answer handler, before any await. Cheap and
 * idempotent: after the first call it is a state check. Safe to call when sound
 * is off, where it does nothing at all rather than building a context nobody
 * asked for.
 */
export function primeSound() {
    /* Not `ensureContext()`: that is the same work, but naming this separately
     * keeps the reason legible at the call site, where the ordering matters. */
    return ensureContext() !== null;
}

function ensureContext() {
    if (!soundEnabled()) return null;
    const Ctor = audioContextClass();
    if (!Ctor) return null;
    try {
        if (!context) context = new Ctor();
        /* Created before a gesture, or suspended by the tab going background. */
        if (context.state === 'suspended' && typeof context.resume === 'function') {
            context.resume().catch(() => {});
        }
        return context;
    } catch {
        return null;
    }
}

/**
 * One note.
 *
 * Short attack, exponential release: a blip rather than a beep. Gain is kept
 * low — this plays over whatever else the room is doing, and a game that makes
 * someone lunge for the volume key has already lost.
 */
function note(ctx, { frequency, startAt, durationMs, gain = 0.12, type = 'sine' }) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const seconds = durationMs / 1000;

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);

    amp.gain.setValueAtTime(0.0001, startAt);
    amp.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + seconds + 0.02);
}

/** Play a sequence of `[frequency, offsetMs, durationMs]` notes. */
function play(sequence, { gain, type } = {}) {
    const ctx = ensureContext();
    if (!ctx) return false;
    try {
        const now = ctx.currentTime;
        for (const [frequency, offsetMs, durationMs] of sequence) {
            note(ctx, {
                frequency,
                startAt: now + offsetMs / 1000,
                durationMs,
                gain,
                type,
            });
        }
        return true;
    } catch {
        return false;
    }
}

/*
 * THE VOCABULARY.
 *
 * Rising intervals for progress, a warm major triad for a win, and — for the
 * round that did not go well — a gentle falling third rather than the buzzer
 * every quiz game reaches for. The brief is explicit that a learner is never
 * shamed, and a loud negative sound is the fastest way to do it. It is quieter
 * than every other sound here on purpose.
 */

/** A correct answer. */
export function playCorrect() {
    return play(
        [
            [660, 0, 110],
            [880, 70, 150],
        ],
        { gain: 0.1 }
    );
}

/** A streak, rising with its length so three feels bigger than two. */
export function playStreak(length = 3) {
    const step = Math.min(Math.max(length, 3), 8) - 3;
    const base = 660 + step * 40;
    return play(
        [
            [base, 0, 90],
            [base * 1.25, 60, 90],
            [base * 1.5, 120, 180],
        ],
        { gain: 0.11 }
    );
}

/** An answer that was not right. Soft, low, and over quickly. */
export function playIncorrect() {
    return play(
        [
            [320, 0, 120],
            [260, 90, 170],
        ],
        { gain: 0.06, type: 'triangle' }
    );
}

/** A strong finish. */
export function playWin() {
    return play(
        [
            [523.25, 0, 140],
            [659.25, 110, 140],
            [783.99, 220, 160],
            [1046.5, 340, 320],
        ],
        { gain: 0.12 }
    );
}

/** A finish worth marking, without a fanfare it did not earn. */
export function playPartial() {
    return play(
        [
            [523.25, 0, 150],
            [659.25, 120, 260],
        ],
        { gain: 0.1 }
    );
}

/**
 * A round that needs more practice.
 *
 * Disappointed but supportive, as the brief asks: a small falling third, soft,
 * and nothing that sounds like a failure buzzer.
 */
export function playTryAgain() {
    return play(
        [
            [440, 0, 160],
            [349.23, 130, 300],
        ],
        { gain: 0.07, type: 'triangle' }
    );
}
