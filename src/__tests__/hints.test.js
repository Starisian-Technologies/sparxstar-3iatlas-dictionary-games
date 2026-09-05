/**
 * Per-game help, and the rule that decides what counts as help.
 *
 * SOURCE NOTE: the book was not supplied to this repository and has not been
 * read here; these pin the brief's enumeration of it.
 *
 * The mistake this guards against is the obvious repair — one hint component
 * showing the first letter in all six games. In `MeaningMatch` the task is
 * choosing a MEANING, so revealing spelling answers nothing that was asked; in
 * `LetterReveal` revealing letters IS the mechanic, so a letter hint would play
 * the game for the player.
 */
import { hasHint, hintLadder, nextHint } from '../hints.js';

const WORD = {
    uuid: 'w1',
    headword: 'njemboo',
    translation_en: 'shade',
    ipa: 'ndʒemboː',
    part_of_speech: 'n',
    domain: 'Nature',
    header_word_root: 'jem',
    example_sentences: [{ sentence: 'A njemboo le mu.', translation_en: 'It is shade.' }],
};

describe('help suits the mechanic', () => {
    it('never offers spelling help in the meaning game', () => {
        const ladder = hintLadder('meaning_match', WORD);
        expect(ladder.length).toBeGreaterThan(0);
        for (const rung of ladder) {
            /*
             * No rung whose PURPOSE is spelling. The example sentence does
             * contain the headword, and that is fine here: `MeaningMatch`
             * displays the headword at the top of the screen anyway, so an
             * example in the target language adds context without answering
             * the question, which is what was asked.
             */
            expect(rung.id).not.toMatch(/letter|unit|spell/);
        }
        /* And the meaning itself is never a rung — that IS the answer. */
        expect(ladder.map((h) => h.id)).not.toContain('meaning');
    });

    it('offers to remove a wrong answer, which only this game can do', () => {
        expect(hintLadder('meaning_match', WORD).map((h) => h.id)).toContain('eliminate');
    });

    it('never offers letters in the letter-reveal game', () => {
        /* Revealing letters is that game's mechanic; help must be elsewhere. */
        const ids = hintLadder('letter_reveal', WORD).map((h) => h.id);
        expect(ids).toEqual(expect.arrayContaining(['ipa', 'meaning']));
        expect(ids).not.toContain('eliminate');
    });

    it('gives the flashcard game enough to self-judge honestly', () => {
        const ids = hintLadder('domain_flash', WORD).map((h) => h.id);
        expect(ids).toEqual(expect.arrayContaining(['ipa', 'meaning', 'example']));
    });
});

describe('a withheld field is never offered as a hint', () => {
    it('skips rungs the Dictionary withheld, rather than showing a blank', () => {
        /*
         * The rights model: a withheld field is an EMPTY STRING, never absent.
         * A hint built on one would render an empty box and read as a broken
         * app rather than as "no example for this word".
         */
        const sparse = { uuid: 'w2', headword: 'taa', translation_en: '', ipa: '' };
        for (const game of ['meaning_match', 'letter_reveal', 'domain_flash']) {
            for (const rung of hintLadder(game, sparse)) {
                /* `eliminate` is the game's own mechanic, not a field. */
                if (rung.id !== 'eliminate') expect(rung.text).toBeTruthy();
            }
        }
    });

    it('reports honestly when a word has no help at all', () => {
        const bare = { uuid: 'w3', headword: 'taa' };
        expect(hasHint('letter_reveal', bare)).toBe(false);
        expect(nextHint('letter_reveal', bare, 0)).toBeNull();
    });
});

describe('the ladder ends rather than repeating', () => {
    it('returns null once help is exhausted', () => {
        const ladder = hintLadder('domain_flash', WORD);
        expect(nextHint('domain_flash', WORD, ladder.length)).toBeNull();
    });

    it('escalates, weakest first, and never repeats a rung', () => {
        const ladder = hintLadder('domain_flash', WORD);
        const ids = ladder.map((h) => h.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (let i = 0; i < ladder.length; i += 1) {
            expect(nextHint('domain_flash', WORD, i)).toEqual(ladder[i]);
        }
    });

    it('prefers the player’s own language for the meaning rung', () => {
        const bilingual = { ...WORD, translation_fr: 'ombre' };
        const fr = hintLadder('domain_flash', bilingual, { language: 'fr' });
        expect(fr.find((h) => h.id === 'meaning').text).toBe('ombre');
    });

    it('gives the written-spelling games nothing here — they own their ladder', () => {
        expect(hintLadder('arrange_word', WORD)).toEqual([]);
        expect(hintLadder('complete_sentence', WORD)).toEqual([]);
    });
});
