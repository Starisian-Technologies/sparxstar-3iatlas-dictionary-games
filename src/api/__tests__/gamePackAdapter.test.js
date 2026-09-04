/**
 * GamePack → GameWord adapter.
 *
 * This suite exists because its absence shipped a break. The BFF work changed
 * the shape of the data entering the package without changing the components
 * that read it, and every existing test passed: the hook was tested against a
 * BFF response, the BFF against a Dictionary response, and nothing against the
 * pair. Every game would have rendered a blank prompt and submitted
 * `word_uuid: undefined`.
 *
 * So the first test below is the one that matters: the adapter's output must
 * carry exactly the field names the components actually read.
 */

import { adaptGamePackWord, adaptGamePackWords } from '../gamePackAdapter.js';

/** One word as `GET /v1/m2m/gamepack` returns it, via the BFF's projection. */
function packWord(overrides = {}) {
    return {
        entry_id: 'entry-1',
        concept_id: 'concept-1',
        letter: 'B',
        header_word: 'baa',
        header_word_root: 'baa',
        normalized_headword: 'baa',
        alternative_spelling: '',
        ajami_form: '',
        part_of_speech: 'n',
        definition: 'a river',
        ipa_pronunciation: 'baː',
        phonetic_pronunciation: 'bah',
        audio_url: 'https://media.sparxstar.com/a.mp3?sig=abc',
        example: { sentence: 'Baa be jan.', translation_en: 'The river is far.' },
        english_lemma: 'river',
        english_definition: 'a large natural stream',
        french_lemma: 'rivière',
        french_definition: 'un cours d’eau',
        domain_code: '1.3',
        difficulty: 'A1',
        ...overrides,
    };
}

/**
 * The fields the six game components and GameShell actually read, taken from
 * the source rather than from memory:
 *
 *   grep -rhoE "word\.[a-z_]+" src/components/games/ src/components/GameShell.jsx
 */
const FIELDS_THE_COMPONENTS_READ = [
    'uuid',
    'headword',
    'ipa',
    'domain',
    'translation_en',
    'translation_fr',
    'example_sentences',
    'audio_url',
];

describe('adaptGamePackWord — the contract the components depend on', () => {
    it('supplies every field the game components read', () => {
        const word = adaptGamePackWord(packWord());

        for (const field of FIELDS_THE_COMPONENTS_READ) {
            expect(word).toHaveProperty(field);
        }
    });

    it('maps identity so results can be attributed to a session word', () => {
        const word = adaptGamePackWord(packWord());

        // `uuid` is the settlement question identifier the engine matches on.
        // Undefined here is a result nobody can attribute.
        expect(word.uuid).toBe('entry-1');
        expect(word.headword).toBe('baa');
    });

    it('maps prompt fields', () => {
        const word = adaptGamePackWord(packWord());
        expect(word.ipa).toBe('baː');
        expect(word.domain).toBe('1.3');
        expect(word.translation_en).toBe('river');
        expect(word.translation_fr).toBe('rivière');
    });

    it('turns the single example into the array the components expect', () => {
        const word = adaptGamePackWord(packWord());
        expect(word.example_sentences).toEqual([
            { sentence: 'Baa be jan.', translation_en: 'The river is far.' },
        ]);
    });

    it('renders a missing example as an empty list, not a blank card', () => {
        const word = adaptGamePackWord(packWord({ example: null }));
        expect(word.example_sentences).toEqual([]);
    });
});

describe('adaptGamePackWord — rights are preserved', () => {
    /**
     * The important one. `english_definition` and `french_definition` come back
     * EMPTY for licensed third-party material. The glosses the components show
     * are sourced from the LEMMA fields, which the Dictionary's compiler ships
     * unconditionally — so this is a different field, not a backfill of a
     * withheld one.
     */
    it('never sources a gloss from the rights-gated definition fields', () => {
        const restricted = packWord({
            english_definition: '',
            french_definition: '',
            english_lemma: 'thing',
            french_lemma: 'chose',
        });

        const word = adaptGamePackWord(restricted);

        expect(word.translation_en).toBe('thing');
        expect(word.translation_fr).toBe('chose');
        // And the withheld fields are not carried under any name at all.
        expect(word.english_definition).toBeUndefined();
        expect(word.french_definition).toBeUndefined();
    });

    it('never substitutes the native definition for a withheld gloss', () => {
        const word = adaptGamePackWord(
            packWord({ english_definition: '', english_lemma: '', definition: 'a thing' })
        );

        // An empty lemma stays empty. Falling back to `definition` here would
        // ship AIWA's own text where the source's gloss was withheld, and the
        // entry would read as complete to everything downstream.
        expect(word.translation_en).toBe('');
        expect(word.translation_en).not.toBe('a thing');
    });

    it('leaves an unconsented recording null and never synthesizes a URL', () => {
        const word = adaptGamePackWord(packWord({ audio_url: null }));
        expect(word.audio_url).toBeNull();
    });

    it('passes a consented signed URL through byte-for-byte', () => {
        const word = adaptGamePackWord(packWord());
        expect(word.audio_url).toBe('https://media.sparxstar.com/a.mp3?sig=abc');
    });

    it('leaves an absent field absent rather than manufacturing an empty one', () => {
        // An empty string is the Dictionary saying "withheld". Inventing one for
        // a field it simply did not send would put words in its mouth.
        const word = adaptGamePackWord({ entry_id: 'x' });
        expect(word).toEqual({ uuid: 'x' });
        expect('translation_en' in word).toBe(false);
        expect('audio_url' in word).toBe(false);
    });
});

describe('adaptGamePackWords', () => {
    it('maps a list and tolerates a non-list', () => {
        expect(adaptGamePackWords([packWord(), packWord({ entry_id: 'entry-2' })])).toHaveLength(2);
        expect(adaptGamePackWords(undefined)).toEqual([]);
        expect(adaptGamePackWords(null)).toEqual([]);
        expect(adaptGamePackWords({})).toEqual([]);
    });

    it('tolerates a malformed member without throwing', () => {
        expect(adaptGamePackWords([null, 'nonsense', packWord()])).toEqual([
            {},
            {},
            expect.objectContaining({ uuid: 'entry-1' }),
        ]);
    });
});
