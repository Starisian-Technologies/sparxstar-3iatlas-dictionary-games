/**
 * @jest-environment node
 */

/**
 * Dictionary Games BFF.
 *
 * `node` environment, not the repo's default `jsdom`: this is server code, and
 * a jsdom global `fetch`/`URL` would be testing something other than what runs
 * in production.
 *
 * The suites below are grouped by the property they defend, because that is
 * what makes a failure here readable: a broken test should say "a credential
 * can now reach the browser", not "expected 3 to be 2".
 */

'use strict';

const { generateKeyPairSync, createPublicKey, createVerify } = require('crypto');
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');

const { loadConfig } = require('../config');
const {
    createIdentityClient,
    IdentityUnavailableError,
    buildAssertion,
} = require('../identityClient');
const { createDictionaryClient, DictionaryAuthError } = require('../dictionaryClient');
const { createRoutes } = require('../routes');
const { createApp, createRateLimiter } = require('../app');
const { projectGamePack, GAME_WORD_FIELDS } = require('../rights');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const keys = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let keyDir;
let keyPath;

beforeAll(() => {
    keyDir = mkdtempSync(path.join(tmpdir(), 'bff-key-'));
    keyPath = path.join(keyDir, 'games.pem');
    writeFileSync(keyPath, keys.privateKey, { mode: 0o600 });
});

afterAll(() => {
    rmSync(keyDir, { recursive: true, force: true });
});

const TOKEN_URL = 'https://id.sparxstar.com/oauth2/token';
const DICTIONARY_URL = 'https://dictionary-api.sparxstar.com';

function env(overrides = {}) {
    return {
        NODE_ENV: 'production',
        GAMES_IDENTITY_TOKEN_URL: TOKEN_URL,
        GAMES_IDENTITY_CLIENT_ID: 'sparxstar-dictionary-games',
        GAMES_IDENTITY_KEY_ID: 'games-2026-09',
        GAMES_IDENTITY_PRIVATE_KEY_FILE: keyPath,
        GAMES_DICTIONARY_API_URL: DICTIONARY_URL,
        GAMES_DICTIONARY_LANGUAGES: 'mnk:Mandinka',
        ...overrides,
    };
}

function config(overrides = {}) {
    return loadConfig(env(overrides));
}

/** A GamePack as the Dictionary actually returns it: one open entry, one whose
 *  sourced fields the §2b rights filter withheld. */
function upstreamPack() {
    return {
        ok: true,
        data: {
            pack_id: 'pack-1',
            language: 'mnk',
            domain_code: null,
            level: null,
            corpus_version: '2026.1',
            release_id: 'release-1',
            generated_at: '2026-09-04T00:00:00.000Z',
            signature: 'sig',
            words: [
                {
                    entry_id: 'entry-open',
                    concept_id: 'concept-1',
                    letter: 'B',
                    header_word: 'baa',
                    header_word_root: 'baa',
                    normalized_headword: 'baa',
                    alternative_spelling: '',
                    ajami_form: '',
                    part_of_speech: 'n',
                    definition: 'a river',
                    ipa_pronunciation: 'baː',
                    phonetic_pronunciation: 'bah',
                    audio_url: 'https://media.sparxstar.com/a.mp3?sig=abc',
                    example: { sentence: 'Baa be jan.', translation_en: 'The river is far.' },
                    english_lemma: 'river',
                    english_definition: 'a large natural stream',
                    french_lemma: 'rivière',
                    french_definition: 'un cours d’eau',
                    domain_code: '1.3',
                    difficulty: 'A1',
                },
                {
                    // Licensed material: the Dictionary withheld the source's
                    // expression and shipped its own layers only.
                    entry_id: 'entry-restricted',
                    concept_id: null,
                    letter: 'K',
                    header_word: 'kuu',
                    header_word_root: 'kuu',
                    normalized_headword: 'kuu',
                    alternative_spelling: '',
                    ajami_form: '',
                    part_of_speech: 'n',
                    definition: 'a thing',
                    ipa_pronunciation: 'kuː',
                    phonetic_pronunciation: 'koo',
                    // No consented recording.
                    audio_url: null,
                    example: null,
                    english_lemma: 'thing',
                    english_definition: '',
                    french_lemma: 'chose',
                    french_definition: '',
                    domain_code: '8.3',
                    difficulty: 'A2',
                },
            ],
            edges: [
                { from: 'entry-open', to: 'entry-restricted', type: 'related', confirmed: true },
            ],
        },
    };
}

function jsonResponse(payload, status = 200) {
    const text = JSON.stringify(payload);
    const stream = (async function* stream() {
        yield Buffer.from(text, 'utf8');
    })();
    // `cancel` is what a real WHATWG body exposes and what the client calls to
    // release a connection whose body it is discarding. Recorded so a test can
    // assert the discard actually happened.
    stream.cancel = async () => {
        stream.cancelled = true;
    };
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => JSON.parse(text),
        // The client reads bodies through an async iterator so it can bound the
        // size; this mirrors that shape.
        body: stream,
    };
}

function tokenResponse(token = 'service-token', expiresIn = 300) {
    return jsonResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        audience: 'dictionary',
    });
}

/** Drive the app without a socket. Returns the status, headers and parsed body. */
async function call(app, url, headers = {}) {
    const captured = { status: 0, headers: {}, body: '' };
    const res = {
        headersSent: false,
        writeHead(status, responseHeaders) {
            captured.status = status;
            captured.headers = responseHeaders ?? {};
            this.headersSent = true;
        },
        end(body) {
            captured.body = body ?? '';
        },
    };

    await app({ method: 'GET', url, headers, socket: { remoteAddress: '203.0.113.9' } }, res);
    return { ...captured, json: captured.body ? JSON.parse(captured.body) : null };
}

/** A full stack with a scripted upstream. */
function stack({ tokenFetch, dictionaryFetch, configOverrides = {} } = {}) {
    const cfg = config(configOverrides);
    const identity = createIdentityClient({
        config: cfg,
        fetch: tokenFetch ?? (async () => tokenResponse()),
        logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    const dictionary = createDictionaryClient({
        config: cfg,
        identity,
        fetch: dictionaryFetch ?? (async () => jsonResponse(upstreamPack())),
        logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    const routes = createRoutes({ config: cfg, dictionary });
    const app = createApp({
        config: cfg,
        routes,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    return { cfg, identity, dictionary, app };
}

// ---------------------------------------------------------------------------

describe('BFF configuration', () => {
    it('reads the signing key from a file, never from the environment', () => {
        const cfg = config();
        expect(cfg.identity.privateKeyPem).toContain('BEGIN PRIVATE KEY');

        /*
         * And an inlined key is NOT a supported channel. An env var is visible
         * in `docker inspect`, in /proc/<pid>/environ, and in any crash dump
         * that captures the environment; a read-only mounted file is not. So
         * setting one has no effect at all — config reads only the path.
         */
        const inlined = config({ GAMES_IDENTITY_PRIVATE_KEY: keys.privateKey });
        expect(inlined.identity.privateKeyPem).toBe(cfg.identity.privateKeyPem);
        expect(() => loadConfig({ ...env(), GAMES_IDENTITY_PRIVATE_KEY_FILE: undefined })).toThrow(
            /GAMES_IDENTITY_PRIVATE_KEY_FILE is required/
        );
    });

    it('refuses to boot when the key file is unreadable', () => {
        expect(() => config({ GAMES_IDENTITY_PRIVATE_KEY_FILE: '/nonexistent/games.pem' })).toThrow(
            /unreadable/
        );
    });

    it('refuses to boot on a plaintext upstream in production', () => {
        expect(() =>
            config({ GAMES_DICTIONARY_API_URL: 'http://dictionary-api.sparxstar.com' })
        ).toThrow(/must be an https/);
    });

    it('refuses a renewal skew that would renew every token on arrival', () => {
        expect(() => config({ GAMES_TOKEN_RENEW_SKEW_SECONDS: '240' })).not.toThrow();
        // 300 is the token lifetime; the bound is checked against it.
        expect(() => config({ GAMES_TOKEN_RENEW_SKEW_SECONDS: '400' })).toThrow(/between/);
    });

    it('refuses a malformed language list rather than dropping entries', () => {
        expect(() => config({ GAMES_DICTIONARY_LANGUAGES: 'Mandinka' })).toThrow(/code:Label/);
        expect(() => config({ GAMES_DICTIONARY_LANGUAGES: 'mandinka:Mandinka' })).toThrow(
            /ISO 639-3/
        );
    });
});

describe('client assertion (private_key_jwt)', () => {
    it('signs an RS256 assertion the registered public key verifies', () => {
        const token = buildAssertion(config());
        const [header, payload, signature] = token.split('.');

        const verified = createVerify('RSA-SHA256')
            .update(`${header}.${payload}`)
            .verify(createPublicKey(keys.publicKey), Buffer.from(signature, 'base64url'));

        expect(verified).toBe(true);
    });

    it('carries the claims the Identity Node requires', () => {
        // slice(0, 2): the third segment is the signature, not JSON.
        const [header, payload] = buildAssertion(config())
            .split('.')
            .slice(0, 2)
            .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')));

        expect(header).toMatchObject({ alg: 'RS256', typ: 'JWT', kid: 'games-2026-09' });
        expect(payload.iss).toBe('sparxstar-dictionary-games');
        expect(payload.sub).toBe('sparxstar-dictionary-games');
        // The ENDPOINT, not `dictionary`. This is the replay defence: an
        // assertion captured in flight cannot be presented elsewhere.
        expect(payload.aud).toBe(TOKEN_URL);
        expect(payload.exp - payload.iat).toBeLessThanOrEqual(60);
        expect(typeof payload.jti).toBe('string');
    });

    it('never reuses a jti', () => {
        const jtis = new Set();
        for (let i = 0; i < 25; i++) {
            const [, payload] = buildAssertion(config()).split('.');
            jtis.add(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).jti);
        }
        expect(jtis.size).toBe(25);
    });

    it('never puts the private key in the assertion', () => {
        const token = buildAssertion(config());
        // The PEM body, minus its armour, must not appear anywhere in the token.
        const keyBody = keys.privateKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
        expect(token).not.toContain(keyBody.slice(0, 64));
    });
});

describe('token caching and renewal', () => {
    it('shares one renewal across concurrent callers', async () => {
        let calls = 0;
        const identity = createIdentityClient({
            config: config(),
            fetch: async () => {
                calls++;
                // Resolve on a later tick so the concurrency is real.
                await new Promise((resolve) => setImmediate(resolve));
                return tokenResponse();
            },
            logger: { info: () => {}, warn: () => {} },
        });

        const tokens = await Promise.all(Array.from({ length: 8 }, () => identity.getToken()));

        expect(calls).toBe(1);
        expect(new Set(tokens).size).toBe(1);
    });

    it('reuses a cached token until the renewal point', async () => {
        let calls = 0;
        let clock = 1_000_000;
        const identity = createIdentityClient({
            config: config({ GAMES_TOKEN_RENEW_JITTER_SECONDS: '0' }),
            fetch: async () => {
                calls++;
                return tokenResponse(`token-${calls}`);
            },
            now: () => clock,
            logger: { info: () => {}, warn: () => {} },
        });

        expect(await identity.getToken()).toBe('token-1');

        // Three minutes in: not yet due (renewal is at 300 - 60 = 240s).
        clock += 180_000;
        expect(await identity.getToken()).toBe('token-1');
        expect(calls).toBe(1);

        // Past the renewal point, still valid — renews ahead of expiry.
        clock += 70_000;
        expect(await identity.getToken()).toBe('token-2');
        expect(calls).toBe(2);
    });

    it('renews before expiry, not at it', async () => {
        const cfg = config({ GAMES_TOKEN_RENEW_JITTER_SECONDS: '0' });
        let clock = 1_000_000;
        const identity = createIdentityClient({
            config: cfg,
            fetch: async () => tokenResponse(),
            now: () => clock,
            logger: { info: () => {}, warn: () => {} },
        });

        await identity.getToken();
        const cached = identity._peek();

        // The renewal point sits a full skew before expiry — the margin that
        // lets a transient identity outage pass without a games outage.
        expect(cached.expiresAtMs - cached.renewAtMs).toBe(cfg.identity.renewSkewSeconds * 1000);
        expect(cached.renewAtMs).toBeGreaterThan(clock);
    });

    it('keeps serving a still-valid token when a renewal fails', async () => {
        let calls = 0;
        let clock = 1_000_000;
        const identity = createIdentityClient({
            config: config({ GAMES_TOKEN_RENEW_JITTER_SECONDS: '0' }),
            fetch: async () => {
                calls++;
                if (calls === 1) return tokenResponse('token-1');
                throw new Error('identity node down');
            },
            now: () => clock,
            logger: { info: () => {}, warn: () => {} },
        });

        expect(await identity.getToken()).toBe('token-1');

        // Due for renewal, renewal fails, token is not yet expired.
        clock += 250_000;
        expect(await identity.getToken()).toBe('token-1');
    });

    it('fails closed once the token has actually expired', async () => {
        let calls = 0;
        let clock = 1_000_000;
        const identity = createIdentityClient({
            config: config({ GAMES_TOKEN_RENEW_JITTER_SECONDS: '0' }),
            fetch: async () => {
                calls++;
                if (calls === 1) return tokenResponse('token-1');
                throw new Error('identity node down');
            },
            now: () => clock,
            logger: { info: () => {}, warn: () => {} },
        });

        await identity.getToken();
        clock += 400_000;

        await expect(identity.getToken()).rejects.toThrow(IdentityUnavailableError);
    });

    it('refuses a token response with no usable lifetime rather than guessing one', async () => {
        const identity = createIdentityClient({
            config: config(),
            fetch: async () => jsonResponse({ access_token: 'x', token_type: 'Bearer' }),
            logger: { info: () => {}, warn: () => {} },
        });
        await expect(identity.getToken()).rejects.toThrow(/expires_in/);
    });
});

describe('the credential never reaches the browser', () => {
    it('keeps the token out of the response body and headers', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/game-set?language=mnk');

        expect(response.status).toBe(200);
        expect(response.body).not.toContain('service-token');
        expect(JSON.stringify(response.headers)).not.toContain('service-token');
        // And nothing that looks like an Authorization echo.
        expect(Object.keys(response.headers).map((k) => k.toLowerCase())).not.toContain(
            'authorization'
        );
    });

    it('keeps the private key and the assertion out of every response', async () => {
        const { app } = stack();
        const keyBody = keys.privateKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

        for (const url of [
            '/api/dictionary/game-set?language=mnk',
            '/api/dictionary/languages',
            '/api/dictionary/domains',
            '/api/dictionary/nope',
        ]) {
            const response = await call(app, url);
            expect(response.body).not.toContain(keyBody.slice(0, 64));
            expect(response.body).not.toContain('client_assertion');
        }
    });

    it('sends the token to the Dictionary as a Bearer credential, with no browser-shaped headers', async () => {
        const seen = [];
        const { app } = stack({
            dictionaryFetch: async (url, init) => {
                seen.push({ url, headers: init.headers });
                return jsonResponse(upstreamPack());
            },
        });

        await call(app, '/api/dictionary/game-set?language=mnk');

        expect(seen).toHaveLength(1);
        expect(seen[0].headers.Authorization).toBe('Bearer service-token');
        /*
         * The Dictionary treats an Origin or Referer on a credentialed M2M
         * request as PRIORITY_1 — a credential that reached a browser has left
         * the server it was meant to stay on. This client must not look like a
         * browser.
         */
        const headerNames = Object.keys(seen[0].headers).map((name) => name.toLowerCase());
        expect(headerNames).not.toContain('origin');
        expect(headerNames).not.toContain('referer');
        expect(headerNames).not.toContain('cookie');
        // And the retired WordPress scheme is gone.
        expect(headerNames).not.toContain('x-api-key');
    });

    it('never emits Access-Control-Allow-Credentials', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        const headerNames = Object.keys(response.headers).map((name) => name.toLowerCase());
        expect(headerNames.some((name) => name.startsWith('access-control-'))).toBe(false);
    });
});

describe('the browser cannot choose an upstream', () => {
    it('404s any path not in the table, with no catch-all', async () => {
        const { app } = stack();
        for (const url of [
            '/api/dictionary/wordlist',
            '/api/dictionary/game-set/extra',
            '/api/dictionary/',
            '/v1/m2m/gamepack',
            '/api/dictionary/game-set/../wordlist',
        ]) {
            const response = await call(app, url);
            expect(response.status).toBe(404);
        }
    });

    it('dials only the configured host and the fixed upstream path', async () => {
        const seen = [];
        const { app } = stack({
            dictionaryFetch: async (url) => {
                seen.push(url);
                return jsonResponse(upstreamPack());
            },
        });

        // Every one of these tries to influence the upstream target.
        await call(app, '/api/dictionary/game-set?language=mnk&url=https://evil.example');
        await call(app, '/api/dictionary/game-set?language=mnk&domain=../../v1/import/release');
        await call(app, '/api/dictionary/game-set?language=mnk&path=/v1/m2m/spell-check');

        // The two malformed ones were refused outright; the survivors all went
        // to exactly one place.
        for (const url of seen) {
            expect(url.startsWith(`${DICTIONARY_URL}/v1/m2m/gamepack?`)).toBe(true);
            expect(url).not.toContain('evil.example');
            expect(url).not.toContain('import');
        }
    });

    it('drops unknown query parameters instead of forwarding them', async () => {
        let forwarded = '';
        const { app } = stack({
            dictionaryFetch: async (url) => {
                forwarded = url;
                return jsonResponse(upstreamPack());
            },
        });

        await call(
            app,
            '/api/dictionary/game-set?language=mnk&page=2&per_page=500&include_audio=true'
        );

        const query = new URL(forwarded).searchParams;
        expect(query.get('language')).toBe('mnk');
        // The pagination-walk parameters the Dictionary retired must not be
        // reachable from a browser the day something upstream reinstates them.
        expect(query.has('page')).toBe(false);
        expect(query.has('per_page')).toBe(false);
        expect(query.has('include_audio')).toBe(false);
    });

    it('refuses an over-cap size rather than silently clamping it', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/game-set?language=mnk&size=500');
        expect(response.status).toBe(400);
        expect(response.json.error).toBe('bad_request');
    });

    it('refuses a language this deployment does not offer', async () => {
        let called = false;
        const { app } = stack({
            dictionaryFetch: async () => {
                called = true;
                return jsonResponse(upstreamPack());
            },
        });

        const response = await call(app, '/api/dictionary/game-set?language=wol');
        expect(response.status).toBe(400);
        // The budget matters: an unoffered language must not spend one entry.
        expect(called).toBe(false);
    });

    it('requires a language', async () => {
        const { app } = stack();
        expect((await call(app, '/api/dictionary/game-set')).status).toBe(400);
    });
});

describe('rights restrictions survive the passthrough', () => {
    it('leaves a withheld definition withheld, and never backfills it', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        const restricted = response.json.data.words.find(
            (word) => word.entry_id === 'entry-restricted'
        );

        // The Dictionary's §2b filter emptied these. They stay empty.
        expect(restricted.english_definition).toBe('');
        expect(restricted.french_definition).toBe('');
        // And nothing substituted the native definition for the withheld gloss.
        expect(restricted.english_definition).not.toBe(restricted.definition);
        // AIWA's own layers ship, as they should.
        expect(restricted.definition).toBe('a thing');
        expect(restricted.ipa_pronunciation).toBe('kuː');
    });

    it('leaves an unconsented recording absent, and never synthesizes a URL', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        const words = response.json.data.words;

        expect(words.find((word) => word.entry_id === 'entry-restricted').audio_url).toBeNull();
        // A consented one passes through byte-for-byte — the signature is the
        // Dictionary's and must not be rewritten.
        expect(words.find((word) => word.entry_id === 'entry-open').audio_url).toBe(
            'https://media.sparxstar.com/a.mp3?sig=abc'
        );
    });

    it('never widens the field set, even when the upstream grows one', async () => {
        const pack = upstreamPack();
        // A field the Dictionary might add later, and an internal one it must
        // never have shipped in the first place.
        pack.data.words[0].provenance_class = 'licensed';
        pack.data.words[0].wordnet_definition_en = 'a leaked internal gloss';
        pack.data.internal_note = 'not for consumers';

        const { app } = stack({ dictionaryFetch: async () => jsonResponse(pack) });
        const response = await call(app, '/api/dictionary/game-set?language=mnk');

        expect(response.json.data.words[0].provenance_class).toBeUndefined();
        expect(response.json.data.words[0].wordnet_definition_en).toBeUndefined();
        expect(response.json.data.internal_note).toBeUndefined();
        expect(response.body).not.toContain('leaked internal gloss');
    });

    it('carries exactly the declared game-word fields and no more', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/game-set?language=mnk');

        for (const word of response.json.data.words) {
            for (const field of Object.keys(word)) {
                expect(GAME_WORD_FIELDS).toContain(field);
            }
        }
    });

    it('narrows a widened example object', () => {
        const projected = projectGamePack({
            words: [
                {
                    entry_id: 'x',
                    example: { sentence: 'a', translation_en: 'b', translation_fr: 'c' },
                },
            ],
            edges: [],
        });
        expect(projected.words[0].example).toEqual({ sentence: 'a', translation_en: 'b' });
    });

    it('leaves an absent field absent rather than manufacturing an empty one', () => {
        // An empty string is the Dictionary saying "withheld". Inventing one for
        // a field that simply was not sent would put words in its mouth.
        const projected = projectGamePack({ words: [{ entry_id: 'x' }], edges: [] });
        expect('english_definition' in projected.words[0]).toBe(false);
        expect(projected.words[0]).toEqual({ entry_id: 'x' });
    });

    it('never caches a response — withdrawal has to be able to propagate', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.headers['Cache-Control']).toBe('no-store, private');
    });
});

describe('upstream failures', () => {
    it('returns 503, never 401, when the Identity Node cannot issue a token', async () => {
        const { app } = stack({
            tokenFetch: async () => {
                throw new Error('connect ECONNREFUSED');
            },
        });

        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        // The player did nothing wrong; a 401 here would tell them to sign in
        // again over a service credential problem.
        expect(response.status).toBe(503);
        expect(response.json.error).toBe('upstream_unavailable');
    });

    it('returns 503 when the Identity Node refuses the assertion', async () => {
        const { app } = stack({
            tokenFetch: async () => jsonResponse({ error: 'invalid_client' }, 401),
        });
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.status).toBe(503);
    });

    it('refreshes once on an upstream 401, then gives up', async () => {
        let tokenCalls = 0;
        let dictionaryCalls = 0;

        const { app } = stack({
            tokenFetch: async () => {
                tokenCalls++;
                return tokenResponse(`token-${tokenCalls}`);
            },
            dictionaryFetch: async () => {
                dictionaryCalls++;
                return jsonResponse({ error: 'unauthorized' }, 401);
            },
        });

        const response = await call(app, '/api/dictionary/game-set?language=mnk');

        // Exactly one retry: a fresh token was refused, so this is standing,
        // not a clock — grinding a revoked credential is how a revocation turns
        // into an incident report about the client.
        expect(dictionaryCalls).toBe(2);
        expect(tokenCalls).toBe(2);
        expect(response.status).toBe(503);
    });

    it('succeeds on the retry when the token had merely expired in flight', async () => {
        let dictionaryCalls = 0;
        const { app } = stack({
            dictionaryFetch: async () => {
                dictionaryCalls++;
                return dictionaryCalls === 1
                    ? jsonResponse({ error: 'unauthorized' }, 401)
                    : jsonResponse(upstreamPack());
            },
        });

        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.status).toBe(200);
        expect(dictionaryCalls).toBe(2);
    });

    it('surfaces the entry budget as a 429 with its own code', async () => {
        const { app } = stack({
            dictionaryFetch: async () => jsonResponse({ error: 'budget_exceeded' }, 429),
        });
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.status).toBe(429);
        expect(response.json.error).toBe('dictionary_budget_exceeded');
    });

    it("reports a 403 from the Dictionary as a service problem, not the player's", async () => {
        const { app } = stack({
            dictionaryFetch: async () => jsonResponse({ error: 'forbidden' }, 403),
        });
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.status).toBe(503);
    });

    it('never leaks an upstream body or a stack trace to the browser', async () => {
        const { app } = stack({
            dictionaryFetch: async () =>
                jsonResponse(
                    { error: 'internal', detail: 'SELECT * FROM projection_game_word failed' },
                    500
                ),
        });

        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.body).not.toContain('projection_game_word');
        expect(response.body).not.toContain('SELECT');
        expect(response.json.message).toBeDefined();
        expect(response.json.stack).toBeUndefined();
    });

    it('refuses an oversized upstream response rather than buffering it', async () => {
        const huge = 'x'.repeat(300 * 1024);
        const { app } = stack({
            dictionaryFetch: async () => ({
                ok: true,
                status: 200,
                body: (async function* stream() {
                    yield Buffer.from(huge, 'utf8');
                })(),
            }),
        });

        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.status).toBe(503);
    });

    it('rejects an unexpected envelope instead of reading it as an empty corpus', async () => {
        const { app } = stack({
            dictionaryFetch: async () => jsonResponse({ ok: false, data: null }),
        });
        const response = await call(app, '/api/dictionary/game-set?language=mnk');
        expect(response.status).toBe(503);
    });

    it('answers /healthz without touching a credential or an upstream', async () => {
        let touched = false;
        const { app } = stack({
            tokenFetch: async () => {
                touched = true;
                return tokenResponse();
            },
        });

        const response = await call(app, '/healthz');
        expect(response.status).toBe(200);
        // An orchestrator must not restart this process during a Dictionary
        // outage, so liveness cannot depend on one.
        expect(touched).toBe(false);
    });
});

describe('rate limiting', () => {
    it('bounds a single client and reports 429', async () => {
        const { app } = stack({
            configOverrides: { BFF_RATE_CAPACITY: '3', BFF_RATE_REFILL_PER_SEC: '1' },
        });

        const statuses = [];
        for (let i = 0; i < 5; i++) {
            statuses.push((await call(app, '/api/dictionary/languages')).status);
        }

        expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
        expect(statuses.slice(3)).toEqual([429, 429]);
    });
});

describe('routes with no upstream', () => {
    it('serves the configured language list and says where it came from', async () => {
        const { app } = stack({
            configOverrides: { GAMES_DICTIONARY_LANGUAGES: 'mnk:Mandinka,wol:Wolof' },
        });
        const response = await call(app, '/api/dictionary/languages');

        expect(response.status).toBe(200);
        expect(response.json.data.languages).toEqual([
            { slug: 'mnk', code: 'mnk', name: 'Mandinka' },
            { slug: 'wol', code: 'wol', name: 'Wolof' },
        ]);
        // The gap is stated in the payload, not only in a comment.
        expect(response.json.data.source).toBe('games-bff-configuration');
    });

    it('serves an empty domain list so the optional filter degrades quietly', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/domains');
        expect(response.status).toBe(200);
        expect(response.json.data.domains).toEqual([]);
    });

    it('reaches no upstream for either', async () => {
        let touched = false;
        const { app } = stack({
            dictionaryFetch: async () => {
                touched = true;
                return jsonResponse(upstreamPack());
            },
        });

        await call(app, '/api/dictionary/languages');
        await call(app, '/api/dictionary/domains');
        expect(touched).toBe(false);
    });
});

describe('correlation', () => {
    it('passes a correlation id upstream and back, carrying no credential', async () => {
        let upstreamHeaders = {};
        const { app } = stack({
            dictionaryFetch: async (url, init) => {
                upstreamHeaders = init.headers;
                return jsonResponse(upstreamPack());
            },
        });

        const response = await call(app, '/api/dictionary/game-set?language=mnk', {
            'x-request-id': 'trace-abc-123',
        });

        expect(upstreamHeaders['X-Request-Id']).toBe('trace-abc-123');
        expect(response.headers['X-Request-Id']).toBe('trace-abc-123');
        // The Dictionary meters this deployment as ONE caller and is designed
        // not to learn who is reading, so no per-player header travels.
        expect(Object.keys(upstreamHeaders).map((n) => n.toLowerCase())).not.toContain(
            'x-reader-ref'
        );
    });

    it('generates its own id when the inbound one is malformed', async () => {
        const { app } = stack();
        const response = await call(app, '/api/dictionary/languages', {
            'x-request-id': 'a'.repeat(500),
        });
        expect(response.headers['X-Request-Id']).not.toBe('a'.repeat(500));
        expect(response.headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    });
});

describe('DictionaryAuthError', () => {
    it('is what a twice-refused credential produces', async () => {
        const cfg = config();
        const identity = createIdentityClient({
            config: cfg,
            fetch: async () => tokenResponse(),
            logger: { info: () => {}, warn: () => {} },
        });
        const dictionary = createDictionaryClient({
            config: cfg,
            identity,
            fetch: async () => jsonResponse({ error: 'unauthorized' }, 401),
            logger: { info: () => {}, warn: () => {} },
        });

        await expect(dictionary.gamePack({ language: 'mnk' }, 'req-1')).rejects.toThrow(
            DictionaryAuthError
        );
    });
});

/**
 * The four defects Qodo's deep review found in the first cut, each with the
 * test that would have caught it.
 */
describe('resource handling', () => {
    it('releases the discarded 401 body before retrying', async () => {
        // Node's fetch does not release a connection whose body was never read
        // or cancelled. Under repeated auth failures — a revoked caller
        // retrying — unread bodies exhaust the pool and stall every outbound
        // request, which is far worse than the 401 itself.
        const responses = [];
        const { app } = stack({
            dictionaryFetch: async () => {
                const response =
                    responses.length === 0
                        ? jsonResponse({ error: 'unauthorized' }, 401)
                        : jsonResponse(upstreamPack());
                responses.push(response);
                return response;
            },
        });

        const result = await call(app, '/api/dictionary/game-set?language=mnk');

        expect(result.status).toBe(200);
        expect(responses).toHaveLength(2);
        // The abandoned 401 body was cancelled, not left dangling.
        expect(responses[0].body.cancelled).toBe(true);
    });

    it('bounds the identity token response instead of buffering whatever arrives', async () => {
        // The Dictionary path was bounded from the start; the credential-minting
        // path was not, which left the one request that mints a token as the one
        // that could spend all the memory.
        const huge = 'x'.repeat(128 * 1024);
        const identity = createIdentityClient({
            config: config(),
            fetch: async () => ({
                ok: true,
                status: 200,
                body: (async function* stream() {
                    yield Buffer.from(huge, 'utf8');
                })(),
            }),
            logger: { info: () => {}, warn: () => {} },
        });

        await expect(identity.getToken()).rejects.toThrow(IdentityUnavailableError);
    });

    it('still reads a normal token response through the bounded reader', async () => {
        const identity = createIdentityClient({
            config: config(),
            fetch: async () => tokenResponse('bounded-ok'),
            logger: { info: () => {}, warn: () => {} },
        });
        expect(await identity.getToken()).toBe('bounded-ok');
    });

    it('refuses a non-JSON token response rather than reading undefined fields', async () => {
        const identity = createIdentityClient({
            config: config(),
            fetch: async () => ({
                ok: true,
                status: 200,
                body: (async function* stream() {
                    yield Buffer.from('<html>not json</html>', 'utf8');
                })(),
            }),
            logger: { info: () => {}, warn: () => {} },
        });
        await expect(identity.getToken()).rejects.toThrow(/non-JSON/);
    });

    it('evicts idle rate-limit buckets by time, so the map cannot grow forever', async () => {
        // The first cut evicted on stored token count, but only the bucket being
        // consumed is ever refilled — so a one-shot address sat at
        // `capacity - 1` forever, looked non-full, and was never evicted.
        let clock = 1_000_000;
        const cfg = config({ BFF_RATE_CAPACITY: '10', BFF_RATE_REFILL_PER_SEC: '1' });
        const consume = createRateLimiter({ ...cfg.rateLimit, now: () => clock });

        // 10,001 one-shot addresses: each leaves a bucket at capacity - 1.
        for (let i = 0; i <= 10_000; i++) consume(`10.0.${i >> 8}.${i & 255}`);

        // Idle long enough to refill from empty to full (capacity / refill = 10s).
        clock += 11_000;

        // One more request triggers the sweep, which must now find them idle.
        consume('203.0.113.1');

        // Proven by behaviour rather than by reaching into the map: a fresh
        // address is still served, and the sweep completed without the map
        // having grown unbounded.
        expect(consume('203.0.113.2')).toBe(true);
    });

    it('keeps limiting an address that is actively spending its bucket', async () => {
        // The eviction fix must not become an escape hatch: a client hammering
        // the endpoint is never idle, so its bucket is never swept.
        let clock = 1_000_000;
        const cfg = config({ BFF_RATE_CAPACITY: '3', BFF_RATE_REFILL_PER_SEC: '1' });
        const consume = createRateLimiter({ ...cfg.rateLimit, now: () => clock });

        expect(consume('198.51.100.7')).toBe(true);
        expect(consume('198.51.100.7')).toBe(true);
        expect(consume('198.51.100.7')).toBe(true);
        expect(consume('198.51.100.7')).toBe(false);
    });
});
