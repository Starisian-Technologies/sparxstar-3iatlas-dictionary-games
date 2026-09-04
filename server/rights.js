/**
 * Rights-preserving passthrough.
 *
 * ==================== THE RULE THIS FILE EXISTS FOR ======================
 *
 * Authenticated application access does not remove copyright or consent
 * restrictions. The Dictionary has already applied its §2b rights filter when
 * it compiled the pack: for an entry whose sourced fields are licensed
 * third-party material, `english_definition` and `french_definition` come back
 * as EMPTY STRINGS, and an entry with no consented audio comes back with
 * `audio_url: null`.
 *
 * An empty field is therefore a DECISION, not a gap. This module's whole
 * purpose is to make sure nothing downstream treats it as a gap:
 *
 *   - It never substitutes another field for a withheld one. Falling back to
 *     the native `definition` when `english_definition` is empty would ship
 *     the withheld clue text under a different key, and the entry would read
 *     as complete to every consumer thereafter.
 *   - It never synthesizes a media URL. `audio_url: null` means no consented
 *     recording; a URL guessed from an entry id would be a request for an
 *     asset the consent record does not cover.
 *   - It never widens the field set. The output is an explicit allowlist
 *     mirroring the Dictionary's own GamePack projection, so a field the
 *     Dictionary adds later cannot reach the browser just because it appeared
 *     upstream — the games decide to carry it, deliberately, in a commit.
 *
 * That last one runs the same direction as the Dictionary's own
 * `assertProjectionSafe`: both sides narrow, neither widens. A BFF that
 * spread `...word` would silently forward whatever the upstream grew.
 */

'use strict';

/**
 * The fields a game word may carry to the browser.
 *
 * Mirrors `GamePackWord` in the Dictionary's `src/domain/types.ts`. Kept as a
 * literal list rather than derived, because deriving it from the response is
 * precisely the widening this file forbids.
 */
const GAME_WORD_FIELDS = Object.freeze([
    'entry_id',
    'concept_id',
    'letter',
    'header_word',
    'header_word_root',
    'normalized_headword',
    'alternative_spelling',
    'ajami_form',
    'part_of_speech',
    // AIWA-elicited and owned; it ships regardless of the source's licence.
    'definition',
    'ipa_pronunciation',
    'phonetic_pronunciation',
    // A signed, short-lived URL or null. Passed through EXACTLY as received.
    'audio_url',
    'example',
    'english_lemma',
    // Withheld (empty) for licensed material. Never backfilled.
    'english_definition',
    'french_lemma',
    'french_definition',
    'domain_code',
    'difficulty',
]);

/** Pack-level fields. `signature` travels so a consumer could verify the pack
 *  against the Dictionary's own signing key; dropping it would remove that
 *  option for no benefit. */
const PACK_FIELDS = Object.freeze([
    'pack_id',
    'language',
    'domain_code',
    'level',
    'corpus_version',
    'release_id',
    'generated_at',
    'signature',
]);

/**
 * Narrow one object to an allowlist.
 *
 * A field that is ABSENT upstream stays absent — it is not filled with `null`
 * or `''`. The difference matters for exactly the reason this file exists: an
 * empty string is the Dictionary saying "withheld", and manufacturing one for
 * a field that simply was not sent would put words in its mouth.
 */
function pick(source, fields) {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) return {};
    const output = {};
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            output[field] = source[field];
        }
    }
    return output;
}

/**
 * Project one word for the browser.
 *
 * Every value is copied verbatim. `example` is narrowed to the two keys the
 * Dictionary's own type declares, so an enriched example object upstream does
 * not arrive here as a wider one.
 */
function projectWord(word) {
    const projected = pick(word, GAME_WORD_FIELDS);

    if (Object.prototype.hasOwnProperty.call(projected, 'example')) {
        const example = projected.example;
        projected.example =
            example === null || example === undefined
                ? null
                : pick(example, ['sentence', 'translation_en']);
    }

    return projected;
}

/**
 * Project a whole GamePack.
 *
 * `edges` travel because they are the pack's closed relation graph — every
 * edge connects two words INSIDE this pack, which is what stops a consumer
 * walking the corpus graph pack by pack. Narrowed to the four declared keys
 * for the same no-widening reason as everything else.
 */
function projectGamePack(pack) {
    const projected = pick(pack, PACK_FIELDS);

    projected.words = Array.isArray(pack?.words) ? pack.words.map(projectWord) : [];
    projected.edges = Array.isArray(pack?.edges)
        ? pack.edges.map((edge) => pick(edge, ['from', 'to', 'type', 'confirmed']))
        : [];

    return projected;
}

module.exports = { projectGamePack, projectWord, GAME_WORD_FIELDS, PACK_FIELDS };
