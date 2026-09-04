/**
 * Orthography tests for low-resource languages.
 *
 * These are written against MEASURED properties of the approved Mandinka data
 * (`scripts/analyze-orthography.mjs`, n=488), not against a recollection of
 * what the language looks like. Where a test encodes a linguistic claim, the
 * comment says so and says whose claim it is to confirm.
 */

import {
    MNK_LONG_VOWELS,
    SPELLABLE_UNIT_RANGE,
    isSpellable,
    keysFor,
    normalize,
    partitionSpellable,
    profileFor,
    segmentHeadword,
    segmentUnits,
    unspellableReason,
} from '../orthography.js';

describe('normalisation', () => {
    it('returns NFC', () => {
        /* a + COMBINING RING ABOVE composes to U+00E5 under NFC. */
        expect(normalize('å')).toBe('å');
        expect(normalize('å')).toBe('å');
    });

    it('never applies a compatibility fold', () => {
        /*
         * The platform invariant: NFC, never NFKC/NFKD. U+FB01 LATIN SMALL
         * LIGATURE FI survives NFC and would become "fi" under NFKC. If this
         * ever fails, someone has swapped the normalisation form and African
         * orthographic distinctions are being destroyed elsewhere too.
         */
        expect(normalize('ﬁ')).toBe('ﬁ');
        expect(normalize('ﬁ')).not.toBe('fi');
    });

    it('is defensive about non-strings', () => {
        expect(normalize(undefined)).toBe('');
        expect(normalize(null)).toBe('');
        expect(normalize(42)).toBe('');
    });
});

describe('segmentation of real Mandinka headwords', () => {
    it('keeps a long vowel as one unit', () => {
        /* `oo` is in 34.8% of sampled headwords. Seven characters is the wrong
         * reading of this word; five units is the right one. */
        expect(segmentHeadword('njemboo', 'mnk')).toEqual(['nj', 'e', 'm', 'b', 'oo']);
    });

    it('keeps every long vowel in a word with more than one', () => {
        expect(segmentHeadword('musukeebaa', 'mnk')).toEqual([
            'm',
            'u',
            's',
            'u',
            'k',
            'ee',
            'b',
            'aa',
        ]);
    });

    it.each(MNK_LONG_VOWELS)('treats %s as a single unit', (vowel) => {
        expect(segmentHeadword(`k${vowel}n`, 'mnk')).toEqual(['k', vowel, 'n']);
    });

    it('never splits a recognised multi-character unit', () => {
        /* The requirement stated as a test: for every attested unit, no
         * segmentation of a word containing it may contain its parts alone. */
        for (const unit of profileFor('mnk').units) {
            const units = segmentHeadword(`ba${unit}ba`, 'mnk');
            expect(units).toContain(unit);
            expect(units.join('')).toBe(`ba${unit}ba`);
        }
    });

    it('round-trips: joining the units reproduces the word', () => {
        const words = ['njemboo', 'musukeebaa', 'seneyandirano', 'jamaani-labano', 'kenta', 'taa'];
        for (const w of words) {
            expect(segmentHeadword(w, 'mnk').join('')).toBe(w);
        }
    });

    it('iterates code points, not UTF-16 code units', () => {
        /* `split('')` would cut this surrogate pair into two lone surrogates. */
        const astral = '\u{1f600}';
        expect(segmentUnits(astral)).toEqual([astral]);
        expect(segmentUnits(astral)).toHaveLength(1);
    });

    it('falls back to plain code points for an unconfigured language', () => {
        expect(segmentHeadword('oo', 'zzz')).toEqual(['o', 'o']);
    });
});

describe('the letter keys a game offers', () => {
    it('excludes letters the corpus does not use', () => {
        /* Measured: `v`, `x`, `z` never occur; `q` 0.10% and `g` 0.03% are at
         * or below the paper's 0.2% elimination threshold. */
        const keys = keysFor('kenta', 'mnk');
        for (const absent of ['v', 'x', 'z']) expect(keys).not.toContain(absent);
    });

    it('excludes the six characters that were hardcoded but never occur', () => {
        /*
         * The regression this repository actually had. `MANDINKA_CHARS` was
         * `['ŋ','ɓ','ɗ','ñ','ɲ','ʔ']` and not one of them appears in the
         * spellings of 488 sampled entries, so as an unconditional key row
         * they were six keys that could never be pressed correctly.
         *
         * Not a claim that the letters are fake — `ŋ` and `ñ` are Peace Corps
         * orthography. The claim is only that they are absent from the data
         * the games check answers against. The next test is the other half.
         */
        const keys = keysFor('kenta', 'mnk');
        for (const absent of ['ŋ', 'ɓ', 'ɗ', 'ñ', 'ɲ', 'ʔ']) {
            expect(keys).not.toContain(absent);
        }
    });

    it('gives a headword its own letters even when the base row lacks them', () => {
        /*
         * What makes the above safe if the approved data is later supplied in
         * Peace Corps spelling: keys follow the headword. No equivalence rule,
         * no rewriting — the word is spelled however the Dictionary spells it,
         * and the keyboard is built from that.
         */
        expect(keysFor('taŋkata', 'mnk')).toContain('ŋ');
        expect(keysFor('kalantañaa', 'mnk')).toContain('ñ');
    });

    it('offers the long vowels as their own keys', () => {
        const keys = keysFor('njemboo', 'mnk');
        for (const vowel of MNK_LONG_VOWELS) expect(keys).toContain(vowel);
    });

    it('always offers every unit the answer needs — no unwinnable round', () => {
        /*
         * Trap prevention, as an invariant rather than an example: whatever the
         * word, every unit of it is tappable. A game that withholds a needed
         * key is unwinnable, and that is the failure this whole change exists
         * to remove.
         */
        const words = ['njemboo', 'seneyandirano', 'jamaani-labano', 'Qaajita', 'cuuraayi-dandino'];
        for (const w of words) {
            const keys = keysFor(w, 'mnk');
            for (const unit of segmentHeadword(w.toLowerCase(), 'mnk')) {
                expect(keys).toContain(unit);
            }
        }
    });
});

describe('trap prevention: which headwords may be dealt as a spelling round', () => {
    it('rejects the unspellable shapes the corpus really contains', () => {
        /* Every one of these is a real sampled headword. */
        expect(unspellableReason('0', 'mnk')).toBe('contains-digits');
        expect(unspellableReason('00jo0', 'mnk')).toBe('contains-digits');
        expect(unspellableReason('toolee. - 126-', 'mnk')).toBe('contains-digits');
        expect(unspellableReason('suno tey', 'mnk')).toBe('contains-whitespace');
    });

    it('rejects a word too long to build or to scramble on a phone', () => {
        /* `seneyandirano` is 13 units; the coverage analysis shows a fixed tile
         * set builds 0% of words that long. */
        expect(unspellableReason('seneyandirano', 'mnk')).toBe('too-long');
    });

    it('rejects a word too short to be a spelling task', () => {
        expect(unspellableReason('a', 'mnk')).toBe('too-short');
        /* `taa` is three characters but only two units (`t` + `aa`) — which is
         * exactly why the bound is in units and not in characters. */
        expect(segmentHeadword('taa', 'mnk')).toHaveLength(2);
        expect(unspellableReason('taa', 'mnk')).toBe('too-short');
    });

    it('accepts a hyphenated compound, which is a real headword', () => {
        expect(unspellableReason('jamaani-labano', 'mnk')).not.toBe('contains-punctuation');
        expect(isSpellable('kenta', 'mnk')).toBe(true);
    });

    it('rejects a bare fragment', () => {
        expect(unspellableReason('-labano', 'mnk')).toBe('edge-hyphen');
    });

    it('keeps both halves when partitioning a deck, so a caller can report', () => {
        const deck = [
            { uuid: '1', headword: 'kenta' },
            { uuid: '2', headword: '00jo0' },
            { uuid: '3', headword: 'njemboo' },
            { uuid: '4', headword: 'suno tey' },
        ];
        const { spellable, rejected } = partitionSpellable(deck, 'mnk');
        expect(spellable.map((w) => w.uuid)).toEqual(['1', '3']);
        expect(rejected.map((r) => r.reason)).toEqual(['contains-digits', 'contains-whitespace']);
    });

    it("accepts the BFF's own field name as well as the adapter's", () => {
        const { spellable } = partitionSpellable([{ header_word: 'kenta' }], 'mnk');
        expect(spellable).toHaveLength(1);
    });

    it('survives an empty or malformed deck', () => {
        expect(partitionSpellable(undefined, 'mnk').spellable).toEqual([]);
        expect(partitionSpellable([{}], 'mnk').rejected[0].reason).toBe('empty');
    });

    it('states its own bounds coherently', () => {
        expect(SPELLABLE_UNIT_RANGE.min).toBeLessThan(SPELLABLE_UNIT_RANGE.max);
        expect(SPELLABLE_UNIT_RANGE.min).toBeGreaterThanOrEqual(2);
    });
});
