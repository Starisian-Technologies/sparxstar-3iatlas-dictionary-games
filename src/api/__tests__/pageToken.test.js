/**
 * pageToken — page-token header + one-shot refresh/retry on 401.
 *
 * This is the behaviour the dictionary repo's now-deleted GameShell copy had
 * and this package was missing on /domains. These tests pin it so the two
 * call sites (useGameSet's /game-set, GameShell's /domains) can share one
 * implementation without either quietly losing the retry again.
 */
import { currentPageToken, refreshPageToken, fetchWithPageToken } from '../pageToken.js';

const REST = 'https://dict.example/wp-json/sparxstar/v1/dictionary';

function jsonResponse(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Header value from a recorded fetch call. */
function sentToken(call) {
    return call[1].headers['X-Page-Token'];
}

beforeEach(() => {
    window.fetch = jest.fn();
    window.sparxstarDictionarySettings = { pageToken: 'initial-token' };
});

afterEach(() => {
    delete window.fetch;
    delete window.sparxstarDictionarySettings;
});

describe('currentPageToken', () => {
    it('reads the token the host page published', () => {
        expect(currentPageToken()).toBe('initial-token');
    });

    it('returns empty string when the host published no settings', () => {
        delete window.sparxstarDictionarySettings;
        expect(currentPageToken()).toBe('');
    });
});

describe('refreshPageToken', () => {
    it('fetches GET /page-token and stores the new token on the host settings', async () => {
        window.fetch.mockResolvedValue(jsonResponse({ data: { token: 'fresh' } }));

        await expect(refreshPageToken(REST)).resolves.toBe('fresh');
        expect(window.fetch).toHaveBeenCalledWith(`${REST}/page-token`);
        expect(window.sparxstarDictionarySettings.pageToken).toBe('fresh');
    });

    it('returns empty string and leaves the old token alone when refresh fails', async () => {
        window.fetch.mockResolvedValue(jsonResponse({}, 500));

        await expect(refreshPageToken(REST)).resolves.toBe('');
        expect(window.sparxstarDictionarySettings.pageToken).toBe('initial-token');
    });

    it('swallows a network rejection rather than surfacing it to the caller', async () => {
        window.fetch.mockRejectedValue(new Error('offline'));

        await expect(refreshPageToken(REST)).resolves.toBe('');
    });
});

describe('fetchWithPageToken', () => {
    it('sends the current page token as X-Page-Token', async () => {
        window.fetch.mockResolvedValue(jsonResponse({ success: true }));

        await fetchWithPageToken(`${REST}/domains`, REST);

        expect(window.fetch).toHaveBeenCalledTimes(1);
        expect(sentToken(window.fetch.mock.calls[0])).toBe('initial-token');
    });

    it('refreshes once and retries with the new token on a 401', async () => {
        window.fetch
            .mockResolvedValueOnce(jsonResponse({}, 401)) // first /domains
            .mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh' } })) // /page-token
            .mockResolvedValueOnce(jsonResponse({ success: true })); // retried /domains

        const res = await fetchWithPageToken(`${REST}/domains`, REST);

        expect(res.status).toBe(200);
        const [first, refresh, retry] = window.fetch.mock.calls;
        expect(first[0]).toBe(`${REST}/domains`);
        expect(sentToken(first)).toBe('initial-token');
        expect(refresh[0]).toBe(`${REST}/page-token`);
        expect(retry[0]).toBe(`${REST}/domains`);
        expect(sentToken(retry)).toBe('fresh');
    });

    it('retries at most once — a second 401 is returned, not re-retried', async () => {
        window.fetch
            .mockResolvedValueOnce(jsonResponse({}, 401))
            .mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh' } }))
            .mockResolvedValueOnce(jsonResponse({}, 401));

        const res = await fetchWithPageToken(`${REST}/domains`, REST);

        expect(res.status).toBe(401);
        expect(window.fetch).toHaveBeenCalledTimes(3); // request, refresh, one retry
    });

    it('does not retry a non-401 failure', async () => {
        window.fetch.mockResolvedValue(jsonResponse({}, 500));

        const res = await fetchWithPageToken(`${REST}/domains`, REST);

        expect(res.status).toBe(500);
        expect(window.fetch).toHaveBeenCalledTimes(1);
    });

    it('still retries when the refresh yielded no token, letting the server answer', async () => {
        window.fetch
            .mockResolvedValueOnce(jsonResponse({}, 401))
            .mockResolvedValueOnce(jsonResponse({}, 500)) // refresh fails
            .mockResolvedValueOnce(jsonResponse({}, 401));

        const res = await fetchWithPageToken(`${REST}/domains`, REST);

        expect(res.status).toBe(401);
        expect(sentToken(window.fetch.mock.calls[2])).toBe('');
    });

    it('preserves caller init and lets the live token win over a passed-in one', async () => {
        window.fetch.mockResolvedValue(jsonResponse({ success: true }));
        const controller = new AbortController();

        await fetchWithPageToken(`${REST}/domains`, REST, {
            signal: controller.signal,
            headers: { 'X-Page-Token': 'stale', Accept: 'application/json' },
        });

        const [, init] = window.fetch.mock.calls[0];
        expect(init.signal).toBe(controller.signal);
        expect(init.headers.Accept).toBe('application/json');
        expect(init.headers['X-Page-Token']).toBe('initial-token');
    });
});
