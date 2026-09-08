/**
 * A ranking nobody can reach is a ranking nobody reads.
 *
 * These assert the two entry points the brief asks for, plus the one place the
 * control must NOT appear. They are written against rendered output rather than
 * against props, for the reason this repo learned the hard way: the dead
 * "Browse dictionary" button was passed its handler correctly and still did
 * nothing, so a prop-shape test would have passed against it.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import GameNav from '../GameNav.jsx';
import SessionComplete from '../SessionComplete.jsx';

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

const findButton = (container, text) =>
    Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.trim().includes(text)
    );

const session = {
    words: [{ uuid: 'w1' }],
    results: [{ outcome: 'correct' }],
    xpEarned: 10,
    game: 'listen_write',
};

describe('reaching the progress screen', () => {
    it('is offered from the navigation bar', () => {
        const onStats = jest.fn();
        const { container, unmount } = mount(<GameNav onHome={jest.fn()} onStats={onStats} />);
        act(() =>
            findButton(container, 'Progress').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            )
        );
        expect(onStats).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('is offered from the completion screen, where the question is asked', () => {
        const onStats = jest.fn();
        const { container, unmount } = mount(
            <SessionComplete
                session={session}
                learnedCount={1}
                onPracticeMissed={jest.fn()}
                onPlayAgain={jest.fn()}
                onChooseAnother={jest.fn()}
                onHome={jest.fn()}
                onStats={onStats}
            />
        );
        act(() =>
            findButton(container, 'See your progress and ranking').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            )
        );
        expect(onStats).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('renders no control at all when the host has not wired one', () => {
        /*
         * The `onBrowse` rule, applied to this surface: a host that has not
         * supplied a handler gets no button, rather than a button that looks
         * live and does nothing. Both screens follow it.
         */
        const nav = mount(<GameNav onHome={jest.fn()} />);
        expect(findButton(nav.container, 'Progress')).toBeUndefined();
        nav.unmount();

        const complete = mount(
            <SessionComplete
                session={session}
                learnedCount={1}
                onPracticeMissed={jest.fn()}
                onPlayAgain={jest.fn()}
                onChooseAnother={jest.fn()}
                onHome={jest.fn()}
            />
        );
        expect(findButton(complete.container, 'See your progress and ranking')).toBeUndefined();
        complete.unmount();
    });

    it('has a touch target at least 44px tall on every entry point', () => {
        /* Phone-first: the minimum this platform holds itself to, asserted
         * rather than left to a class name someone can drop in a refactor. */
        const { container, unmount } = mount(<GameNav onHome={jest.fn()} onStats={jest.fn()} />);
        expect(findButton(container, 'Progress').className).toContain('min-h-[44px]');
        unmount();
    });
});
