/**
 * The suite token must never reach persistent browser storage.
 *
 * This is the security invariant the whole sign-in design exists to hold, so it
 * is tested as an OBSERVED PROPERTY rather than as a promise about the code: a
 * complete authenticated flow is run — sign in, play a result, sync it, sign
 * out — and afterwards every place a token could have leaked is swept and
 * asserted empty. A future change that adds a "remember me" checkbox, caches
 * the token in the outbox record, or logs a request for debugging fails here
 * without anyone having to remember this rule.
 *
 * Swept: localStorage, sessionStorage, cookies, every IndexedDB record written
 * through idbUtils, every request URL, and everything passed to console.
 * `document.cookie` is included even though nothing writes one — the point is
 * that the sweep, not the author, decides whether a channel is clean.
 */
import { renderHook } from '../../../testUtils/renderHook.js';
import { createFakeEngine } from '../../../testUtils/fakeEngine.js';
import { useProgressSync } from '../../../hooks/useProgressSync.js';
import * as idbUtils from '../../../hooks/idbUtils.js';
import { clearSuiteToken, getSuiteToken, hasSuiteToken, setSuiteToken } from '../suiteToken.js';
import { login, logout } from '../identityClient.js';

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

/* A value distinctive enough that finding it anywhere is unambiguous. */
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.SUITE-TOKEN-CANARY-8f3a1c.signature';
const IDENTITY_URL = 'https://id.sparxstar.com';
const ENGINE_URL = 'https://rlc-api.sparxstar.com/api/v1';

/** Everything written to console during the flow, joined for scanning. */
let consoleOutput;
const consoleSpies = [];

function captureConsole() {
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
        consoleSpies.push(
            jest.spyOn(console, level).mockImplementation((...args) => {
                consoleOutput.push(args.map((a) => String(a)).join(' '));
            })
        );
    }
}

/** Every value reachable from a Storage area, as one string. */
function dumpStorage(storage) {
    const out = [];
    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        out.push(key, storage.getItem(key));
    }
    return out.join(' ');
}

/** Every record written through idbUtils, serialised. */
function dumpIndexedDb() {
    return JSON.stringify([...idbUtils.__store.entries()]);
}

beforeEach(() => {
    idbUtils.__store.clear();
    jest.clearAllMocks();
    consoleOutput = [];
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearSuiteToken();
    captureConsole();
});

afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    consoleSpies.length = 0;
    clearSuiteToken();
    delete window.fetch;
});

describe('the suite token never reaches persistent storage', () => {
    it('is absent from every storage channel after a full sign-in, play, sync and sign-out', async () => {
        const engine = createFakeEngine({ token: TOKEN });
        const requestUrls = [];

        window.fetch = jest.fn(async (url, init) => {
            requestUrls.push(String(url));
            if (String(url).endsWith('/auth/v1/login')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        accountId: 'acct-1',
                        token: TOKEN,
                        screenName: 'ada',
                        tier: 'adult',
                        schoolId: null,
                        classId: null,
                        expiresAt: Date.now() + 43_200_000,
                    }),
                };
            }
            if (String(url).endsWith('/auth/v1/logout')) {
                return { ok: true, status: 204, json: async () => ({}) };
            }
            return engine.fetch(url, init);
        });

        /* 1. Sign in, and store the token the only way the site ever does. */
        const session = await login({
            identityUrl: IDENTITY_URL,
            screenName: 'ada',
            password: 'a-correct-horse-battery-staple',
        });
        setSuiteToken(session.token);
        expect(hasSuiteToken()).toBe(true);

        /* 2. Play a word and 3. sync it — the only path that uses the token. */
        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dictionary.sparxstar.com/wp-json/sparxstar/v1/dictionary',
            engineUrl: ENGINE_URL,
            getSuiteToken,
        });
        await result.current.addEvent({
            type: 'game_result',
            run_id: 'run-1',
            word_uuid: 'word-a',
            game: 'listen_write',
            outcome: 'correct',
            attempts: 1,
            time_ms: 1000,
        });
        await result.current.syncNow();

        /* The token really was used — otherwise this test would pass trivially
         * by never having a token in play at all. */
        expect(engine.xpFor()).toBe(10);
        expect(window.fetch.mock.calls.some(([, init]) => init?.headers?.Authorization)).toBe(true);

        /* 4. Sign out. */
        await logout({ identityUrl: IDENTITY_URL, token: getSuiteToken() });
        clearSuiteToken();

        /* The sweep. */
        expect(dumpStorage(window.localStorage)).not.toContain(TOKEN);
        expect(dumpStorage(window.sessionStorage)).not.toContain(TOKEN);
        expect(document.cookie).not.toContain(TOKEN);
        expect(dumpIndexedDb()).not.toContain(TOKEN);
        expect(requestUrls.join(' ')).not.toContain(TOKEN);
        expect(consoleOutput.join(' ')).not.toContain(TOKEN);

        /* And nothing at all was persisted to the Storage areas — not a token
         * under another key, not a flag naming one. */
        expect(window.localStorage.length).toBe(0);
        expect(window.sessionStorage.length).toBe(0);
    });

    it('does not log the token when a sync fails', async () => {
        setSuiteToken(TOKEN);
        window.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

        const { result } = renderHook(useProgressSync, {
            restUrl: 'https://dictionary.sparxstar.com/wp-json/sparxstar/v1/dictionary',
            engineUrl: ENGINE_URL,
            getSuiteToken,
        });
        await result.current.addEvent({
            type: 'game_result',
            run_id: 'run-1',
            word_uuid: 'word-a',
            outcome: 'correct',
            attempts: 1,
            time_ms: 1000,
        });
        await result.current.syncNow();

        /* A 401 is exactly when a developer reaches for "log the header to see
         * what we sent". It must stay a status code. */
        expect(consoleOutput.length).toBeGreaterThan(0);
        expect(consoleOutput.join(' ')).not.toContain(TOKEN);
    });

    it('is gone from memory after clearSuiteToken, so a sign-out cannot be undone', () => {
        setSuiteToken(TOKEN);
        expect(getSuiteToken()).toBe(TOKEN);

        clearSuiteToken();

        expect(getSuiteToken()).toBeNull();
        expect(hasSuiteToken()).toBe(false);
    });

    it('holds nothing at module load, so a fresh page starts signed out', async () => {
        /* The refresh case, stated as a test: a new realm has no token, which
         * is why the site asks for a sign-in again rather than silently
         * restoring one from somewhere. */
        jest.resetModules();
        const fresh = await import('../suiteToken.js');
        expect(fresh.getSuiteToken()).toBeNull();
        expect(fresh.hasSuiteToken()).toBe(false);
    });
});
