/**
 * Orthography-aware text handling for the games.
 *
 * =========================== WHY THIS EXISTS ===========================
 *
 * Two games split headwords with `String.prototype.split('')` and one shipped
 * a hardcoded `'abcdefghijklmnopqrstuvwxyz'` plus a hardcoded list of six
 * "Mandinka characters". Neither came from the corpus, and the corpus
 * disagrees with both.
 *
 * `scripts/analyze-orthography.mjs` measured 488 real entries from the approved
 * Mandinka data, and the numbers below are its output. Re-run it before
 * changing anything here; every value is reproducible and none is recalled.
 *
 * WHAT THE DATA SAID
 *
 *   - The six hardcoded characters `ŋ ɓ ɗ ñ ɲ ʔ` occur **zero** times. The
 *     special-character row they populate could never be a correct answer, so
 *     it was six buttons of noise on a phone-sized screen.
 *   - Long vowels dominate: `oo` appears in **34.8%** of headwords and `aa` in
 *     **29.6%**. `ee`, `uu`, `ii` follow. These are the orthography's units,
 *     and splitting `njemboo` into seven characters teaches the wrong thing
 *     about the word — it is `nj·e·m·b·oo`, five units.
 *   - `nj` (1.4%) and `ny` (0.6%) are attested; `ng`, `kh`, `ch`, `sh`, `gb`,
 *     `kp` are not, in this sample.
 *   - Every headword arrived already NFC-normalised, which is the platform's
 *     canonical form. This module normalises anyway rather than trusting it:
 *     NFC and never NFKC/NFKD, because a compatibility fold destroys
 *     distinctions African orthographies carry.
 *   - 1.0% of sampled headwords cannot be spelled at all — `0`, `00jo0`,
 *     `toolee. - 126-`, `suno tey`. Dealing one is a round the player cannot
 *     win, and `ArrangeWord` had no way out of a round.
 *
 * ========================= WHOSE DECISION IS WHAT =========================
 *
 * Which attested sequences count as single units IN PLAY is AIWA's call —
 * linguistic, orthographic and cultural authority is theirs, not this
 * repository's. What is encoded here is the measurement plus the smallest
 * defensible reading of it, marked so it can be corrected by the people whose
 * decision it is. `LONG_VOWELS` is the part this code is most confident about
 * and `DIGRAPHS` the part most in need of their review.
 */

/**
 * Long vowels, measured. Doubled vowels in this orthography are single units:
 * one long vowel, not two short ones in a row.
 *
 * Measured share of headwords containing each (n=483 playable):
 *   oo 34.8%   aa 29.6%   ee 10.8%   uu 6.0%   ii 5.8%
 */
export const MNK_LONG_VOWELS = ['aa', 'ee', 'ii', 'oo', 'uu'];

/**
 * Candidate consonant digraphs, attested but RARE — and this is the entry most
 * needing AIWA's review before it drives gameplay.
 *
 * `nj` occurs in 1.4% of headwords and `ny` in 0.6%. Both are plausibly single
 * consonants in Mandinka orthography. They are listed so segmentation does not
 * split them, and they are deliberately kept out of `TAPPABLE_UNITS` below
 * until that reading is confirmed: showing a learner an `nj` key asserts a
 * claim about the writing system, and that claim is not this code's to make.
 */
export const MNK_DIGRAPHS = ['nj', 'ny'];

/**
 * Segmentation units for Mandinka: everything that must not be split.
 * Longest-match-first, so `oo` wins over `o` and `nj` over `n`.
 */
export const MNK_UNITS = [...MNK_DIGRAPHS, ...MNK_LONG_VOWELS];

/**
 * The letters and units a player may tap.
 *
 * Base letters are the ones the corpus actually uses (measured), NOT `a`–`z`:
 * `q` (0.10%), `g` (0.03%) and `v`, `x`, `z` are at or below the 0.2%
 * elimination threshold Mattiev et al. apply, and three of them never occur at
 * all. A keyboard row of letters that cannot appear is a phone-sized tax on
 * every guess.
 *
 * The long vowels are included as their own keys, because they are units.
 */
export const MNK_BASE_LETTERS = [
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'h',
    'i',
    'j',
    'k',
    'l',
    'm',
    'n',
    'o',
    'p',
    'r',
    's',
    't',
    'u',
    'w',
    'y',
];

/** Per-language profiles. Unknown languages fall back to plain characters. */
const PROFILES = {
    mnk: {
        units: MNK_UNITS,
        baseLetters: MNK_BASE_LETTERS,
        tappableUnits: MNK_LONG_VOWELS,
    },
};

/** The profile for a language code, or a plain-character profile. */
export function profileFor(languageCode) {
    return (
        PROFILES[languageCode] ?? {
            units: [],
            baseLetters: [],
            tappableUnits: [],
        }
    );
}

/**
 * Canonical form for comparison and display.
 *
 * NFC, never NFKC/NFKD — that is a platform invariant, not a preference here.
 */
export function normalize(text) {
    return typeof text === 'string' ? text.normalize('NFC') : '';
}

/**
 * Split text into orthographic units, longest match first.
 *
 * Falls back to `Array.from` rather than `split('')` even with no units
 * configured: `split('')` divides by UTF-16 code unit, which cuts a surrogate
 * pair in half. `Array.from` iterates code points.
 */
export function segmentUnits(text, units = []) {
    const source = normalize(text);
    if (!source) return [];
    const ordered = [...units].sort((a, b) => b.length - a.length);
    const out = [];
    let i = 0;
    while (i < source.length) {
        const hit = ordered.find((u) => source.startsWith(u, i));
        if (hit) {
            out.push(hit);
            i += hit.length;
            continue;
        }
        const cp = String.fromCodePoint(source.codePointAt(i));
        out.push(cp);
        i += cp.length;
    }
    return out;
}

/** Segment a headword using its language's profile. */
export function segmentHeadword(headword, languageCode) {
    return segmentUnits(headword, profileFor(languageCode).units);
}

/**
 * The keys a letter game should offer for a language, given the word in play.
 *
 * The word's own units are always included — a game must never withhold a key
 * the answer needs, which is the other half of trap prevention. Anything the
 * word needs that the profile did not anticipate is surfaced rather than
 * dropped, so an orthography this module has not caught up with still plays.
 */
export function keysFor(headword, languageCode) {
    const profile = profileFor(languageCode);
    const needed = segmentHeadword(headword, languageCode).map((u) => u.toLowerCase());
    const base = profile.baseLetters.length
        ? [...profile.baseLetters, ...profile.tappableUnits]
        : [];
    const keys = [...base];
    for (const unit of needed) {
        if (!keys.includes(unit)) keys.push(unit);
    }
    return keys;
}

/* ── Trap prevention ────────────────────────────────────────────────────── */

/**
 * The shortest and longest words worth dealing as a SPELLING round.
 *
 * Both ends are trap prevention rather than taste. A one-unit headword is not a
 * spelling task — `ArrangeWord` deals a single tile and the player cannot get
 * it wrong. At the other end, `scripts/analyze-orthography.mjs` found sampled
 * headwords up to 17 units; a 17-tile scramble on a phone is not a game, and
 * the same script shows a fixed tile set covers 0% of words that long.
 *
 * 3–8 keeps 76% of the sampled corpus (n=483) and excludes both failure modes.
 * A recognition game (`MeaningMatch`, `DomainFlash`) has no such limit and does
 * not use this.
 */
export const SPELLABLE_UNIT_RANGE = { min: 3, max: 8 };

/**
 * Why this headword cannot be dealt as a spelling round, or null if it can.
 *
 * The rejected shapes are the ones the corpus actually contains, each measured
 * in the analysis script rather than imagined:
 *   digits          `0`, `00jo0`, `toolee. - 126-`
 *   whitespace      `suno tey` — a phrase, not a word to spell
 *   punctuation     `toolee. - 126-`
 * Hyphenated compounds (`jamaani-labano`) are NOT rejected: they are real
 * headwords and a hyphen is spellable. An edge hyphen is rejected, because it
 * is a fragment.
 */
export function unspellableReason(headword, languageCode) {
    const word = normalize(headword);
    if (!word) return 'empty';
    if (/\d/.test(word)) return 'contains-digits';
    if (/\s/.test(word)) return 'contains-whitespace';
    if (/[.,;:!?()[\]"'’“”/\\]/.test(word)) return 'contains-punctuation';
    if (/^-|-$/.test(word)) return 'edge-hyphen';

    const units = segmentHeadword(word, languageCode).length;
    if (units < SPELLABLE_UNIT_RANGE.min) return 'too-short';
    if (units > SPELLABLE_UNIT_RANGE.max) return 'too-long';
    return null;
}

/** Can this word be dealt as a spelling round? */
export function isSpellable(headword, languageCode) {
    return unspellableReason(headword, languageCode) === null;
}

/**
 * Partition a deck into what a spelling game may deal and what it may not.
 *
 * Returns both halves. The caller needs the rejects: a game that silently drops
 * words gives a player a 7-word round they asked 10 for, and nobody learns why.
 */
export function partitionSpellable(words, languageCode) {
    const spellable = [];
    const rejected = [];
    for (const word of words ?? []) {
        const reason = unspellableReason(word?.headword ?? word?.header_word ?? '', languageCode);
        if (reason === null) spellable.push(word);
        else rejected.push({ word, reason });
    }
    return { spellable, rejected };
}
