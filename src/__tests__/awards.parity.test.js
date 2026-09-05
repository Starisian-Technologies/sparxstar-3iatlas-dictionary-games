/**
 * AWARDS ARE NOT COMPLETE, AND THIS FILE IS WHAT STOPS ANYONE SAYING THEY ARE.
 *
 * The instruction was: confirm the catalogue matches the server's canonical
 * manifest exactly, do not maintain two independently editable catalogues, and
 * if the server does not yet carry these fields, flag the schema work as
 * BLOCKED rather than declaring awards done.
 *
 * It does not carry them. The engine's manifests
 * (`sparxstar-3iatlas-rlc-node-engine/src/games/manifests.ts`) hold seven star
 * KINDS with XP values — `most_words`, `best_spelling`, `discovery`, `speed`,
 * `audio`, `teacher`, `teacher_award` — and no award id, no display name, no
 * criterion and no gold amount anywhere. `contract.ts` says why: "Star/badge
 * kinds and subject_type 'device' are reserved for later phases."
 *
 * So these tests assert the BLOCKED state itself. If someone later flips
 * `SERVER_PARITY.inParity` to true without the schema landing, they fail — the
 * point being that a claim of parity has to survive a test rather than a
 * paragraph.
 */
import {
    AWARDS,
    CATALOGUE_SOURCE,
    GOLD_STATUS,
    SERVER_PARITY,
    SOLO_ELIGIBLE,
    earnedBadges,
} from '../awards.js';

describe('the catalogue records where it came from', () => {
    it('names the mockups it was transcribed from, and when', () => {
        expect(CATALOGUE_SOURCE.repo).toBe('sparxstar-3iatlas-rlc-ui');
        expect(CATALOGUE_SOURCE.files.join(' ')).toContain('RLC-awards.png');
        expect(CATALOGUE_SOURCE.readOn).toBe('2026-09-05');
    });

    it('is versioned, and the version says display-only', () => {
        expect(CATALOGUE_SOURCE.version).toContain('display');
        expect(CATALOGUE_SOURCE.displayOnly).toBe(true);
    });
});

describe('parity with the server is BLOCKED, not achieved', () => {
    it('says so, in a constant a reviewer can grep', () => {
        expect(SERVER_PARITY.inParity).toBe(false);
    });

    it('names what it is blocked on', () => {
        expect(SERVER_PARITY.blockedOn.length).toBeGreaterThan(0);
        expect(SERVER_PARITY.blockedOn.join(' ')).toMatch(/award id/i);
        expect(SERVER_PARITY.blockedOn.join(' ')).toMatch(/gold/i);
    });

    it('shows the vocabularies really are different', () => {
        /*
         * Not a rhetorical claim. NONE of the engine's star kinds is an award
         * id in this catalogue, which is why "make them match" is schema work
         * and not a rename.
         */
        const ids = AWARDS.map((a) => a.id);
        for (const kind of SERVER_PARITY.serverStarKinds) {
            expect(ids).not.toContain(kind);
        }
    });

    it('is not silently satisfiable by editing this file alone', () => {
        /*
         * The catalogue cannot make itself authoritative. Every award still
         * needs a server counterpart that does not exist, so a future edit
         * that flips `inParity` without the engine changing leaves this
         * failing — which is the intent.
         */
        if (SERVER_PARITY.inParity) {
            throw new Error(
                'inParity was set true — the engine must first carry award ids, ' +
                    'display fields and gold amounts, and a settlement response ' +
                    'must return earned ids. Update this test with that evidence.'
            );
        }
        expect(SERVER_PARITY.inParity).toBe(false);
    });
});

describe('Gold is display-only and blocked', () => {
    it('says so', () => {
        expect(GOLD_STATUS.displayOnly).toBe(true);
        expect(GOLD_STATUS.blockedOn).toEqual(
            expect.arrayContaining(['earning rules', 'spending rules'])
        );
    });

    it('is never earned, spent or totalled by this client', () => {
        /* Gold appears as a NUMBER ON A CARD and nowhere else. */
        // eslint-disable-next-line global-require
        const mod = require('../awards.js');
        const fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
        expect(fns.join(' ')).not.toMatch(/gold/i);
    });
});

describe('placement and community awards stay impossible in solo play', () => {
    it('excludes every award that needs other players', () => {
        const solo = SOLO_ELIGIBLE.map((a) => a.id);
        for (const id of [
            'crown_star',
            'silver_wave',
            'bronze_flame',
            'community_voice',
            'golden_voice',
            'helping_hand',
        ]) {
            expect(solo).not.toContain(id);
        }
    });

    it('would still not RENDER one unless the engine settled it', () => {
        /*
         * The belt-and-braces case. Even if a solo-equivalent were defined
         * server-side tomorrow, nothing changes here: this client renders what
         * it is handed. `SOLO_ELIGIBLE` documents feasibility; it does not gate
         * display, because gating display would be a client deciding.
         */
        expect(earnedBadges([])).toEqual([]);
        expect(earnedBadges(['crown_star'])).toHaveLength(1);
    });
});
