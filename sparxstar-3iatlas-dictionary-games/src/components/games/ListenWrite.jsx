import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Volume2, RotateCcw } from 'lucide-react';
import AccessoryBar from '../AccessoryBar.jsx';

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
 *   onResult   {Function} (uuid, outcome, attempts, xp) => void
 *   onComplete {Function} () => void
 */
export default function ListenWrite({ words, language, onResult, onComplete }) {
    const deck = useMemo(() => shuffle(words.filter((w) => !!w.audio_url)), [words]);

    const [index, setIndex] = useState(0);
    const [input, setInput] = useState('');
    const [attempts, setAttempts] = useState(0);
    const [revealed, setRevealed] = useState('');
    const [status, setStatus] = useState(null); /* 'correct' | 'wrong' | null */
    const inputRef = useRef(null);
    const audioRef = useRef(null);

    const word = deck[index];

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
            <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-gray-400 italic text-sm">
                    No words with audio in this set.
                    <br />
                    Try a different domain or language.
                </p>
            </div>
        );
    }

    if (!word) return null;

    const target = word.headword;
    const translation =
        language === 'fr' && word.translation_fr ? word.translation_fr : word.translation_en;

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
            onResult(word.uuid, 'correct', attempts + 1, 10);
            setTimeout(() => advance(), 1500);
        } else {
            const nextAttempts = attempts + 1;
            setAttempts(nextAttempts);
            setInput('');

            if (nextAttempts >= 3) {
                setRevealed(target);
                setStatus('wrong');
                onResult(word.uuid, 'learning', 3, 0);
                setTimeout(() => advance(), 2000);
            } else {
                setRevealed(target.substring(0, nextAttempts));
            }
        }
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

            {/* Feedback */}
            {status === 'correct' && (
                <div className="text-center shrink-0">
                    <p className="text-green-600 font-bold">+10 XP ✓</p>
                    <p className="text-gray-500 text-sm mt-1">{translation}</p>
                </div>
            )}
            {status === 'wrong' && (
                <div className="text-center shrink-0">
                    <p className="text-gray-500 text-sm">
                        The word was:{' '}
                        <strong className="text-gray-800 dark:text-gray-200">{target}</strong>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Still learning</p>
                </div>
            )}

            {/* Input */}
            {!status && (
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
            {attempts > 0 && !status && (
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
