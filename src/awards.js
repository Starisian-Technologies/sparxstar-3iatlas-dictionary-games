/**
 * The AIWA award catalogue and its visual system.
 *
 * ==========================================================================
 * THIS IS DISPLAY METADATA. IT AWARDS NOTHING. IT IS NOT YET IN PARITY.
 *
 * Every entry here is how an award LOOKS and what it is called. Whether a
 * player has earned one is decided server-side and arrives as settled data —
 * this module cannot grant, compute or infer an award, and no caller may use
 * it to. RLC spec v4.0 §1.6, as corrected: a client "may render settled
 * results and must never invent an award."
 *
 * SOURCE AND VERSION
 *
 *   Transcribed from : sparxstar-3iatlas-rlc-ui/.github/instructions/
 *                      RLC-awards.png and RLC-awards-2.png
 *   Read on          : 2026-09-05
 *   Catalogue version: 0.1.0-display  (display-only; NOT a settlement contract)
 *
 * ==========================================================================
 * PARITY WITH THE SERVER: **BLOCKED**. Do not read this file as complete.
 *
 * The instruction is that one catalogue must be authoritative and this client
 * must not maintain a rival. Agreed — and today there is nothing to be in
 * parity WITH. The engine's manifests
 * (`sparxstar-3iatlas-rlc-node-engine/src/games/manifests.ts`) carry a
 * different vocabulary entirely:
 *
 *   server star kinds : most_words / most_sentences, best_spelling, discovery,
 *                       speed, audio, teacher, teacher_award   (7, with XP)
 *   this catalogue    : ten NAMED BADGES with criteria, gold and star counts
 *
 * Only three overlap even conceptually — discovery ≈ Rare Word Discovery,
 * audio ≈ Golden Voice, speed ≈ Lightning Linguist — and none shares an id, a
 * name, a criterion or a gold value. The server has NO award id, NO display
 * name, NO criterion text and NO gold amount anywhere.
 *
 * `sparxstar-3iatlas-rlc-node-engine/src/contract.ts` states the position
 * outright: "Star/badge kinds and subject_type 'device' are **reserved for
 * later phases**."
 *
 * SO THE SCHEMA WORK IS BLOCKED, and awards are NOT complete. What is needed,
 * server-side, before this file can claim parity:
 *
 *   1. An award id vocabulary shared by engine and clients.
 *   2. Display name, criterion and category per award — or an explicit ruling
 *      that display strings stay client-side and only ids cross the wire,
 *      which would make this file the display half of one catalogue rather
 *      than a rival to it. That is the cheaper answer and the one to prefer.
 *   3. Gold amounts, if Gold applies at all — see below.
 *   4. A settlement response shape that carries earned award ids.
 *
 * Until then this renders nothing, because nothing settles. That is the honest
 * state and it is what `awards.parity.test.js` asserts: if someone later
 * declares parity without the schema, that test fails.
 *
 * GOLD IS BLOCKED TOO. `contract.ts` has `total_gold` and `lifetime_gold`, so
 * a balance concept exists, but no manifest carries a gold amount and no rule
 * anywhere says how Gold is earned or spent. The values below are transcribed
 * from the mockups FOR DISPLAY and must not be treated as earning rules.
 * ==========================================================================
 *
 * WHAT THE MOCKUPS ARE, AND ARE NOT
 *
 * They are RLC CLASSROOM mockups: a multiplayer capture session with a game
 * code, a teacher console and a live leaderboard. Dictionary Games is
 * single-player. The catalogue is shared so the two products look like one
 * platform — the owner's instruction — and `SOLO_ELIGIBLE` records which
 * awards can actually occur without other players present.
 */

/** Category colours, taken from the mockups. */
export const CATEGORY = {
    PLACEMENT: 'placement',
    DISCOVERY: 'discovery',
    CULTURAL: 'cultural',
    COMMUNITY: 'community',
    AUDIO: 'audio',
    PERFORMANCE: 'performance',
    ACCURACY: 'accuracy',
    TEAMWORK: 'teamwork',
};

/**
 * The AIWA visual system: near-black ground, neon line-art, one accent colour
 * per award carried through its icon, name and card edge.
 */
export const AWARD_STYLE = {
    ground: '#0A0A0F',
    card: '#12121A',
    cardBorder: 'rgba(255,255,255,0.06)',
    heading: '#F5F5FA',
    muted: '#8A8A9E',
    earned: '#E91E8C',
    gold: '#F5B825',
    star: '#FFC93C',
};

/**
 * The catalogue, transcribed from the approved mockups.
 *
 * `solo` marks whether the award can occur in a single-player game at all.
 * The three placement awards are ranks within a live session — there is no
 * second place when nobody else is playing — so they are `false`. That is a
 * statement of fact about the mechanic, not a policy choice; the platform
 * still owns whether Dictionary Games grants any of these.
 */
export const AWARDS = [
    {
        id: 'crown_star',
        name: 'Crown Star',
        category: CATEGORY.PLACEMENT,
        criterion: 'Awarded to the top scorer of the session.',
        short: 'Session Champion',
        gold: 500,
        stars: 2,
        colour: '#FF2D78',
        solo: false,
    },
    {
        id: 'silver_wave',
        name: 'Silver Wave',
        category: CATEGORY.PLACEMENT,
        criterion: 'Awarded to the second highest scorer.',
        short: 'Second Place',
        gold: 300,
        stars: 1,
        colour: '#2D9CFF',
        solo: false,
    },
    {
        id: 'bronze_flame',
        name: 'Bronze Flame',
        category: CATEGORY.PLACEMENT,
        criterion: 'Awarded to the third highest scorer.',
        short: 'Third Place',
        gold: 200,
        stars: 1,
        colour: '#FF8A1F',
        solo: false,
    },
    {
        id: 'rare_word_discovery',
        name: 'Rare Word Discovery',
        category: CATEGORY.DISCOVERY,
        criterion: 'Found a word not in the dictionary.',
        short: 'Found a word not in dictionary',
        gold: 600,
        stars: 2,
        colour: '#B14BFF',
        solo: true,
    },
    {
        id: 'elder_knowledge',
        name: 'Elder Knowledge Award',
        category: CATEGORY.CULTURAL,
        criterion: 'Preserved cultural language and wisdom.',
        short: 'Preserved cultural language',
        gold: 400,
        stars: 2,
        colour: '#FFB627',
        solo: true,
    },
    {
        id: 'golden_voice',
        name: 'Golden Voice',
        category: CATEGORY.AUDIO,
        criterion: 'Most audio contributions with clear recordings.',
        short: 'Best audio contributions',
        gold: 300,
        stars: 1,
        colour: '#FFC02D',
        solo: false,
    },
    {
        id: 'community_voice',
        name: 'Community Voice',
        category: CATEGORY.COMMUNITY,
        criterion: 'Most trusted by peers in QC review.',
        short: 'Most trusted by peers',
        gold: 250,
        stars: 1,
        colour: '#3DA5FF',
        solo: false,
    },
    {
        id: 'lightning_linguist',
        name: 'Lightning Linguist',
        category: CATEGORY.PERFORMANCE,
        criterion: 'Fast, accurate, and consistent.',
        short: 'Fast & accurate',
        gold: 250,
        stars: 1,
        colour: '#C24BFF',
        solo: true,
    },
    {
        id: 'perfect_round',
        name: 'Perfect Round',
        category: CATEGORY.ACCURACY,
        criterion: '100% accuracy in a round.',
        short: '100% accuracy round',
        gold: 200,
        stars: 1,
        colour: '#3DFF7A',
        solo: true,
    },
    {
        id: 'helping_hand',
        name: 'Helping Hand',
        category: CATEGORY.TEAMWORK,
        criterion: 'Helped others and built a stronger team.',
        short: 'Helped others',
        gold: 150,
        stars: 1,
        colour: '#34E0D0',
        solo: false,
    },
];

/**
 * Where this catalogue came from and what it is for. Exported so a test can
 * assert it, and so nothing downstream mistakes it for a settlement contract.
 */
export const CATALOGUE_SOURCE = Object.freeze({
    repo: 'sparxstar-3iatlas-rlc-ui',
    files: ['.github/instructions/RLC-awards.png', '.github/instructions/RLC-awards-2.png'],
    readOn: '2026-09-05',
    version: '0.1.0-display',
    displayOnly: true,
});

/**
 * Parity with the server's canonical manifest.
 *
 * `false` until the engine carries an award id vocabulary, and deliberately a
 * constant rather than a comment: a reviewer can grep it, and a test fails if
 * it is flipped without the schema landing.
 */
export const SERVER_PARITY = Object.freeze({
    inParity: false,
    blockedOn: [
        'engine has no award id vocabulary',
        'engine has no display name, criterion or category per award',
        'engine has no gold amount in any manifest',
        'no settlement response shape carries earned award ids',
        "contract.ts: star/badge kinds are 'reserved for later phases'",
    ],
    /* The engine's star kinds today, for comparison. Not award ids. */
    serverStarKinds: [
        'most_words',
        'most_sentences',
        'best_spelling',
        'discovery',
        'speed',
        'audio',
        'teacher',
        'teacher_award',
    ],
});

/** Gold: display-only, and blocked. See the header. */
export const GOLD_STATUS = Object.freeze({
    displayOnly: true,
    blockedOn: ['ownership', 'balance rules', 'earning rules', 'spending rules'],
});

/** Awards that can occur at all without other players present. */
export const SOLO_ELIGIBLE = AWARDS.filter((a) => a.solo);

/** Look one up. Returns null rather than a placeholder for an unknown id. */
export function awardById(id) {
    return AWARDS.find((a) => a.id === id) ?? null;
}

/**
 * Turn the engine's settled award ids into things to render.
 *
 * Unknown ids are DROPPED, not rendered as a blank card: a catalogue that has
 * fallen behind the engine should show less, never something invented. And an
 * absent or malformed list is an empty array, because "no awards yet" and
 * "the field did not arrive" look the same to a player and neither is an
 * error worth showing them.
 */
export function earnedBadges(settled) {
    if (!Array.isArray(settled)) return [];
    return settled
        .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
        .map(awardById)
        .filter(Boolean);
}
