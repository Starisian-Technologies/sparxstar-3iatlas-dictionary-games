import React, { useState, useEffect } from 'react';

/**
 * AccessoryBar — Mandinka special-character insertion bar.
 *
 * Attaches a focusin listener to detect which input is active.
 * Characters are inserted at the cursor position without stealing focus.
 * Positions itself above the virtual keyboard using window.visualViewport.
 *
 * Only activates for inputs that carry the `data-aiwa-input="true"` attribute.
 */
const CHARS = ['ŋ', 'ɓ', 'ɗ', 'ñ', 'ɲ', 'ʔ', 'á', 'é', 'í', 'ó', 'ú'];

export default function AccessoryBar() {
    const [activeInput, setActiveInput] = useState(null);
    const [bottomOffset, setBottomOffset] = useState(0);

    useEffect(() => {
        const onFocusIn = (e) => {
            const el = e.target;
            if (
                (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
                el.dataset.aiwaInput === 'true'
            ) {
                setActiveInput(el);
            }
        };

        const onFocusOut = (e) => {
            /* Only clear if focus is moving away from an aiwa input entirely. */
            if (e.relatedTarget && e.relatedTarget.dataset?.aiwaInput === 'true') return;
            setActiveInput(null);
        };

        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('focusout', onFocusOut);

        /* Track keyboard height via visualViewport. */
        const onViewportResize = () => {
            if (!window.visualViewport) return;
            const offset = Math.max(
                0,
                window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
            );
            setBottomOffset(offset);
        };

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onViewportResize);
            window.visualViewport.addEventListener('scroll', onViewportResize);
        }

        return () => {
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('focusout', onFocusOut);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', onViewportResize);
                window.visualViewport.removeEventListener('scroll', onViewportResize);
            }
        };
    }, []);

    /* Insert character at current cursor position without stealing focus. */
    const insertChar = (char) => {
        if (!activeInput) return;

        /*
         * Reading selectionStart/selectionEnd throws a DOMException on input
         * types that don't support text selection (e.g. email, number) in
         * Chrome/Firefox. A host could tag such an input with data-aiwa-input,
         * so guard the access and fall back to appending at the end.
         */
        let start = activeInput.value.length;
        let end = activeInput.value.length;
        try {
            if (typeof activeInput.selectionStart === 'number') {
                start = activeInput.selectionStart;
                end = activeInput.selectionEnd;
            }
        } catch {
            /* Input type does not support selection — append at the end. */
        }
        const newValue =
            activeInput.value.substring(0, start) + char + activeInput.value.substring(end);

        /* Trigger React's synthetic onChange via the native value setter. */
        const inputPrototype =
            activeInput.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement?.prototype
                : window.HTMLInputElement?.prototype;
        const nativeSetter = inputPrototype
            ? Object.getOwnPropertyDescriptor(inputPrototype, 'value')?.set
            : null;

        if (nativeSetter) {
            nativeSetter.call(activeInput, newValue);
        } else {
            activeInput.value = newValue;
        }

        activeInput.dispatchEvent(new Event('input', { bubbles: true }));

        const newCursor = start + char.length;
        try {
            activeInput.selectionStart = newCursor;
            activeInput.selectionEnd = newCursor;
        } catch {
            /* Input type does not support selection — cursor stays as-is. */
        }
        activeInput.focus();
    };

    if (!activeInput) return null;

    return (
        <div
            className="fixed left-0 right-0 z-[9000] flex gap-1 px-3 py-2"
            style={{ bottom: bottomOffset, background: '#E91E8C' }}
            aria-label="Mandinka special characters"
            role="toolbar"
        >
            {CHARS.map((char) => (
                <button
                    key={char}
                    type="button"
                    /* Prevent the button click from stealing focus off the input. */
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertChar(char)}
                    className="flex-1 py-2 text-white font-bold text-base rounded transition-colors"
                    style={{ background: 'rgba(255,255,255,0.25)' }}
                    aria-label={`Insert ${char}`}
                >
                    {char}
                </button>
            ))}
        </div>
    );
}
