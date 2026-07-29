import React from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { usePronounce } from '../hooks/usePronounce.js';

/**
 * PronounceButton — tap to hear a headword spoken by the Kasanoma Twi model.
 *
 * On first tap the button shows a loading spinner while the server synthesises
 * the audio (typically < 1 s). Every subsequent tap of the same word is served
 * from the in-page cache — no spinner, no network round-trip.
 *
 * Props:
 *   restUrl  {string}  Base REST URL (sparxstar/v1/dictionary)
 *   word     {string}  The headword to pronounce
 *   size     {number}  Icon size in px (default 20)
 *   style    {object}  Extra inline styles applied to the button
 *   className {string} Extra CSS classes applied to the button
 */
export default function PronounceButton({ restUrl, word, size = 20, style, className = '' }) {
    const { play, loading, error } = usePronounce({ restUrl, word });

    const baseStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        background: error ? '#FFEBEE' : '#FCE4F3',
        color: error ? '#C62828' : '#E91E8C',
        flexShrink: 0,
        ...style,
    };

    return (
        <button
            type="button"
            onClick={play}
            disabled={loading}
            aria-label={loading ? 'Synthesising pronunciation…' : `Play pronunciation of ${word}`}
            title={error ?? undefined}
            className={className}
            style={baseStyle}
        >
            {loading ? (
                <Loader2 size={size} className="animate-spin" aria-hidden="true" />
            ) : (
                <Volume2 size={size} aria-hidden="true" />
            )}
        </button>
    );
}
