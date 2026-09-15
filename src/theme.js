/**
 * The 3iAtlas shell, inherited from WordPad.
 *
 * ===================== WHERE THESE COME FROM =========================
 *
 * WordPad is the visual reference for the 3iAtlas family, so nothing here is
 * invented. Every value was read out of
 * `Starisian-Technologies/sparxstar-3iatlas-wordpad` at 288be31:
 *
 *   src/components/shell/TopBar.tsx          the desktop header — surface,
 *                                            border, the cyan "3i" badge, and
 *                                            the purple active tab
 *   src/components/shell/Sidebar.tsx         panel surfaces and the wordmark
 *   src/components/shell/MobileBottomNav.tsx the mobile bar and its raised
 *                                            primary action
 *   src/index.css, tailwind.config.js        typography and the dark ground
 *
 * If WordPad moves, this file is what moves with it — one home, so the games
 * cannot drift into a second, nearly-identical palette.
 *
 * ===================== WHAT THE GAMES KEEP ===========================
 *
 * The SHELL is shared; the PLAY AREA is not. WordPad is a writing tool and is
 * calm by design. These are games for children and new readers, so inside the
 * gameplay area the accent colours are saturated, the feedback moves, and
 * correct answers are loud. That contrast is deliberate: the chrome says "this
 * is 3iAtlas", the board says "this is a game".
 */

/** Raw values, for inline styles and canvas work where a class will not do. */
export const COLOR = {
    /* The 3iAtlas ground and its panels — slate-900 / slate-800. */
    ground: '#0f172a',
    panel: '#1e293b',
    panelRaised: '#334155',
    /* Thin blue-gray borders — slate-700 / slate-200. */
    border: '#334155',
    borderLight: '#e2e8f0',
    /* Text — slate-100 / slate-400. */
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    /*
     * The cyan product badge. `sky-600`, from TopBar's "3i" button — NOT the
     * purple the sidebar uses for the same badge. The header is the one the
     * player sees on every screen, so the header's value is the family's.
     */
    badge: '#0284c7',
    /* WordPad's active state, and the family's primary. */
    purple: '#7B3FA0',
    purpleDeep: '#4C1D95',
    /* The games' own accent, already in family with the purple. */
    magenta: '#E91E8C',
    /* Status. Kept apart from the accents so "correct" never reads as "brand". */
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#f43f5e',
    info: '#38bdf8',
};

/** The family gradient — WordPad's raised primary action. */
export const GRADIENT = {
    primary: `linear-gradient(135deg, ${COLOR.magenta}, ${COLOR.purple})`,
    deep: `linear-gradient(135deg, ${COLOR.purple}, ${COLOR.purpleDeep})`,
};

/**
 * Shared class strings.
 *
 * Tailwind classes rather than inline styles wherever the value is structural,
 * so the games pick up the same responsive and dark-mode behaviour WordPad has
 * rather than a second implementation of it.
 */
export const SHELL = {
    /** App ground. Deep navy in dark, white in light — WordPad's body rule. */
    surface: 'bg-white dark:bg-slate-900',
    /** A panel or card sitting on the ground. */
    panel: 'bg-white dark:bg-slate-800',
    /** The thin blue-gray divider used for every chrome edge. */
    border: 'border-slate-200 dark:border-slate-700',
    /** Primary and secondary body text. */
    text: 'text-slate-900 dark:text-slate-100',
    textMuted: 'text-slate-600 dark:text-slate-300',
    /*
     * Explanatory and disabled text.
     *
     * `slate-500` rather than the `gray-400` the games used: on the navy
     * ground that failed contrast badly enough that the level descriptions and
     * every disabled control were effectively unreadable — which is what made
     * the disabled game cards look broken rather than unavailable.
     */
    textFaint: 'text-slate-500 dark:text-slate-400',
    /** A touch target large enough for a child on a tablet — 44px minimum. */
    tap: 'min-h-[44px]',
};

/**
 * Per-game accent colours.
 *
 * Each game gets its own, because "light up the answer area in the game's
 * colour" needs a game to have one. Chosen inside the family — no new hues,
 * just the family's own spread.
 *
 * TWO SETS, BECAUSE ONE COLOUR CANNOT DO BOTH JOBS.
 *
 * The first cut claimed these were "dark enough to carry white text". Measured
 * against #ffffff, most are not:
 *
 *   #E91E8C  4.18:1     #0284c7  4.10:1     #10b981  2.54:1
 *   #f59e0b  2.15:1      #8b5cf6  4.23:1     #7B3FA0  6.86:1  ← the only pass
 *
 * They were the background of selected game cards and of the streak badge, so
 * the newest and loudest feedback in the product was also the least readable
 * part of it. `#10b981` and `#f59e0b` are not close.
 *
 * `GAME_ACCENT` is for decoration where nothing sits on top: a 4px rule, a
 * glow, a gradient edge. `GAME_ACCENT_ON_WHITE` is the darkened variant used
 * wherever white text sits on the colour. Keeping them apart means a future
 * accent cannot quietly become unreadable by being used one row further down.
 */
export const GAME_ACCENT = {
    listen_write: '#E91E8C',
    arrange_word: '#7B3FA0',
    meaning_match: '#0284c7',
    complete_sentence: '#10b981',
    letter_reveal: '#f59e0b',
    domain_flash: '#8b5cf6',
};

/**
 * The same accents, darkened until white text on them clears 4.5:1.
 *
 * Computed against #ffffff with the WCAG relative-luminance formula, not
 * estimated:
 *
 *   #A8105F  7.23:1     #6A3490  8.38:1     #01558F  7.79:1
 *   #05704E  6.12:1     #8A5A00  5.93:1     #6D3BD4  6.51:1
 *
 * All clear AA for normal text, so they are safe at any size a label uses.
 */
export const GAME_ACCENT_ON_WHITE = {
    listen_write: '#A8105F',
    arrange_word: '#6A3490',
    meaning_match: '#01558F',
    complete_sentence: '#05704E',
    letter_reveal: '#8A5A00',
    domain_flash: '#6D3BD4',
};

/** The accent for a game, for DECORATION. Defaults to the family magenta. */
export function accentFor(gameId) {
    return GAME_ACCENT[gameId] ?? COLOR.magenta;
}

/**
 * The accent for a game WHERE WHITE TEXT SITS ON IT.
 *
 * Use this and not `accentFor` for any filled button, badge or card that
 * carries a label — see the note on the two maps above.
 */
export function accentOnWhiteFor(gameId) {
    return GAME_ACCENT_ON_WHITE[gameId] ?? '#A8105F';
}
