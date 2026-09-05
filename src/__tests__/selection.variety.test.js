/**
 * Variety inside the bands — and the progression it must never break.
 *
 * The three-pool mix decided WHICH words a learner may be served and was silent
 * about which of them a given round draws, so `take()` walked each pool from
 * the front of a deterministic sort: same corpus, same band, same words every
 * session. A learner met one fixed pack forever, which is indistinguishable
 * from the system being broken and directly undermines the review pool — if
 * everything repeats, deliberate repetition means nothing.
 *
 * These tests hold both halves at once: rounds must vary, and variation must
 * never reach past the learner's unlocked ceiling or loosen an eligibility
 * rule. Every relaxation available here is to the RECENT MEMORY, never to
 * approval, domain, playability, skill, orthographic units or difficulty.
 */
import { LEVEL, selectForLevel } from '../difficulty.js';
import { DEFAULT_POLICY, UNIT_BANDS, bandForWord } from '../literacy.js';
import { segmentHeadword } from '../orthography.js';
import { RECENT_LIMIT, emptyRecent, excludedIds, remember, shuffle } from '../recent.js';

/*
 * Real Mandinka-shaped headwords, grouped by their MEASURED orthographic-unit
 * count — not by assumption.
 *
 * The first draft of this fixture grouped words by eyeballing them and was
 * wrong about every band: `kenta` segments to five units, not three, and `taa`
 * to two, which is below the spellable floor entirely. Tests built on that
 * premise asserted things the selector was never asked to do. The guard test
 * below re-measures every entry, so a fixture that drifts from the segmenter
 * fails loudly instead of quietly testing fiction.
 *
 * `ŋ` is a real letter in the Peace Corps Mandinka orthography and the reason
 * the three-unit band has members at all.
 */
const CORPUS = {
    b3: ['faŋ', 'saŋ', 'maŋ', 'baŋ', 'kaŋ', 'taŋ', 'jaŋ'],
    b4: ['musu', 'bara', 'tala', 'sika', 'sanjaa', 'bunjaa', 'kunjaa', 'karoo'],
    b5: ['kenta', 'montoo', 'njemboo'],
};

const word = (headword, difficulty = 'A1') => ({
    uuid: `u-${headword}`,
    headword,
    difficulty,
    translation_en: 'x',
});

const pool = [
    ...CORPUS.b3.map((w) => word(w)),
    ...CORPUS.b4.map((w) => word(w, 'A2')),
    ...CORPUS.b5.map((w) => word(w, 'B1')),
];

const unitsOf = (w) => segmentHeadword(w.headword, 'mnk').length;

/** The unit count each fixture group claims to hold. */
const EXPECTED_UNITS = { b3: 3, b4: 4, b5: 5 };
const base = { level: LEVEL.PRACTICE, languageCode: 'mnk', needsReviewFor: () => false };

describe('the fixture matches the segmenter', () => {
    /*
     * This guard is not ceremony. Every assertion below about premature hard
     * words and unlocked ceilings is meaningless if the fixture's band labels
     * are wrong, and the first draft's were — all of them. Measuring here means
     * a wrong fixture fails on its own terms rather than corrupting six other
     * tests silently.
     */
    it.each(Object.keys(EXPECTED_UNITS))('every %s word really is that many units', (group) => {
        for (const headword of CORPUS[group]) {
            expect(segmentHeadword(headword, 'mnk').length).toBe(EXPECTED_UNITS[group]);
        }
    });

    it('puts each word in the literacy band its unit count implies', () => {
        for (const [group, headwords] of Object.entries(CORPUS)) {
            for (const headword of headwords) {
                expect(bandForWord({ headword }, 'mnk')?.id).toBe(group);
            }
        }
    });
});

describe('progression is preserved', () => {
    it('starts a new speller on 3-unit words and never serves above the unlocked band', () => {
        /*
         * A learner at b3 has not unlocked 4-unit words as their CURRENT work.
         * The 15% stretch pool may reach one band up by design — that is the
         * "slightly beyond" the pedagogy asks for — but nothing may come from
         * two bands up, however the shuffle falls.
         */
        for (let run = 0; run < 60; run += 1) {
            const picked = selectForLevel(pool, { ...base, count: 10, band: 'b3' });
            const maxUnits = Math.max(...picked.map(unitsOf));
            expect(maxUnits).toBeLessThanOrEqual(4);
            expect(picked.every((w) => unitsOf(w) >= 3)).toBe(true);
        }
    });

    it('opens 4-unit work only once the learner is at b4, and 5-unit only at b5', () => {
        /* The ceiling moves with the band and never ahead of it. */
        const ceilingAt = (band) => {
            const seen = new Set();
            for (let run = 0; run < 60; run += 1) {
                for (const w of selectForLevel(pool, { ...base, count: 10, band })) {
                    seen.add(unitsOf(w));
                }
            }
            return Math.max(...seen);
        };
        expect(ceilingAt('b3')).toBeLessThanOrEqual(4);
        expect(ceilingAt('b4')).toBeLessThanOrEqual(5);
        expect(ceilingAt('b3')).toBeLessThan(ceilingAt('b5'));
    });

    it('never serves a premature hard word: b3 sees no 5-unit word in many rounds', () => {
        /*
         * The failure this guards is the one a learner actually feels — being
         * handed a word two bands past what they have mastered. Run it enough
         * times that a shuffle bug would surface rather than hide.
         */
        for (let run = 0; run < 200; run += 1) {
            const picked = selectForLevel(pool, { ...base, count: 10, band: 'b3' });
            expect(picked.some((w) => unitsOf(w) >= 5)).toBe(false);
        }
    });
});

describe('sessions vary', () => {
    it('draws a different set for each new game or round', () => {
        /*
         * The defect verbatim: the system returned the same fixed pack. Ten
         * consecutive rounds, each remembering what it served, must not all be
         * the same round.
         */
        let recent = emptyRecent();
        const signatures = new Set();
        for (let round = 0; round < 10; round += 1) {
            const picked = selectForLevel(pool, { ...base, count: 6, band: 'b3', recent });
            signatures.add(picked.map((w) => w.uuid).join('|'));
            recent = remember(
                recent,
                picked.map((w) => w.uuid)
            );
        }
        expect(signatures.size).toBeGreaterThan(1);
    });

    it('avoids recently served words while the corpus can afford it', () => {
        /*
         * b3 holds ten words and a round of four leaves six unseen, so a
         * following round has no reason to repeat.
         */
        const first = selectForLevel(pool, { ...base, count: 4, band: 'b3' });
        const recent = remember(
            emptyRecent(),
            first.map((w) => w.uuid)
        );
        const second = selectForLevel(pool, { ...base, count: 4, band: 'b3', recent });
        const overlap = second.filter((w) => first.some((f) => f.uuid === w.uuid));
        expect(overlap).toHaveLength(0);
    });

    it('spreads selection across the pool rather than favouring the sort head', () => {
        /*
         * The old behaviour served the same few words because it always took
         * the front of a sorted list. Over many rounds every eligible b3 word
         * should appear at least once.
         */
        const seen = new Set();
        for (let run = 0; run < 200; run += 1) {
            for (const w of selectForLevel(pool, { ...base, count: 4, band: 'b3' })) {
                if (unitsOf(w) === 3) seen.add(w.uuid);
            }
        }
        const b3Eligible = pool.filter((w) => unitsOf(w) === 3);
        expect(seen.size).toBe(b3Eligible.length);
    });
});

describe('review is intentional, not accidental', () => {
    it('repeats a word because the review pool chose it, not because selection stalled', () => {
        /*
         * With a review predicate in play the mastered word must come back on
         * purpose. That is the ONLY sanctioned repetition while the corpus is
         * large enough to avoid accidental ones.
         */
        const reviewed = 'u-faŋ';
        const picked = selectForLevel(pool, {
            ...base,
            count: 8,
            band: 'b3',
            needsReviewFor: (w) => w.uuid === reviewed,
            policy: DEFAULT_POLICY,
        });
        expect(picked.some((w) => w.uuid === reviewed)).toBe(true);
    });
});

describe('small corpora degrade safely', () => {
    it('still fills the round when everything eligible was served recently', () => {
        /*
         * Three eligible words, a round of three, and all three already in
         * recent memory. The round must not shorten and must not reach past
         * the band for filler — the memory gives way, the rules do not.
         */
        const tiny = CORPUS.b3.slice(0, 3).map((w) => word(w));
        const recent = remember(
            emptyRecent(),
            tiny.map((w) => w.uuid)
        );
        const picked = selectForLevel(tiny, { ...base, count: 3, band: 'b3', recent });
        expect(picked).toHaveLength(3);
        expect(picked.every((w) => unitsOf(w) === 3)).toBe(true);
    });

    it('releases the oldest memory first, so the just-seen word returns last', () => {
        const recent = remember(emptyRecent(), ['oldest', 'middle', 'newest']);
        const afterOne = excludedIds(recent, 1);
        expect(afterOne.has('oldest')).toBe(false);
        expect(afterOne.has('newest')).toBe(true);
    });
});

describe('what is remembered', () => {
    it('stores bounded entry ids and no dictionary content', () => {
        let recent = emptyRecent();
        for (const w of pool) recent = remember(recent, [w.uuid]);
        for (let i = 0; i < RECENT_LIMIT * 2; i += 1) recent = remember(recent, [`filler-${i}`]);

        expect(recent.ids.length).toBeLessThanOrEqual(RECENT_LIMIT);
        expect(Object.keys(recent)).toEqual(['ids']);
        expect(recent.ids.every((id) => typeof id === 'string')).toBe(true);

        /* No headword, gloss or rights field can have reached the record. */
        const serialized = JSON.stringify(recent);
        for (const w of pool) {
            expect(serialized).not.toContain(w.headword);
            expect(serialized).not.toContain(w.translation_en);
        }
    });

    it('moves a re-served id to the newest end instead of duplicating it', () => {
        const recent = remember(remember(emptyRecent(), ['a', 'b']), ['a']);
        expect(recent.ids).toEqual(['b', 'a']);
    });
});

describe('the shuffle is unbiased', () => {
    it('does not use a random sort comparator', () => {
        /*
         * `arr.sort(() => Math.random() - 0.5)` is the common idiom and it is
         * not uniform — its bias depends on the engine's sort. For a literacy
         * tool that silently serves some approved words far less often than
         * others, which is a fairness problem rather than a cosmetic one.
         *
         * Six slots, 12000 trials: a uniform shuffle puts each item in each
         * slot about 2000 times. Tolerance is wide enough not to flake and
         * narrow enough to catch the sort idiom, which skews badly.
         */
        const counts = new Array(6).fill(0);
        for (let t = 0; t < 12000; t += 1) {
            counts[shuffle(['a', 'b', 'c', 'd', 'e', 'f']).indexOf('a')] += 1;
        }
        for (const c of counts) {
            expect(c).toBeGreaterThan(1600);
            expect(c).toBeLessThan(2400);
        }
    });

    it('is a permutation — it loses and invents nothing', () => {
        const items = UNIT_BANDS.map((b) => b.id);
        expect(shuffle(items).sort()).toEqual([...items].sort());
    });
});
