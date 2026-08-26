/**
 * Guest play stays on the device.
 *
 * `useProgressSync.test.js` proves the hook stays local when `getSuiteToken` is
 * absent or resolves to nothing. This file proves the *site's* wiring produces
 * that same state, which is a different claim: `App.jsx` passes `engineUrl` and
 * `getSuiteToken` unconditionally — there is no "guest mode" branch — so the
 * only thing standing between a guest and the network is that the shared token
 * store returns null. If that ever changed (a default token, a placeholder
 * string, an empty-string sentinel that reads as truthy), guest results would
 * start leaving the device and no hook-level test would notice.
 *
 * A guest's results are not discarded, either: they stay queued, and the first
 * sync after a sign-in settles them. That is asserted here too, because
 * "nothing is sent" and "nothing is kept" would be very different products.
 */
import { renderHook } from '../../../testUtils/renderHook.js';
import { createFakeEngine } from '../../../testUtils/fakeEngine.js';
import { useProgressSync } from '../../../hooks/useProgressSync.js';
import * as idbUtils from '../../../hooks/idbUtils.js';
import { clearSuiteToken, getSuiteToken, setSuiteToken } from '../suiteToken.js';

jest.mock('../../../hooks/idbUtils.js', () => {
    const store = new Map();
    return {
        __store: store,
        getRecord: jest.fn(async (storeName, key) => store.get(`${storeName}:${key}`) ?? null),
        putRecord: jest.fn(async (storeName, record) => {
            store.set(`${storeName}:${record.key}`, record);
            return true;
        }),
    };
});

const ENGINE_URL = 'https://rlc-api.sparxstar.com/api/v1';
const TOKEN = 'suite-token';

function getOutbox() {
    return idbUtils.__store.get('progress-outbox:progress-outbox:pending')?.events ?? [];
}

/** The site's wiring, verbatim: both props always supplied. */
function mountAsSiteDoes() {
    return renderHook(useProgressSync, {
        restUrl: 'https://dictionary.sparxstar.com/wp-json/sparxstar/v1/dictionary',
        engineUrl: ENGINE_URL,
        getSuiteToken,
    });
}

function result(runId, wordUuid) {
    return {
        type: 'game_result',
        run_id: runId,
        word_uuid: wordUuid,
        game: 'listen_write',
        outcome: 'correct',
        attempts: 1,
        time_ms: 1000,
    };
}

let engine;

beforeEach(() => {
    idbUtils.__store.clear();
    jest.clearAllMocks();
    clearSuiteToken();
    engine = createFakeEngine({ token: TOKEN });
    window.fetch = jest.fn(engine.fetch);
});

afterEach(() => {
    clearSuiteToken();
    delete window.fetch;
});

describe('guest play remains local', () => {
    it('makes no network call while signed out, even though engineUrl is configured', async () => {
        const { result: hook } = mountAsSiteDoes();

        await hook.current.addEvent(result('run-1', 'word-a'));
        await hook.current.addEvent(result('run-1', 'word-b'));
        await hook.current.syncNow();

        expect(window.fetch).not.toHaveBeenCalled();
        expect(engine.xpFor()).toBe(0);
    });

    it('keeps the guest results queued rather than discarding them', async () => {
        const { result: hook } = mountAsSiteDoes();

        await hook.current.addEvent(result('run-1', 'word-a'));
        await hook.current.syncNow();

        expect(getOutbox()).toHaveLength(1);
    });

    it('settles the results a guest already earned on the first sync after signing in', async () => {
        const { result: hook } = mountAsSiteDoes();

        /* Played as a guest. */
        await hook.current.addEvent(result('run-1', 'word-a'));
        await hook.current.addEvent(result('run-1', 'word-b'));
        await hook.current.syncNow();
        expect(window.fetch).not.toHaveBeenCalled();

        /* Then signs in. Nothing else about the wiring changes. */
        setSuiteToken(TOKEN);
        await hook.current.syncNow();

        expect(window.fetch).toHaveBeenCalledTimes(1);
        expect(engine.xpFor()).toBe(20);
        expect(getOutbox()).toHaveLength(0);
    });

    it('stops sending again after sign-out', async () => {
        const { result: hook } = mountAsSiteDoes();

        setSuiteToken(TOKEN);
        await hook.current.addEvent(result('run-1', 'word-a'));
        await hook.current.syncNow();
        expect(engine.xpFor()).toBe(10);

        clearSuiteToken();
        await hook.current.addEvent(result('run-1', 'word-b'));
        await hook.current.syncNow();

        expect(window.fetch).toHaveBeenCalledTimes(1); // no second flush
        expect(engine.xpFor()).toBe(10);
        expect(getOutbox()).toHaveLength(1); // held for the next sign-in
    });

    it('treats an empty-string token as no token, not as a credential', async () => {
        /* An empty Authorization header would be sent as `Bearer ` and rejected
         * by the engine, so the store must normalise it to null rather than let
         * it read as "signed in". */
        setSuiteToken('');
        const { result: hook } = mountAsSiteDoes();

        await hook.current.addEvent(result('run-1', 'word-a'));
        await hook.current.syncNow();

        expect(getSuiteToken()).toBeNull();
        expect(window.fetch).not.toHaveBeenCalled();
    });
});
