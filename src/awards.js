/**
 * The AIWA award catalogue and its visual system.
 *
 * ==========================================================================
 * THIS IS DISPLAY METADATA. IT AWARDS NOTHING.
 *
 * Every entry here is how an award LOOKS and what it is called. Whether a
 * player has earned one is decided server-side and arrives as settled data —
 * this module cannot grant, compute or infer an award, and no caller may use
 * it to. RLC spec v4.0 §1.6, as corrected: a client "may render settled
 * results and must never invent an award."
 *
 * `earnedBadges` therefore takes what the engine returned and looks each id up.
 * An id it does not recognise is skipped rather than guessed at.
 * ==========================================================================
 *
 * WHERE THIS COMES FROM
 *
 * `sparxstar-3iatlas-rlc-ui/.github/instructions/RLC-awards.png` and
 * `RLC-awards-2.png` — the approved mockups, read directly. Names, criteria,
 * gold and star values are transcribed from them, not invented.
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
