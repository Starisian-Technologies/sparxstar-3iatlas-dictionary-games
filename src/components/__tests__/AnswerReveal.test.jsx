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

describe('the definitions the adapter carries actually render', () => {
    it('shows the source-derived definition', () => {
        /*
         * The other defect, and the more embarrassing one: the field audit
         * established `definition` is 0% populated and `english_definition`
         * 62.3%, the adapter was changed to carry the second — and this panel
         * still rendered only the first. The fix reached the browser and
         * stopped there.
         */
        const { text, unmount } = render({
            word: word({ english_definition: 'a large natural stream' }),
        });
        expect(text).toContain('a large natural stream');
        unmount();
    });

    it('shows the AIWA-elicited definition', () => {
        const { text, unmount } = render({ word: word({ definition: 'a river' }) });
        expect(text).toContain('a river');
        unmount();
    });

    it('shows both, separately, when both exist', () => {
        const { text, unmount } = render({
            word: word({ definition: 'a river', english_definition: 'a large stream' }),
        });
        expect(text).toContain('a river');
        expect(text).toContain('a large stream');
        unmount();
    });

    it('renders nothing for a withheld definition, and never substitutes', () => {
        /*
         * The rights invariant at the last hop. An empty `english_definition`
         * is WITHHELD upstream. The panel must show nothing there — and must
         * not put the AIWA-elicited `definition` under that heading, nor the
         * translation, either of which would reconstruct what was withheld.
         */
        const { text, unmount } = render({
            word: word({ english_definition: '', definition: 'AIWA text' }),
        });
        expect(text).not.toContain('English definition');
        /* The AIWA field still shows under its OWN heading. */
        expect(text).toContain('AIWA text');
        unmount();
    });

    it('prefers the French definition on a French UI when there is one', () => {
        const { text, unmount } = render({
            language: 'fr',
            word: word({ french_definition: 'un cours d’eau', english_definition: 'a stream' }),
        });
        expect(text).toContain('un cours d’eau');
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
