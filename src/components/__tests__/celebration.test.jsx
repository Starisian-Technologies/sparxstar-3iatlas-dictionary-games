/**
 * Fanfare must never become an obstacle.
 *
 * Three properties matter more than how it looks, and all three are testable:
 * it disappears entirely under `prefers-reduced-motion`, it cannot intercept a
 * click meant for a navigation control, and it stops on unmount rather than
 * leaving a requestAnimationFrame loop running behind the summary screen.
 *
 * The last one is not fussiness. This runs on phones and Chromebooks; an
 * animation that never cancels is a battery drain the player cannot see.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Celebration, { prefersReducedMotion } from '../Celebration.jsx';

function withMatchMedia(matches, fn) {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({ matches });
    try {
        return fn();
    } finally {
        window.matchMedia = original;
    }
}

function mount(element) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(element));
    return { container, unmount: () => act(() => root.unmount()) };
}

describe('Celebration', () => {
    it('renders nothing at all when the viewer asks for reduced motion', () => {
        withMatchMedia(true, () => {
            const { container, unmount } = mount(<Celebration />);
            /* Not "renders a hidden canvas" — no canvas, so no rAF loop. */
            expect(container.querySelector('canvas')).toBeNull();
            unmount();
        });
    });

    it('renders a canvas when motion is welcome', () => {
        withMatchMedia(false, () => {
            const { container, unmount } = mount(<Celebration />);
            expect(container.querySelector('canvas')).not.toBeNull();
            unmount();
        });
    });

    it('never intercepts a click meant for a navigation control', () => {
        withMatchMedia(false, () => {
            const { container, unmount } = mount(<Celebration />);
            const canvas = container.querySelector('canvas');
            expect(canvas.className).toContain('pointer-events-none');
            unmount();
        });
    });

    it('cancels its animation frame on unmount', () => {
        /*
         * jsdom ships no canvas backend, so `getContext` returns null and the
         * component correctly declines to animate. A stub context is supplied
         * so the loop actually starts and there is something to cancel.
         */
        const ctx = {
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            translate: jest.fn(),
            rotate: jest.fn(),
            fillRect: jest.fn(),
        };
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx);
        const cancel = jest.spyOn(window, 'cancelAnimationFrame');
        try {
            withMatchMedia(false, () => {
                const { unmount } = mount(<Celebration />);
                unmount();
                expect(cancel).toHaveBeenCalled();
            });
        } finally {
            HTMLCanvasElement.prototype.getContext = original;
            cancel.mockRestore();
        }
    });

    it('survives a canvas context that throws', () => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = () => {
            throw new Error('no 2d context here');
        };
        try {
            withMatchMedia(false, () => {
                /* The point: mounting does not throw. */
                const { unmount } = mount(<Celebration />);
                unmount();
            });
        } finally {
            HTMLCanvasElement.prototype.getContext = original;
        }
    });

    it('renders nothing when explicitly inactive', () => {
        withMatchMedia(false, () => {
            const { container, unmount } = mount(<Celebration active={false} />);
            expect(container.querySelector('canvas')).toBeNull();
            unmount();
        });
    });

    it('treats a browser without matchMedia as willing, not as an error', () => {
        const original = window.matchMedia;
        delete window.matchMedia;
        try {
            expect(prefersReducedMotion()).toBe(false);
        } finally {
            window.matchMedia = original;
        }
    });

    it('treats a matchMedia that throws as willing, not as a crash', () => {
        const original = window.matchMedia;
        window.matchMedia = () => {
            throw new Error('unsupported query');
        };
        try {
            expect(prefersReducedMotion()).toBe(false);
        } finally {
            window.matchMedia = original;
        }
    });
});
