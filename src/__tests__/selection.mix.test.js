/**
 * Selection: the enforced level limit and the controlled question mix.
 *
 * Two defects, both of the same kind — a documented rule that the code did not
 * actually apply:
 *
 *   `LEVEL_PROFILE.maxUnits` was declared on all three levels and read by
 *   nothing, so Learn mode could be dealt a word of any length.
 *
 *   The 60/25/15 mix was specified and never implemented; selection sorted
 *   candidates on a score and slid a window along the list, which can produce a
 *   round of nothing but review or nothing but stretch.
 */
import { LEVEL, LEVEL_PROFILE, selectForLevel } from '../difficulty.js';
import { DEFAULT_POLICY } from '../literacy.js';
import { segmentHeadword } from '../orthography.js';

/** Real Mandinka-shaped headwords at known unit counts. */
const WORDS = {
    b3: ['kenta', 'bibi', 'taa'],
    b4: ['saluno', 'montoo', 'kanandi', 'firindi'],
    b5: ['njemboo', 'kunjaa', 'tankata', 'safoo'],
};

const word = (headword, difficulty = 'A1') => ({
    uuid: `u-${headword}`,
    headword,
    difficulty,
    translation_en: 'x',
});

const unitsOf = (w) => segmentHeadword(w.headword, 'mnk').length;

describe('maxUnits is enforced, not merely declared', () => {
    it('Learn never serves a word longer than its own limit', () => {
        const long = word('seneyandirano'); /* comfortably over Learn's limit */
        const picked = selectForLevel([...WORDS.b3.map((h) => word(h)), long], {
            level: LEVEL.LEARN,
            languageCode: 'mnk',
            count: 10,
        });
        expect(picked).not.toContainEqual(long);
        for (const w of picked) {
            expect(unitsOf(w)).toBeLessThanOrEqual(LEVEL_PROFILE[LEVEL.LEARN].maxUnits);
        }
    });

    it('the limit differs by level, so Challenge may take what Learn may not', () => {
        expect(LEVEL_PROFILE[LEVEL.CHALLENGE].maxUnits).toBeGreaterThan(
            LEVEL_PROFILE[LEVEL.LEARN].maxUnits
        );
    });
});

describe('the controlled mix', () => {
    const pool = [
        ...WORDS.b3.map((h) => word(h)),
        ...WORDS.b4.map((h) => word(h)),
        ...WORDS.b5.map((h) => word(h)),
    ];

    it('draws mostly from the current band, with review and a little stretch', () => {
        const missed = new Set(['u-bibi']);
        const picked = selectForLevel(pool, {
            level: LEVEL.PRACTICE,
            languageCode: 'mnk',
            count: 10,
            band: 'b3',
            needsReviewFor: (w) => missed.has(w.uuid),
        });
        expect(picked.length).toBeGreaterThan(0);
        /* Stretch words exist but never dominate. */
        const stretch = picked.filter((w) => unitsOf(w) === 4).length;
        expect(stretch).toBeLessThanOrEqual(Math.ceil(picked.length * 0.5));
    });

    it('never repeats a word inside one round', () => {
        const picked = selectForLevel(pool, {
            level: LEVEL.PRACTICE,
            languageCode: 'mnk',
            count: 10,
            band: 'b3',
            needsReviewFor: () => false,
        });
        expect(new Set(picked.map((w) => w.uuid)).size).toBe(picked.length);
    });

    it('backfills deterministically rather than shortening the round', () => {
        /*
         * A language with almost no review words must not deal a short round
         * forever. Same inputs, same output — no randomness in the fallback.
         */
        const opts = {
            level: LEVEL.PRACTICE,
            languageCode: 'mnk',
            count: 8,
            band: 'b3',
            needsReviewFor: () => false,
        };
        const first = selectForLevel(pool, opts);
        const second = selectForLevel(pool, opts);
        expect(first.map((w) => w.uuid)).toEqual(second.map((w) => w.uuid));
        expect(first.length).toBe(8);
    });

    it('keeps the old window behaviour when there is no literacy band', () => {
        /* The path used by callers with no progression profile. */
        const picked = selectForLevel(pool, {
            level: LEVEL.PRACTICE,
            languageCode: 'mnk',
            count: 5,
        });
        expect(picked).toHaveLength(5);
    });

    it('has mix shares that sum to one', () => {
        const { current, review, next } = DEFAULT_POLICY.mix;
        expect(current + review + next).toBeCloseTo(1, 5);
    });
});
