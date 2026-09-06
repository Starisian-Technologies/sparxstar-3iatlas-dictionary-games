/**
 * GamePack → GameWord adapter.
 *
 * ======================== WHY THIS FILE EXISTS =========================
 *
 * The Dictionary Node's GamePack projection and this package's game components
 * were written against different field names. The components read `uuid`,
 * `headword`, `translation_en`, `translation_fr`, `ipa`, `domain` and
 * `example_sentences` — the WordPress `DictionaryEntry` shape. A GamePack
 * carries `entry_id`, `header_word`, `english_lemma`, `french_lemma`,
 * `ipa_pronunciation`, `domain_code` and a single `example`.
 *
 * Without this adapter every prompt renders blank and every result submits
 * `word_uuid: undefined`, which the engine cannot match to a session word. That
 * is not a hypothetical: it is what the first cut of the BFF work shipped, and
 * it survived a green test suite because the hook and the BFF were each tested
 * in isolation and nothing fed pack data to a component.
 *
 * The adapter lives in the PACKAGE layer, at the boundary where upstream data
 * enters, rather than in the BFF. Two reasons:
 *
 *   - The BFF's job is to relay what the Dictionary said, narrowed and
 *     unrenamed. Emitting legacy names from there would make its contract a
 *     description of this package's history rather than of the upstream.
 *   - A host that mounts `<GameShell />` against its own BFF gets the same
 *     translation for free.
 *
 * ============================ RIGHTS RULE ==============================
 *
 * This is a RENAME, never a backfill. Where the Dictionary withheld a field it
 * stays withheld:
 *
 *   - `english_definition` / `french_definition` come back EMPTY for licensed
 *     third-party material. This adapter does not read them at all, so there
 *     is no path by which an empty one could be papered over.
 *   - `translation_en` / `translation_fr` are sourced from `english_lemma` /
 *     `french_lemma`, which the Dictionary's own compiler ships
 *     UNCONDITIONALLY (`gamepack.ts` sets them outside the `mayShipSource`
 *     branch). They are a different field, not a substitute for the withheld
 *     one — a lemma is also the right shape for a matching game, where the
 *     prompt wants "the English word" and not a dictionary definition.
 *   - `audio_url: null` means no consented recording and stays null. Nothing
 *     here constructs a media URL.
 *
 * Anything the pack did not send is left ABSENT rather than filled with an
 * empty string: an empty string is the Dictionary saying "withheld", and
 * manufacturing one would put words in its mouth.
 */

/**
 * Translate one GamePack word into the shape the game components read.
 *
 * @param {object} packWord One entry from `data.words` of a BFF game-set response.
 * @returns {object} A GameWord: the component-facing shape.
 */
export function adaptGamePackWord(packWord) {
    if (packWord === null || typeof packWord !== 'object') return {};

    const word = {};

    /** Copy `from` to `to` only when the pack actually carried it. */
    const carry = (to, from) => {
        if (Object.prototype.hasOwnProperty.call(packWord, from)) word[to] = packWord[from];
    };

    // Identity. `uuid` is the settlement question identifier the engine matches
    // on, so an undefined value here is a silently unattributable result.
    carry('uuid', 'entry_id');
    carry('headword', 'header_word');

    // Prompt text and pronunciation.
    carry('ipa', 'ipa_pronunciation');
    carry('phonetic', 'phonetic_pronunciation');
    carry('part_of_speech', 'part_of_speech');
    carry('definition', 'definition');
    carry('domain', 'domain_code');

    // Glosses. From the LEMMA fields, which are never rights-gated — see the
    // rights rule in the header.
    carry('translation_en', 'english_lemma');
    carry('translation_fr', 'french_lemma');

    // Passed through byte-for-byte, including null. The signature is the
    // Dictionary's and must not be rewritten.
    carry('audio_url', 'audio_url');

    /*
     * ============ FIELDS THE BFF FORWARDED AND THIS ADAPTER DROPPED ============
     *
     * The BFF's rights projection (`server/rights.js`) allows twenty word
     * fields to the browser. This adapter carried ten. The rest arrived and
     * were thrown away here, so no game could use them however much they would
     * have helped. Measured fill rates over 488 real Mandinka entries are given
     * for each, because "available" and "populated" are different claims.
     *
     * `difficulty` is the important one. The Dictionary ALREADY CODES EVERY
     * WORD BY LEARNING LEVEL — CEFR values, 73.6% populated (A1 34.4%, A2
     * 16.6%, B1 8.6%, B2 9.2%, C1 4.7%). It reached the browser and was
     * discarded, which is why the games had no notion of difficulty at all.
     * It is now the PRIMARY difficulty signal; see `src/difficulty.js`.
     */
    carry('difficulty', 'difficulty');

    /*
     * `swadesh` — is this word's concept on the verified universal list?
     *
     * The adapter is an ALLOWLIST, so a field the Dictionary ships but nothing
     * carries is silently dropped. That is the failure mode this line exists
     * to prevent: the first-session confidence runway filters on
     * `word.swadesh`, and against a stripped field every word reads as
     * not-universal, so the runway would quietly return nothing rather than
     * fail loudly.
     *
     * Read, never recomputed. Which words are universal is AIWA's linguistic
     * classification; the software consumes it and does not redefine it.
     */
    carry('swadesh', 'swadesh');

    /*
     * Definitions. The adapter mapped `definition` — which is 0% populated in
     * the sampled corpus — and ignored `english_definition`, which is 62.3%.
     * So every game showed no definition while a definition existed for nearly
     * two words in three.
     *
     * All three are carried separately and NEVER merged. `definition` is
     * AIWA-elicited and ships regardless of the source licence;
     * `english_definition` and `french_definition` come back EMPTY for licensed
     * third-party material whose redistribution is not permitted. An empty
     * string is WITHHELD, not missing, and substituting one field for another
     * would reconstruct exactly what the rights decision withheld.
     */
    carry('english_definition', 'english_definition');
    carry('french_definition', 'french_definition');

    /* Orthography. `normalized_headword` (100%) is the NFC form to compare
     * against; `alternative_spelling` (0% here) and `ajami_form` (0% here) are
     * real orthographic alternatives that a spelling game must accept if they
     * are ever populated, rather than mark correct answers wrong. */
    carry('normalized_headword', 'normalized_headword');
    carry('alternative_spelling', 'alternative_spelling');
    carry('ajami_form', 'ajami_form');

    /* Morphology and relationships. `header_word_root` (0.2%) is the root a
     * word is built from; `concept_id` (97.7%) is what makes two entries
     * synonyms — 12 concepts in the sample carry more than one entry, which is
     * a distractor-quality signal `MeaningMatch` could use. */
    carry('header_word_root', 'header_word_root');
    carry('concept_id', 'concept_id');

    /* Alphabetical index (100%). Cheap, and the obvious first-letter hint. */
    carry('letter', 'letter');

    /*
     * Examples. A GamePack carries at most ONE example; the components expect
     * an array. A null example becomes an empty array rather than `[null]`,
     * which would render as a blank card rather than as "no example".
     *
     * The example's own `translation_en` is the sentence translation and is
     * kept under that name inside the sentence object, where the components
     * already look for it.
     */
    if (Object.prototype.hasOwnProperty.call(packWord, 'example')) {
        const example = packWord.example;
        word.example_sentences =
            example === null || example === undefined
                ? []
                : [
                      {
                          sentence: example.sentence ?? '',
                          translation_en: example.translation_en ?? '',
                      },
                  ];
    }

    return word;
}

/** Translate a whole pack's word list. */
export function adaptGamePackWords(words) {
    return Array.isArray(words) ? words.map(adaptGamePackWord) : [];
}
