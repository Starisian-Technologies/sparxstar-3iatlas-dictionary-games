import React, { useEffect, useRef } from 'react';

/**
 * Confirmation shown when leaving would discard unfinished work.
 *
 * Its own component rather than inline JSX because a dialog that declares
 * `aria-modal="true"` owes the keyboard three things, and all three need
 * effects: focus lands INSIDE it when it opens, `Escape` dismisses it, and
 * focus returns to wherever it came from on close.
 *
 * That matters more here than in most dialogs. This one stands between a
 * player and the way out of a game, so a keyboard or switch user who could
 * open it but not dismiss it would be trapped by the very control added to
 * stop them being trapped.
 *
 * Props:
 *   onKeepPlaying {Function} Dismiss and stay in the round
 *   onLeave       {Function} Discard the round and go
 */
export default function LeaveGameDialog({ onKeepPlaying, onLeave }) {
    const keepRef = useRef(null);
    const returnFocusRef = useRef(null);

    useEffect(() => {
        /* Remember what had focus so it can be handed back on close. */
        returnFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
        /* `Keep Playing` is the safe default, so it takes focus: a stray Enter
         * keeps the player in the round rather than discarding it. */
        keepRef.current?.focus?.();

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onKeepPlaying();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            returnFocusRef.current?.focus?.();
        };
    }, [onKeepPlaying]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-game-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-gray-800">
                <h2
                    id="leave-game-title"
                    className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                    Leave this game?
                </h2>
                <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
                    You have not finished this round. Your progress so far in it will not be saved.
                </p>
                <div className="flex flex-col gap-2">
                    <button
                        ref={keepRef}
                        type="button"
                        onClick={onKeepPlaying}
                        className="min-h-[44px] w-full rounded-xl px-4 font-semibold text-white"
                        style={{ background: '#E91E8C' }}
                    >
                        Keep Playing
                    </button>
                    <button
                        type="button"
                        onClick={onLeave}
                        className="min-h-[44px] w-full rounded-xl border border-gray-300 px-4 font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        Leave Game
                    </button>
                </div>
            </div>
        </div>
    );
}
