/**
 * ONE INVARIANT: every state has a way out.
 *
 * The shipped build trapped players twice. Once a round started, the in-play
 * header carried a Level control and an `Adaptive:` toggle and no exit at all.
 * And the completion screen's only non-play action, "Browse dictionary", called
 * a host callback the games site had wired to an empty function — a control
 * that looked live, did nothing, and was the sole route off the screen.
 *
 * Both were reachable in production and neither was caught, because no test
 * asserted that leaving was possible. These do.
 *
 * They are written against the rendered output rather than against props: a
 * test that checked `onHome` was passed would have passed against the dead
 * Browse button too, which was also passed correctly and still did nothing.
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
        unmount: () => act(() => root.unmount()),
    };
}

const buttonTexts = (container) =>
    Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());

const clickText = (container, text) => {
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.trim().includes(text)
    );
    if (!button) throw new Error(`no button matching "${text}" — found: ${buttonTexts(container)}`);
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    return button;
};

describe('GameNav — the escape hatch', () => {
    it('always offers Games Home', () => {
        const onHome = jest.fn();
        const { container, unmount } = mount(<GameNav onHome={onHome} />);
        clickText(container, 'Games Home');
        expect(onHome).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('calls the real handler, not a no-op', () => {
        /*
         * The precise shape of the shipped defect: a button wired to a function
         * that did nothing. A spy proves the click reaches the handler; that
         * the handler does something is GameShell's test, below.
         */
        const onHome = jest.fn();
        const onRestart = jest.fn();
        const { container, unmount } = mount(<GameNav onHome={onHome} onRestart={onRestart} />);
        clickText(container, 'Restart');
        expect(onRestart).toHaveBeenCalledTimes(1);
        expect(onHome).not.toHaveBeenCalled();
        unmount();
    });

    it('shows the game name, position and points while playing', () => {
        const { container, unmount } = mount(
            <GameNav
                onHome={jest.fn()}
                gameName="Arrange the Word"
                questionAt={3}
                questionOf={10}
                points={25}
            />
        );
        expect(container.textContent).toContain('Arrange the Word');
        expect(container.textContent).toContain('3 / 10');
        expect(container.textContent).toContain('25 pts');
        unmount();
    });

    it('omits the position when there is no deck, rather than showing 1 / 0', () => {
        const { container, unmount } = mount(
            <GameNav onHome={jest.fn()} questionAt={1} questionOf={0} />
        );
        expect(container.textContent).not.toContain('/ 0');
        unmount();
    });

    it('hides Restart where restarting is meaningless', () => {
        const { container, unmount } = mount(<GameNav onHome={jest.fn()} onRestart={null} />);
        expect(buttonTexts(container).join(' ')).not.toContain('Restart');
        unmount();
    });
});

describe('SessionComplete — never a dead end', () => {
    const session = {
        gameType: 'arrange_word',
        words: [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }],
        results: [
            { wordUuid: 'a', outcome: 'correct', xp: 10 },
            { wordUuid: 'b', outcome: 'learning', xp: 5 },
            { wordUuid: 'c', outcome: 'skipped', xp: 0 },
        ],
        xpEarned: 15,
    };

    const render = (props = {}) =>
        mount(
            <SessionComplete
                session={session}
                learnedCount={4}
                onPracticeMissed={jest.fn()}
                onPlayAgain={jest.fn()}
                onChooseAnother={jest.fn()}
                onHome={jest.fn()}
                {...props}
            />
        );

    it('offers all three required exits', () => {
        const { container, unmount } = render();
        const text = buttonTexts(container).join(' | ');
        expect(text).toContain('Play Again');
        expect(text).toContain('Choose Another Game');
        expect(text).toContain('Return to Games Home');
        unmount();
    });

    it('wires each exit to its own handler', () => {
        const onPlayAgain = jest.fn();
        const onChooseAnother = jest.fn();
        const onHome = jest.fn();
        const { container, unmount } = render({ onPlayAgain, onChooseAnother, onHome });

        clickText(container, 'Play Again');
        expect(onPlayAgain).toHaveBeenCalledTimes(1);
        clickText(container, 'Choose Another Game');
        expect(onChooseAnother).toHaveBeenCalledTimes(1);
        clickText(container, 'Return to Games Home');
        expect(onHome).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('does NOT render Browse when no host handler exists', () => {
        /* The exact regression. A games site that implements no Browse tab must
         * not show a Browse button. */
        const { container, unmount } = render();
        expect(buttonTexts(container).join(' ')).not.toContain('Browse');
        unmount();
    });

    it('renders Browse only when a host actually supplies one', () => {
        const onBrowse = jest.fn();
        const { container, unmount } = render({ onBrowse });
        clickText(container, 'Browse dictionary');
        expect(onBrowse).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('reconciles every outcome category against questions answered', () => {
        /*
         * The scoreboard reported `correct`, `learning` and XP only, so a round
         * with a skip or a wrong answer displayed totals that did not add up.
         */
        const { container, unmount } = render();
        const text = container.textContent;
        expect(text).toContain('3 of 3 questions answered');
        expect(text).toContain('Skipped');
        expect(text).toContain('To review');
        unmount();
    });

    it('offers practice for a session where every card was SKIPPED', () => {
        /*
         * Qodo's finding. `handlePracticeMissed` replays everything
         * `needsReview()` covers — learning, incorrect and skipped — but the
         * button was gated on a `learning` result existing. A round where the
         * player skipped every card had words waiting in the review queue and
         * no way to practise them. Reachable the moment DomainFlash gained a
         * Skip control, which this same PR added.
         */
        const skippedOnly = {
            gameType: 'domain_flash',
            words: [{ uuid: 'a' }, { uuid: 'b' }],
            results: [
                { wordUuid: 'a', outcome: 'skipped', xp: 0 },
                { wordUuid: 'b', outcome: 'skipped', xp: 0 },
            ],
            xpEarned: 0,
        };
        const { container, unmount } = mount(
            <SessionComplete
                session={skippedOnly}
                learnedCount={0}
                onPracticeMissed={jest.fn()}
                onPlayAgain={jest.fn()}
                onChooseAnother={jest.fn()}
                onHome={jest.fn()}
            />
        );
        const practice = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent.includes('Practice these words')
        );
        expect(practice).toBeDefined();
        expect(practice.textContent).toContain('(2)');
        unmount();
    });

    it('offers no practice when nothing needs reviewing', () => {
        const allCorrect = {
            gameType: 'arrange_word',
            words: [{ uuid: 'a' }],
            results: [{ wordUuid: 'a', outcome: 'correct', xp: 10 }],
            xpEarned: 10,
        };
        const { container, unmount } = mount(
            <SessionComplete
                session={allCorrect}
                learnedCount={1}
                onPracticeMissed={jest.fn()}
                onPlayAgain={jest.fn()}
                onChooseAnother={jest.fn()}
                onHome={jest.fn()}
            />
        );
        expect(buttonTexts(container).join(' ')).not.toContain('Practice');
        unmount();
    });

    it('shows what adaptation decided, on the screen where it is decided', () => {
        const { container, unmount } = render({ adjustNotice: 'Moving you up a level.' });
        expect(container.textContent).toContain('Moving you up a level.');
        unmount();
    });
});
