import React from 'react';
import { AWARD_STYLE } from '../awards.js';

/**
 * One award, in the AIWA house style.
 *
 * Transcribed from the approved mockups (`RLC-awards.png`, `RLC-awards-2.png`):
 * near-black card, a single accent colour per award carried through its edge,
 * category label and name, the criterion in muted grey beneath, and a reward
 * row of gold and stars.
 *
 * The point of sharing this with RLC is that a learner who meets both products
 * should see one platform rather than two apps that happen to share a logo.
 *
 * IT RENDERS WHAT IT IS GIVEN. There is no logic here that decides whether an
 * award was earned — that is settled server-side and arrives as data. See the
 * header of `src/awards.js`.
 *
 * `variant`:
 *   'card' — the grid tile from the "Awards you can earn" sheet
 *   'row'  — the list row from the "All Awards" screen, with an Earned flag
 */
export default function BadgeCard({ award, variant = 'card', earnedLabel = null }) {
    if (!award) return null;

    if (variant === 'row') {
        return (
            <div
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{ background: AWARD_STYLE.card, borderColor: AWARD_STYLE.cardBorder }}
            >
                <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
                    style={{
                        color: award.colour,
                        border: `1px solid ${award.colour}55`,
                        /* The neon glow of the mockup, at a weight that stays
                         * legible on a low-brightness phone screen. */
                        boxShadow: `0 0 12px ${award.colour}33, inset 0 0 12px ${award.colour}1A`,
                    }}
                >
                    ★
                </span>
                <span className="min-w-0 flex-1">
                    <span
                        className="block truncate text-sm font-semibold"
                        style={{ color: AWARD_STYLE.heading }}
                    >
                        {award.name}
                    </span>
                    <span className="block truncate text-xs" style={{ color: AWARD_STYLE.muted }}>
                        {award.short}
                    </span>
                </span>
                {earnedLabel && (
                    <span
                        className="shrink-0 text-xs font-semibold"
                        style={{ color: AWARD_STYLE.earned }}
                    >
                        {earnedLabel}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div
            className="flex flex-col items-center rounded-2xl border px-3 py-4 text-center"
            style={{
                background: AWARD_STYLE.card,
                borderColor: `${award.colour}40`,
                boxShadow: `0 0 18px ${award.colour}1F`,
            }}
        >
            <span
                className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: `${award.colour}CC` }}
            >
                {award.category}
            </span>
            <span
                aria-hidden="true"
                className="my-2 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                style={{
                    color: award.colour,
                    border: `1px solid ${award.colour}66`,
                    boxShadow: `0 0 20px ${award.colour}40, inset 0 0 16px ${award.colour}22`,
                }}
            >
                ★
            </span>
            <span
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: award.colour }}
            >
                {award.name}
            </span>
            <span className="mt-1 text-xs" style={{ color: AWARD_STYLE.heading }}>
                {award.short}
            </span>
            <span className="mt-2 text-[11px] leading-snug" style={{ color: AWARD_STYLE.muted }}>
                {award.criterion}
            </span>
            <span className="mt-3 flex items-center gap-3 text-xs font-semibold">
                <span style={{ color: AWARD_STYLE.gold }}>+{award.gold}</span>
                <span style={{ color: AWARD_STYLE.star }}>
                    ★ {award.stars} {award.stars === 1 ? 'Star' : 'Stars'}
                </span>
            </span>
        </div>
    );
}
