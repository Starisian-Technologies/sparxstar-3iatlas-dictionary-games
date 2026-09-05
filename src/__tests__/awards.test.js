/**
 * The award catalogue.
 *
 * The invariant that matters most is negative: THIS MODULE AWARDS NOTHING. It
 * is display metadata. Whether a player earned something is settled
 * server-side, per RLC spec v4.0 §1.6 as corrected — a client "may render
 * settled results and must never invent an award."
 *
 * Values are transcribed from the approved mockups
 * (`sparxstar-3iatlas-rlc-ui/.github/instructions/RLC-awards.png` and
 * `RLC-awards-2.png`), so these tests also pin the transcription: if someone
 * later edits a gold value here, they are editing what the design says.
 */
import { AWARDS, CATEGORY, SOLO_ELIGIBLE, awardById, earnedBadges } from '../awards.js';

describe('the catalogue matches the approved mockups', () => {
    it('carries all ten awards', () => {
        expect(AWARDS).toHaveLength(10);
    });

    it.each([
        ['crown_star', 500, 2],
        ['silver_wave', 300, 1],
        ['bronze_flame', 200, 1],
        ['rare_word_discovery', 600, 2],
        ['elder_knowledge', 400, 2],
        ['golden_voice', 300, 1],
        ['community_voice', 250, 1],
        ['lightning_linguist', 250, 1],
        ['perfect_round', 200, 1],
        ['helping_hand', 150, 1],
    ])('%s is worth %i gold and %i star(s)', (id, gold, stars) => {
        const award = awardById(id);
        expect(award).not.toBeNull();
        expect(award.gold).toBe(gold);
        expect(award.stars).toBe(stars);
    });

    it('gives every award a unique id and an accent colour', () => {
        const ids = AWARDS.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const a of AWARDS) expect(a.colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
});

describe('what a single player can actually earn', () => {
    it('excludes the three placement awards', () => {
        /*
         * Not a policy judgement — a fact about the mechanic. Crown Star,
         * Silver Wave and Bronze Flame are ranks within a live session, and
         * there is no second place when nobody else is playing.
         */
        const soloIds = SOLO_ELIGIBLE.map((a) => a.id);
        expect(soloIds).not.toContain('crown_star');
        expect(soloIds).not.toContain('silver_wave');
        expect(soloIds).not.toContain('bronze_flame');
    });

    it('excludes awards needing capabilities these games do not have', () => {
        /* Peer QC review, audio contribution volume, teamwork. */
        const soloIds = SOLO_ELIGIBLE.map((a) => a.id);
        expect(soloIds).not.toContain('community_voice');
        expect(soloIds).not.toContain('golden_voice');
        expect(soloIds).not.toContain('helping_hand');
    });

    it('keeps the ones that can occur alone', () => {
        expect(SOLO_ELIGIBLE.map((a) => a.id).sort()).toEqual(
            ['elder_knowledge', 'lightning_linguist', 'perfect_round', 'rare_word_discovery'].sort()
        );
    });

    it('marks every placement award as a placement', () => {
        for (const id of ['crown_star', 'silver_wave', 'bronze_flame']) {
            expect(awardById(id).category).toBe(CATEGORY.PLACEMENT);
        }
    });
});

describe('rendering only what the engine settled', () => {
    it('maps settled ids to catalogue entries', () => {
        expect(earnedBadges(['perfect_round']).map((a) => a.name)).toEqual(['Perfect Round']);
        expect(earnedBadges([{ id: 'elder_knowledge' }])).toHaveLength(1);
    });

    it('DROPS an id the catalogue does not know, rather than inventing one', () => {
        /*
         * A catalogue behind the engine should show LESS, never something made
         * up — and never a blank card, which reads to a player as a broken app.
         */
        expect(earnedBadges(['perfect_round', 'not_a_real_award'])).toHaveLength(1);
        expect(awardById('not_a_real_award')).toBeNull();
    });

    it('treats a missing or malformed list as no awards, not as an error', () => {
        for (const input of [null, undefined, 'perfect_round', 42, {}]) {
            expect(earnedBadges(input)).toEqual([]);
        }
    });

    it('exports no function that could decide an award was earned', () => {
        /*
         * The structural guard. If a future change adds something like
         * `computeAwards(session)` to this module, that is reward logic in the
         * client and this test should fail loudly rather than let it pass
         * review as a helper.
         */
        // eslint-disable-next-line global-require
        const mod = require('../awards.js');
        const fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
        expect(fns.sort()).toEqual(['awardById', 'earnedBadges']);
    });
});
