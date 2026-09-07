/**
 * StatsScreen — the screen must show the engine's answer, or say it has none.
 *
 * Four properties matter more than the layout, and each has a failure mode that
 * looks fine on screen:
 *
 *   1. Ranks come off the wire. A client that renumbers rows is invisible until
 *      a tie or a mid-page change, and then it is a learner told they are 3rd
 *      on a board that has them 4th.
 *   2. A learner outside the first page still sees where they are. A board that
 *      shows only leaders tells someone ranked 47th nothing at all.
 *   3. A guest gets no rank. Not an empty board, not a zero — no rank, because
 *      there is nothing ranked and a placeholder would read as a real one.
 *   4. The self row is findable without colour. Colour is the third signal
 *      here, never the only one.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StatsScreen from '../StatsScreen.jsx';

jest.mock('../../hooks/idbUtils.js', () => {
    const store = new Map();
    return {
        __store: store,
        getRecord: jest.fn(async (storeName, key) => store.get(`${storeName}:${key}`) ?? null),
        putRecord: jest.fn(async () => true),
    };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ENGINE = 'https://engine.test/api/v1';

function board(overrides = {}) {
    return {
        window: 'weekly',
        scope: 'all_games',
        game_type: null,
        language: null,
        band: null,
        entries: [],
        next_cursor: null,
        self_context: null,
        window_started_at: Date.UTC(2026, 8, 1),
        generated_at: Date.UTC(2026, 8, 7),
        ...overrides,
    };
}

function entry(rank, screenName, xp, extra = {}) {
    return {
        rank,
        screen_name: screenName,
        xp,
        is_self: false,
        tied: false,
        movement: 'unchanged',
        ...extra,
    };
}

/** Route each request by path, so the two parallel calls can differ. */
function routeFetch({ leaderboards = [board()], stats = null }) {
    let page = 0;
    return jest.fn(async (url) => {
        if (String(url).includes('/stats')) {
            if (stats === null) return { ok: false, status: 404, json: async () => ({}) };
            return { ok: true, status: 200, json: async () => stats };
        }
        const body = leaderboards[Math.min(page, leaderboards.length - 1)];
        page += 1;
        return { ok: true, status: 200, json: async () => body };
    });
}

async function mount(props) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(<StatsScreen {...props} />);
    });
    /* One more flushed microtask turn: the token resolves in an effect, which
     * is what unblocks the fetches the assertions are about. */
    await act(async () => {});
    return {
        container,
        unmount: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

/**
 * Board rows only.
 *
 * `container.querySelectorAll('li')` also matches the "How points are earned"
 * bullets, which is how an assertion about ranking rows quietly starts
 * asserting about explanatory prose. `ol li` is the board.
 */
function boardRows(container) {
    return [...container.querySelectorAll('ol li')];
}

/** Every rendered board row's visible rank text. */
function renderedRanks(container) {
    return boardRows(container).map((li) => li.querySelector('span[aria-label]')?.textContent);
}

beforeEach(() => {
    window.fetch = jest.fn();
});

afterEach(() => {
    delete window.fetch;
    jest.clearAllMocks();
});

describe('ranks come from the engine', () => {
    it('renders the server rank, not the row position, and labels a tie', async () => {
        /*
         * The rows are 1, 2, 2, 4 — competition ranking, which is what the
         * engine produces for equal XP. A client using `index + 1` would render
         * 1, 2, 3, 4 and quietly disagree with every other surface in the
         * platform about who came second.
         */
        window.fetch = routeFetch({
            leaderboards: [
                board({
                    entries: [
                        entry(1, 'Ayo', 90),
                        entry(2, 'Binta', 50, { tied: true }),
                        entry(2, 'Cheikh', 50, { tied: true }),
                        entry(4, 'Demba', 10),
                    ],
                }),
            ],
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        expect(renderedRanks(container)).toEqual(['1', 'Joint 2', 'Joint 2', '4']);
        unmount();
    });

    it('renders a board whose rows arrive out of XP order without re-sorting it', async () => {
        /* Ordering is the engine's too. Re-sorting here would be a second
         * ranking rule, and the one that loses when they disagree. */
        window.fetch = routeFetch({
            leaderboards: [board({ entries: [entry(1, 'Ayo', 10), entry(2, 'Binta', 99)] })],
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        const names = boardRows(container).map((li) => li.textContent);
        expect(names[0]).toContain('Ayo');
        expect(names[1]).toContain('Binta');
        unmount();
    });
});

describe('a learner outside the first page', () => {
    it('shows their own rank and their nearby competitors', async () => {
        window.fetch = routeFetch({
            leaderboards: [
                board({
                    entries: [entry(1, 'Ayo', 900), entry(2, 'Binta', 800)],
                    next_cursor: 'cursor-2',
                    self_context: [
                        entry(46, 'Fatou', 120),
                        entry(47, 'Me', 110, { is_self: true }),
                        entry(48, 'Gorgui', 100),
                    ],
                }),
            ],
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        const text = container.textContent;
        expect(text).toContain('Where you are');
        expect(text).toContain('46');
        expect(text).toContain('47');
        expect(text).toContain('48');

        /* Reachable, not just present: the row above must be named, because
         * that is the place the learner can actually take next. */
        expect(text).toContain('Fatou');
        unmount();
    });

    it('marks the learner’s own row without relying on colour', async () => {
        window.fetch = routeFetch({
            leaderboards: [
                board({ entries: [entry(1, 'Ayo', 90), entry(2, 'Me', 50, { is_self: true })] }),
            ],
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        const selfRow = container.querySelector('li[aria-current="true"]');
        expect(selfRow).not.toBeNull();
        expect(selfRow.textContent).toContain('Me');
        /* A visible word, not only a tint — a high-contrast theme discards the
         * tint and a screen reader never had it. */
        expect(selfRow.textContent).toContain('You');

        const others = boardRows(container).filter(
            (li) => li.getAttribute('aria-current') !== 'true'
        );
        expect(others).toHaveLength(1);
        unmount();
    });

    it('states rank movement in words as well as in an arrow', async () => {
        window.fetch = routeFetch({
            leaderboards: [
                board({
                    entries: [
                        entry(1, 'Ayo', 90, { movement: 'up' }),
                        entry(2, 'Binta', 50, { movement: 'down' }),
                        entry(3, 'Cheikh', 20, { movement: 'new' }),
                    ],
                }),
            ],
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        expect(container.textContent).toContain('moved up');
        expect(container.textContent).toContain('moved down');
        expect(container.textContent).toContain('new this period');
        unmount();
    });
});

describe('the board request', () => {
    it('loads the board and the caller’s own stats in parallel', async () => {
        /*
         * Not one after the other. The board needs nothing from the stats
         * response — the engine derives the caller's band and population from
         * their account — so chaining them would put two round trips in front
         * of the first paint on the connections least able to absorb them.
         */
        let resolveStats;
        const statsGate = new Promise((resolve) => {
            resolveStats = resolve;
        });

        window.fetch = jest.fn(async (url) => {
            if (String(url).includes('/stats')) {
                await statsGate;
                return { ok: true, status: 200, json: async () => ({}) };
            }
            return { ok: true, status: 200, json: async () => board() };
        });

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(
                <StatsScreen engineUrl={ENGINE} getSuiteToken={() => 'token'} accountId="acc-1" />
            );
        });
        await act(async () => {});

        /*
         * Both requests are already in flight while the stats one is still
         * blocked. Under a sequential implementation only one of these would
         * have been made, and the second would be waiting on the gate below.
         */
        const paths = window.fetch.mock.calls.map((c) => String(c[0]));
        expect(paths.some((p) => p.includes('/leaderboard'))).toBe(true);
        expect(paths.some((p) => p.includes('/stats'))).toBe(true);

        resolveStats();
        await act(async () => {});
        act(() => root.unmount());
        container.remove();
    });

    it('switches the board and the window without inventing either value', async () => {
        window.fetch = routeFetch({ leaderboards: [board()] });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
            sourceLanguage: 'mnk',
        });

        const firstUrl = new URL(String(window.fetch.mock.calls[0][0]));
        expect(firstUrl.searchParams.get('window')).toBe('weekly');
        expect(firstUrl.searchParams.get('scope')).toBe('game');
        expect(firstUrl.searchParams.get('game_type')).toBe('dictionary_quiz');
        expect(firstUrl.searchParams.get('language')).toBe('mnk');

        const allGames = [...container.querySelectorAll('button')].find(
            (b) => b.textContent === 'All Games'
        );
        await act(async () => {
            allGames.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        });
        await act(async () => {});

        const latest = new URL(String(window.fetch.mock.calls.at(-1)[0]));
        expect(latest.searchParams.get('scope')).toBe('all_games');
        expect(latest.searchParams.has('game_type')).toBe(false);
        /* All-games spans languages by definition, so the language filter goes
         * with the Dictionary board rather than following the player around. */
        expect(latest.searchParams.has('language')).toBe(false);
        unmount();
    });
});

describe('a guest', () => {
    it('is given no rank at all, and is told why', async () => {
        window.fetch = jest.fn();

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => null,
        });

        /* No request is even made: there is no account to rank. */
        expect(window.fetch).not.toHaveBeenCalled();
        expect(container.textContent).toContain('guest');
        /* No board, no self row, and no rank tile — the screen offers a rank
         * as something to sign in FOR, and never as a number it already has. */
        expect(container.querySelector('ol')).toBeNull();
        expect(container.querySelector('[aria-current="true"]')).toBeNull();
        expect(container.textContent).not.toContain('Your rank');
        unmount();
    });

    it('shows device-local counts and no XP figure', async () => {
        /* XP is a reward, and rewards are settled by the engine. A guest has
         * settled nothing, so a number here would be one this client invented
         * — and one the player could not tell from a real one. */
        const idb = require('../../hooks/idbUtils.js');
        idb.__store.set('progress-outbox:progress-outbox:pending', {
            key: 'progress-outbox:pending',
            events: [
                { type: 'game_result', run_id: 'r1', word_uuid: 'w1', outcome: 'correct' },
                { type: 'game_result', run_id: 'r1', word_uuid: 'w2', outcome: 'incorrect' },
                { type: 'game_result', run_id: 'r2', word_uuid: 'w3', outcome: 'correct' },
            ],
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => null,
        });

        expect(container.textContent).toContain('Rounds played');
        /*
         * No XP FIGURE. The copy is free to mention XP as the thing signing in
         * would earn — that is the offer. What must not appear is a number
         * attached to it, because this client has no way to arrive at one
         * honestly and the player has no way to tell an invented total from a
         * settled one.
         */
        const tileLabels = [...container.querySelectorAll('p')].map((el) => el.textContent);
        expect(tileLabels).not.toContain('XP');
        expect(container.textContent).not.toMatch(/\d\s*XP/);
        idb.__store.clear();
        unmount();
    });
});

describe('states that are not a board', () => {
    it('says nothing is ranked yet rather than showing an empty list', async () => {
        window.fetch = routeFetch({ leaderboards: [board({ entries: [] })] });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        expect(container.textContent).toContain('Nobody has scored on this board yet');
        unmount();
    });

    it('reports an expired session as something the player can act on', async () => {
        window.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        const alert = container.querySelector('[role="alert"]');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('Sign in again');
        unmount();
    });

    it('shows an unranked learner an em dash, never a zero', async () => {
        /*
         * `rank: null` means the engine has nothing ranked for this window.
         * Rendering it as 0 would invent a position below every real one; and
         * `accuracy: null` is the same distinction — nothing answered is not
         * everything answered wrongly.
         */
        window.fetch = routeFetch({
            leaderboards: [board()],
            stats: {
                account_id: 'acc-1',
                screen_name: 'Me',
                band: 'adult',
                weekly: { xp: 0, games_played: 0, accuracy: null, rank: null },
                all_time: { xp: 0, games_played: 0, accuracy: null, rank: null },
                stars: 0,
                badges: 0,
            },
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
            accountId: 'acc-1',
        });

        expect(container.textContent).toContain('—');
        expect(container.textContent).toContain('not ranked in this period yet');
        /* Nothing writes badge rows yet, so a permanent "0 badges" would
         * advertise a feature that does not exist. */
        expect(container.textContent).not.toContain('Badges');
        unmount();
    });
});

describe('reduced motion', () => {
    it('drops the spin and the colour transitions when the viewer asks for it', async () => {
        /*
         * Not decoration. Vestibular disorders make a spinning element actively
         * unpleasant, and the OS setting is the only way the viewer has to say
         * so. It is honoured on the loading state AND on the board/window
         * toggles, because a screen that stops one animation and keeps another
         * has not honoured anything.
         */
        const original = window.matchMedia;
        window.matchMedia = jest.fn().mockReturnValue({ matches: true });
        window.fetch = routeFetch({ leaderboards: [board({ entries: [entry(1, 'Ayo', 90)] })] });

        try {
            const { container, unmount } = await mount({
                engineUrl: ENGINE,
                getSuiteToken: () => 'token',
            });

            expect(container.querySelector('.animate-spin')).toBeNull();
            const toggles = [...container.querySelectorAll('button')].filter((b) =>
                ['Dictionary Games', 'All Games', 'This week', 'All time'].includes(
                    b.textContent.trim()
                )
            );
            expect(toggles).toHaveLength(4);
            for (const toggle of toggles) {
                expect(toggle.className).not.toContain('transition-colors');
            }
            unmount();
        } finally {
            window.matchMedia = original;
        }
    });
});

describe('pagination', () => {
    it('asks for the next page with the engine’s own cursor and appends it', async () => {
        window.fetch = routeFetch({
            leaderboards: [
                board({ entries: [entry(1, 'Ayo', 90)], next_cursor: 'cursor-2' }),
                board({ entries: [entry(2, 'Binta', 50)], next_cursor: null }),
            ],
        });

        const { container, unmount } = await mount({
            engineUrl: ENGINE,
            getSuiteToken: () => 'token',
        });

        const more = [...container.querySelectorAll('button')].find(
            (b) => b.textContent === 'Show more'
        );
        expect(more).not.toBeNull();

        await act(async () => {
            more.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        });
        await act(async () => {});

        const latest = new URL(String(window.fetch.mock.calls.at(-1)[0]));
        expect(latest.searchParams.get('cursor')).toBe('cursor-2');

        /* Appended, not replaced — page 1 must not vanish when page 2 lands. */
        expect(container.textContent).toContain('Ayo');
        expect(container.textContent).toContain('Binta');
        unmount();
    });
});
