import React, { useEffect, useRef, useState } from 'react';

/**
 * Celebration — a brief confetti burst on session completion.
 *
 * Written from scratch rather than lifted from the reference CodePens. Those
 * are visual references; copying one would import both its licence and its
 * dependencies (several pull jQuery or a canvas library) for an effect that is
 * a few dozen lines of canvas. Nothing here is copied and no dependency is
 * added.
 *
 * Constraints this honours, because the audience is a phone or a Chromebook on
 * a low-bandwidth connection:
 *
 *   - `prefers-reduced-motion` removes the animation entirely. Not "slows it":
 *     the component renders nothing and no canvas or rAF loop is created.
 *   - It STOPS. `DURATION_MS` bounds the run and the loop cancels itself, so
 *     no rAF keeps firing behind the summary draining battery.
 *   - `pointer-events: none` and no layout space, so it can never sit on top of
 *     a navigation control. Fanfare that blocks the way out would re-create the
 *     trap this release exists to fix.
 *   - Particle count is small and fixed, and the canvas is sized once.
 */

const DURATION_MS = 1800;
const PARTICLES = 60;
const COLORS = ['#E91E8C', '#7B3FA0', '#009688', '#F5A623'];

/** Does this viewer want motion? Wrapped because `matchMedia` is absent in jsdom. */
export function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        /* A browser that throws on an unknown query gets the animation. */
        return false;
    }
}

export default function Celebration({ active = true }) {
    const canvasRef = useRef(null);
    const frameRef = useRef(null);
    /*
     * Resolved once on mount rather than read during render: reading a media
     * query while rendering makes the first paint depend on it, and the value
     * cannot change usefully within the 1.8s this component lives.
     */
    const [reduced] = useState(() => prefersReducedMotion());

    useEffect(() => {
        if (reduced || !active) return undefined;
        const canvas = canvasRef.current;
        if (!canvas || typeof canvas.getContext !== 'function') return undefined;

        /*
         * Wrapped: a canvas context is not guaranteed. jsdom returns null
         * without a canvas backend, and some environments throw outright
         * rather than returning null. Either way the summary screen must still
         * render — the celebration is the decoration, not the content.
         */
        let ctx = null;
        try {
            ctx = canvas.getContext('2d');
        } catch {
            ctx = null;
        }
        if (!ctx) return undefined;

        const width = (canvas.width = canvas.offsetWidth || 320);
        const height = (canvas.height = canvas.offsetHeight || 240);

        const particles = Array.from({ length: PARTICLES }, () => ({
            x: width / 2,
            y: height * 0.35,
            vx: (Math.random() - 0.5) * 9,
            vy: Math.random() * -9 - 2,
            size: 4 + Math.random() * 4,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            spin: (Math.random() - 0.5) * 0.3,
            angle: Math.random() * Math.PI,
        }));

        const started = Date.now();
        const tick = () => {
            const elapsed = Date.now() - started;
            if (elapsed > DURATION_MS) {
                ctx.clearRect(0, 0, width, height);
                return;
            }
            ctx.clearRect(0, 0, width, height);
            /* Fade out over the last third so it ends rather than vanishing. */
            ctx.globalAlpha = Math.max(
                0,
                1 - Math.max(0, elapsed - DURATION_MS * 0.66) / (DURATION_MS * 0.34)
            );
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.32; /* gravity */
                p.vx *= 0.99;
                p.angle += p.spin;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            }
            frameRef.current = requestAnimationFrame(tick);
        };

        frameRef.current = requestAnimationFrame(tick);
        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [reduced, active]);

    /* Nothing rendered at all under reduced motion — no canvas, no loop. */
    if (reduced || !active) return null;

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
        />
    );
}
