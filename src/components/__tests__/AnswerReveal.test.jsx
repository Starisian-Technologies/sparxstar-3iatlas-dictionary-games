/**
 * The shared answer panel — the part of the games that does the teaching.
 *
 * This suite exists because two defects got through review here, and both had
 * the same shape: a field that reaches the browser and stops. The panel is the
 * last hop, so a field it does not render is a field no player ever sees,
 * however correctly every layer beneath it behaved.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AnswerReveal from '../AnswerReveal.jsx';
import { OUTCOME } from '../../pedagogy.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const word = (over = {}) => ({
    uuid: 'w1',
    headword: 'njemboo',
    translation_en: 'wing',
    translation_fr: 'aile',
    definition: '',
    english_definition: '',
    french_definition: '',
    ipa: 'ndʒemboː',
    audio_url: null,
    example_sentences: [],
    ...over,
});

function render(props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <AnswerReveal
                word={word()}
                outcome={OUTCOME.CORRECT}
                languageCode="mnk"
                language="en"
                onContinue={() => {}}
                {...props}
            />
        );
    });
    return { text: host.textContent ?? '', host, unmount: () => act(() => root.unmount()) };
}

describe('the meaning always reaches the player when one exists', () => {
    it('shows the English lemma on an English UI', () => {
        const { text, unmount } = render({});
        expect(text).toContain('wing');
        unmount();
    });

    it('shows the French lemma on a French UI', () => {
        const { text, unmount } = render({ language: 'fr' });
        expect(text).toContain('aile');
        unmount();
    });

    it('falls back to the English lemma when the French one is empty', () => {
        /*
         * The defect: `french_lemma` is 64.5% populated against
         * `english_lemma`'s 97.7%, and this panel picked the French field
         * unconditionally — so for about a third of words a French UI showed
         * NO meaning at all, in the panel whose whole job is to teach the word.
         *
         * Falling back between the two lemma fields is safe: the Dictionary
         * ships both unconditionally, so neither is rights-gated and nothing
         * withheld is being reconstructed.
         */
        const { text, unmount } = render({
            language: 'fr',
            word: word({ translation_fr: '' }),
        });
        expect(text).toContain('wing');
        unmount();
    });
});

describe('a definition must be about THIS entry', () => {
    /*
     * ===================== THE DEVON HAMLET =========================
     *
     * The panel rendered `english_definition` under the heading "English
     * definition", as though the Dictionary had said it about the word on
     * screen. It had not. That field defines the English LEMMA — or the
     * Mandinka headword read as English — so a Mandinka learner revealing
     * `kaw` was taught, in the app's own voice:
     *
     *     kaw
     *     MEANS water
     *     ENGLISH DEFINITION  A hamlet in Manaton parish, Teignbridge
     *                         district, Devon, England (OS grid ref SX7580).
     *
     * The records below are the real ones from the production pack, kept as a
     * fixture. Nothing in the payload separates the entries where this field
     * is right (`min` / drink) from the ones where it is a homograph, so the
     * panel shows none of it. A definition cannot be "probably about this
     * word".
     */
    const fromPack = (headword) => {
        const { adaptGamePackWord } = require('../../api/gamePackAdapter.js');
        const pack = require('../../__tests__/fixtures/mnk-swadesh-60.json');
        const row = pack.data.words.find((w) => w.header_word === headword);
        if (!row) throw new Error(`fixture has no entry for ${headword}`);
        return adaptGamePackWord(row);
    };

    it('never shows the English homograph for kaw', () => {
        const kaw = fromPack('kaw');
        /* Non-vacuity: the bad definition really is on the entry. */
        expect(kaw.english_definition).toContain('Devon');

        const { text, unmount } = render({ word: kaw });
        expect(text).not.toContain('Devon');
        expect(text).not.toContain('hamlet');
        expect(text).not.toContain('English definition');
        /* The approved gloss is what the learner gets, and it is correct. */
        expect(text).toContain('water');
        unmount();
    });

    it('never shows it for min either, even though min’s happens to be right', () => {
        /*
         * `min` (drink) carries "(ambitransitive) To consume (a liquid)
         * through the mouth" — which IS about the right concept. It is still
         * not rendered: the field is unverified as a class, and showing the
         * ones that look plausible is how the Devon hamlet got through.
         */
        const min = fromPack('min');
        expect(min.english_definition).toContain('consume');

        const { text, unmount } = render({ word: min });
        expect(text).not.toContain('consume');
        expect(text).toContain('drink');
        unmount();
    });

    it.each([
        ['kewo', 'Metropolitan Area Network', 'man'],
        ['wuleerin', 'electrodialysis', 'red'],
        ['jamboo', 'surname', 'leaf'],
    ])('suppresses the homograph on %s and keeps the gloss', (headword, wrong, gloss) => {
        const entry = fromPack(headword);
        expect(entry.english_definition.toLowerCase()).toContain(wrong.toLowerCase());

        const { text, unmount } = render({ word: entry });
        expect(text.toLowerCase()).not.toContain(wrong.toLowerCase());
        expect(text).toContain(gloss);
        unmount();
    });

    it('shows the entry’s own AIWA-elicited definition', () => {
        /* The field that IS keyed to the entry still renders, under its own
         * heading. Suppressing the homograph is not suppressing definitions. */
        const { text, unmount } = render({ word: word({ definition: 'a river' }) });
        expect(text).toContain('a river');
        unmount();
    });

    it('renders nothing rather than a fallback when no verified definition exists', () => {
        const { text, unmount } = render({
            word: word({ definition: '', english_definition: 'a large natural stream' }),
        });
        expect(text).not.toContain('a large natural stream');
        expect(text).not.toContain('Definition');
        unmount();
    });
});

describe('missing media degrades rather than blocking', () => {
    it('offers no replay control when there is no recording', () => {
        const { host, unmount } = render({ word: word({ audio_url: null }) });
        const labels = [...host.querySelectorAll('button')].map((b) => b.textContent ?? '');
        expect(labels.join(' ')).not.toMatch(/hear it again/i);
        unmount();
    });

    it('always offers Continue, whatever is missing', () => {
        /* A player on the bandwidth this platform is designed for must always
         * be able to finish the round. */
        const bare = {
            uuid: 'x',
            headword: 'taa',
            translation_en: '',
            translation_fr: '',
            definition: '',
            english_definition: '',
            french_definition: '',
            ipa: '',
            audio_url: null,
            example_sentences: [],
        };
        const { host, unmount } = render({ word: bare });
        const labels = [...host.querySelectorAll('button')].map((b) => b.textContent ?? '');
        expect(labels.join(' ')).toMatch(/continue|finish/i);
        unmount();
    });

    it('renders nothing at all rather than throwing on a missing word', () => {
        const { text, unmount } = render({ word: null });
        expect(text).toBe('');
        unmount();
    });
});

describe('the XP shown is the XP the ledger will hold', () => {
    it.each([
        [OUTCOME.CORRECT, '+10'],
        [OUTCOME.LEARNING, '+5'],
        [OUTCOME.INCORRECT, '+0'],
        [OUTCOME.SKIPPED, '+0'],
    ])('shows %s as %s XP', (outcome, expected) => {
        const { text, unmount } = render({ outcome });
        expect(text).toContain(expected);
        unmount();
    });
});
