/**
 * useGameSession — the run identifier.
 *
 * The engine's per-question award claim is keyed on
 * `(game_type, run_id, question_id, account_id)`, and `run_id` comes from here.
 * Two properties of it decide whether rewards are correct, and they pull in
 * opposite directions, so both are pinned:
 *
 *   STABLE within a run — every result from one play-through must share it, or
 *   each answer becomes its own "run" and re-answering a word after a refresh
 *   would pay again.
 *
 *   UNIQUE across runs — a new play-through must get a new one, or the second
 *   time a player works through the same word list nothing settles and the
 *   games silently stop paying.
 */
import { act } from 'react';
import { renderHook } from '../../testUtils/renderHook.js';
import { useGameSession } from '../useGameSession.js';
import * as idbUtils from '../idbUtils.js';

jest.mock('../idbUtils.js', () => {
    const store = new Map();
    return {
        __store: store,
        getRecord: jest.fn(async (storeName, key) => store.get(`${storeName}:${key}`) ?? null),
        putRecord: jest.fn(async (storeName, record) => {
            store.set(`${storeName}:${record.key}`, record);
            return true;
        }),
        deleteRecord: jest.fn(async (storeName, key) => {
            store.delete(`${storeName}:${key}`);
        }),
    };
});

const WORDS = [{ uuid: 'word-a' }, { uuid: 'word-b' }];

function savedSession() {
    return idbUtils.__store.get('game-sessions:game-session:current');
}

/*
 * Hook callbacks that setState must run inside act(), or React batches the
 * update out of view and `result.current.session` is still the previous value
 * when the assertion runs.
 */
async function startSession(hook, gameType = 'listen_write') {
    await act(async () => {
        await hook.current.initSession({
            gameType,
            langSource: 'mandinka',
            domain: '',
            words: WORDS,
        });
    });
}

async function record(hook, ...args) {
    let returned;
    await act(async () => {
        returned = await hook.current.recordResult(...args);
    });
    return returned;
}

beforeEach(() => {
    idbUtils.__store.clear();
    jest.clearAllMocks();
});

describe('run identifier', () => {
    it('stamps a new session with a run id and persists it', async () => {
        const { result } = renderHook(useGameSession, {});
        await startSession(result);

        const { runId } = savedSession();
        expect(typeof runId).toBe('string');
        expect(runId.length).toBeGreaterThan(0);
        expect(result.current.session.runId).toBe(runId);
    });

    it('keeps the same run id across every result in one play-through', async () => {
        const { result } = renderHook(useGameSession, {});
        await startSession(result);
        const runId = result.current.session.runId;

        const afterFirst = await record(result, 'word-a', 'correct', 1, 10, 900);
        const afterSecond = await record(result, 'word-b', 'learning', 2, 5, 1800);

        expect(afterFirst.runId).toBe(runId);
        expect(afterSecond.runId).toBe(runId);
        expect(savedSession().runId).toBe(runId);
    });

    it('mints a different run id for the next play-through', async () => {
        const { result } = renderHook(useGameSession, {});

        await startSession(result);
        const first = result.current.session.runId;
        await startSession(result);
        const second = result.current.session.runId;

        expect(second).not.toBe(first);
    });

    it('survives completion — a completed run keeps the id its results were reported under', async () => {
        const { result } = renderHook(useGameSession, {});
        await startSession(result);
        const runId = result.current.session.runId;

        await record(result, 'word-a', 'correct', 1, 10, 900);
        await act(async () => {
            await result.current.completeSession();
        });

        expect(savedSession().runId).toBe(runId);
        expect(savedSession().completedAt).toEqual(expect.any(Number));
    });

    it('backfills a run id when resuming a session written before run ids existed', async () => {
        /* A session persisted by an older build. Without a backfill its results
         * would carry an empty run id and the engine would refuse every one of
         * them (`run_id_required`) for the rest of the run. */
        idbUtils.__store.set('game-sessions:game-session:current', {
            key: 'game-session:current',
            gameType: 'listen_write',
            langSource: 'mandinka',
            domain: '',
            words: WORDS,
            currentIndex: 1,
            results: [],
            xpEarned: 0,
            startedAt: Date.now() - 60_000,
            completedAt: null,
        });

        let result;
        await act(async () => {
            ({ result } = renderHook(useGameSession, {}));
            /* Let the mount effect's async load settle inside act. */
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(typeof result.current.session.runId).toBe('string');
        expect(result.current.session.runId.length).toBeGreaterThan(0);
        /* Persisted, so a later reload resumes the same run rather than
         * splitting one play-through across two claim keys. */
        expect(savedSession().runId).toBe(result.current.session.runId);
    });

    it('stays inside the engine run-id budget once the solo prefix is applied', async () => {
        const { result } = renderHook(useGameSession, {});
        await startSession(result);

        expect(`solo:${result.current.session.runId}`.length).toBeLessThanOrEqual(128);
    });
});
