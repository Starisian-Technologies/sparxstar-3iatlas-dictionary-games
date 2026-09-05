/**
 * THE CHAIN: UI hint → hintsUsed → result → adaptation evidence.
 *
 * This suite exists because the previous one did not prove what it looked like
 * it proved. `recordOutcome()` has always accepted `hintsUsed`, and
 * `decideAdjustment()` was tested by handing it synthetic performance windows
 * containing hint data. Both passed. Meanwhile no game ever SENT a hint count —
 * the `onResult` contract stopped at `timeMs` — so in the running app the hint
 * rate was structurally zero however much help a learner took.
 *
 * A test that constructs the data it is checking cannot catch that. These drive
 * the real game components, press the real Hint button, and assert on what
 * actually arrives at `onResult`.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CompleteSentence from '../games/CompleteSentence.jsx';
import ListenWrite from '../games/ListenWrite.jsx';
import { MODE, OUTCOME } from '../../pedagogy.js';
import { emptyPerformance, recordOutcome, summarize } from '../../difficulty.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORDS = [
    {
        uuid: 'w1',
        headword: 'njemboo',
        translation_en: 'shade',
        audio_url: 'https://example.invalid/a.mp3',
        /* The sentence must CONTAIN the headword — the game blanks it out
         * itself, and rejects a word whose example does not mention it. */
        example_sentences: [{ sentence: 'A njemboo le mu.', translation_en: 'It is shade.' }],
    },
];

function mount(element) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(element));
    return {
        container,
        unmount: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

const click = (container, text) => {
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.trim().includes(text)
    );
    if (!button) throw new Error(`no "${text}" button`);
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    return button;
};

const GAMES = [
    { name: 'CompleteSentence', Component: CompleteSentence },
    { name: 'ListenWrite', Component: ListenWrite },
];

describe.each(GAMES)('$name', ({ Component }) => {
    it('has a Hint control at all', () => {
        const { container, unmount } = mount(
            <Component
                words={WORDS}
                language="en"
                languageCode="mnk"
                mode={MODE.PRACTICE}
                onResult={jest.fn()}
                onComplete={jest.fn()}
            />
        );
        expect(
            Array.from(container.querySelectorAll('button')).some((b) =>
                b.textContent.includes('Hint')
            )
        ).toBe(true);
        unmount();
    });

    it('REPORTS the hints taken, so adaptation can see them', () => {
        /* The defect, precisely: this argument never used to exist. */
        const onResult = jest.fn();
        const { container, unmount } = mount(
            <Component
                words={WORDS}
                language="en"
                languageCode="mnk"
                mode={MODE.PRACTICE}
                onResult={onResult}
                onComplete={jest.fn()}
            />
        );

        click(container, 'Hint');
        click(container, 'Hint');
        click(container, 'Skip');

        expect(onResult).toHaveBeenCalledTimes(1);
        const [, , , , , hintsUsed] = onResult.mock.calls[0];
        expect(hintsUsed).toBe(2);
        unmount();
    });

    it('records a hinted word as learning, never as unaided correct', () => {
        const onResult = jest.fn();
        const { container, unmount } = mount(
            <Component
                words={WORDS}
                language="en"
                languageCode="mnk"
                mode={MODE.PRACTICE}
                onResult={onResult}
                onComplete={jest.fn()}
            />
        );

        click(container, 'Hint');
        const input = container.querySelector('input[type="text"]');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;
        act(() => {
            setter.call(input, 'njemboo');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        act(() => {
            input
                .closest('form')
                .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(onResult).toHaveBeenCalled();
        const [, outcome] = onResult.mock.calls[0];
        /* Right answer, help taken: worth points, not proof of mastery. */
        expect(outcome).toBe(OUTCOME.LEARNING);
        unmount();
    });
});

describe('the reported hints reach the adaptation window', () => {
    it('moves hintRate off zero, which the old chain could never do', () => {
        const onResult = jest.fn();
        const { container, unmount } = mount(
            <CompleteSentence
                words={WORDS}
                language="en"
                languageCode="mnk"
                mode={MODE.PRACTICE}
                onResult={onResult}
                onComplete={jest.fn()}
            />
        );
        click(container, 'Hint');
        click(container, 'Skip');

        /* Feed exactly what the UI produced into the real adaptation input. */
        const [, outcome, attempts, , timeMs, hintsUsed] = onResult.mock.calls[0];
        const performance = recordOutcome(emptyPerformance(), {
            outcome,
            attempts,
            hintsUsed,
            timeMs,
        });
        expect(summarize(performance).hintRate).toBeGreaterThan(0);
        unmount();
    });

    it('and stays zero when no hint was taken', () => {
        const onResult = jest.fn();
        const { container, unmount } = mount(
            <CompleteSentence
                words={WORDS}
                language="en"
                languageCode="mnk"
                mode={MODE.PRACTICE}
                onResult={onResult}
                onComplete={jest.fn()}
            />
        );
        click(container, 'Skip');
        const [, outcome, attempts, , timeMs, hintsUsed] = onResult.mock.calls[0];
        const performance = recordOutcome(emptyPerformance(), {
            outcome,
            attempts,
            hintsUsed,
            timeMs,
        });
        expect(summarize(performance).hintRate).toBe(0);
        unmount();
    });
});
