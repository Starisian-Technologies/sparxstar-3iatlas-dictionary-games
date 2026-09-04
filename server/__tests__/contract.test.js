/**
 * @jest-environment node
 */

/**
 * THE CROSS-REPOSITORY CONTRACT TEST.
 *
 * This file exists because of a specific failure: production returned HTTP 502
 * for `GET /api/dictionary/game-set?language=mnk&limit=5` while every test in
 * both repositories passed. The games suite tested the BFF against a
 * hand-written upstream response, the Dictionary suite tested its compiler
 * against its own database, and nothing tested the PAIR — so a parameter that
 * the BFF silently dropped, and a default the Dictionary resolved to its
 * maximum, met each other for the first time in production.
 *
 * The same shape of gap already bit this repo once: the BFF emitted
 * `entry_id`/`header_word` while the components read `uuid`/`headword`, and
 * both halves' tests were green.
 *
 * So this walks the whole chain with the OTHER repository's real output:
 *
 *   browser `limit=5`
 *     → BFF route validation
 *     → outbound `size=5` to the Dictionary
 *     → the Dictionary's ACTUAL compiled pack (checked-in fixture)
 *     → the BFF's rights projection
 *     → the games adapter
 *     → the fields the game components read
 *
 * The fixture is not hand-written. It is the output of
 * `compileGamePack()` in `sparxstar-3iatlas-dictionary-node`, for
 * `language=mnk`, `size=5`, `seed=contract-fixture`, against a simulated
 * 9,134-entry Mandinka corpus — the production corpus size that triggered the
 * failure. Entry index 2 is `licensed_third_party` and entry index 1 has no
 * consented recording, so the rights-restricted paths are exercised rather
 * than only the clean ones.
 *
 * REGENERATE IT when the Dictionary's gamepack projection changes: see
 * docs/dictionary-games-bff.md §9, "Regenerating the contract fixture".
 */

const { readFileSync } = require('fs');
const path = require('path');

const { loadConfig } = require('../config');
const { createIdentityClient } = require('../identityClient');
const { createDictionaryClient } = require('../dictionaryClient');
const { createRoutes } = require('../routes');
const { createApp, createRateLimiter } = require('../app');

/** The Dictionary's real `size=5` response, envelope and all. */
const UPSTREAM = JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures', 'dictionary-gamepack-size5.json'), 'utf8')
);

/** The query ceiling the Dictionary enforces on its own responses. */
const CEILING_BYTES = 102_400;

const keyPath = path.join(__dirname, 'fixtures', 'contract-key.pem');

function bodyStream(text) {
    const stream = (async function* body() {
        yield Buffer.from(text, 'utf8');
        stream.consumed = true;
    })();
    stream.cancel = async () => {
        stream.cancelled = true;
    };
    return stream;
}

function jsonResponse(payload, status = 200) {
    const text = JSON.stringify(payload);
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => JSON.parse(text),
        body: bodyStream(text),
    };
}

/** The BFF stack, with the Dictionary answered by the checked-in fixture. */
function chain() {
    /*
     * Restored key by key, not by reassigning `process.env`. Replacing that
     * object swaps Node's live environment view for a plain object, which then
     * outlives this test in whichever Jest worker ran it.
     */
    const overrides = {
        NODE_ENV: 'production',
        GAMES_IDENTITY_TOKEN_URL: 'https://id.sparxstar.com/oauth2/token',
        GAMES_IDENTITY_CLIENT_ID: 'sparxstar-dictionary-games',
        GAMES_IDENTITY_KEY_ID: 'games-2026-09',
        GAMES_IDENTITY_PRIVATE_KEY_FILE: keyPath,
        GAMES_DICTIONARY_API_URL: 'https://dictionary-api.sparxstar.com',
        GAMES_DICTIONARY_AUDIENCE: 'dictionary',
        GAMES_DICTIONARY_LANGUAGES: 'mnk:Mandinka',
    };
    const previous = Object.fromEntries(
        Object.keys(overrides).map((name) => [name, process.env[name]])
    );

    Object.assign(process.env, overrides);
    let config;
    try {
        config = loadConfig();
    } finally {
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }

    const upstreamCalls = [];
    const identity = createIdentityClient({
        config,
        fetch: async () =>
            jsonResponse({ access_token: 'service-token', token_type: 'Bearer', expires_in: 300 }),
        logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    const dictionary = createDictionaryClient({
        config,
        identity,
        fetch: async (url) => {
            upstreamCalls.push(url);
            return jsonResponse(UPSTREAM);
        },
        logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    const app = createApp({
        config,
        routes: createRoutes({ config, dictionary }),
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        rateLimiter: createRateLimiter({ capacity: 1000, refillPerSec: 1000 }),
    });

    return { app, upstreamCalls };
}

async function call(app, url) {
    const captured = { status: 0, body: '' };
    const res = {
        headersSent: false,
        writeHead(status) {
            captured.status = status;
            this.headersSent = true;
        },
        end(body) {
            captured.body = body ?? '';
        },
    };
    await app({ method: 'GET', url, headers: {}, socket: { remoteAddress: '203.0.113.9' } }, res);
    return { ...captured, json: captured.body ? JSON.parse(captured.body) : null };
}

beforeAll(() => {
    const { generateKeyPairSync } = require('crypto');
    const { writeFileSync } = require('fs');
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 3072,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    writeFileSync(keyPath, privateKey, { mode: 0o600 });
});

afterAll(() => {
    require('fs').rmSync(keyPath, { force: true });
});

describe('contract — the fixture is the Dictionary’s real bounded output', () => {
    it('carries five words for size=5 from a 9,134-entry corpus', () => {
        expect(UPSTREAM.success).toBe(true);
        expect(UPSTREAM.data.words).toHaveLength(5);
        expect(UPSTREAM.data.language).toBe('mnk');
    });

    it('is far below the Dictionary’s own 102,400-byte query ceiling', () => {
        const bytes = Buffer.byteLength(JSON.stringify(UPSTREAM), 'utf8');
        expect(bytes).toBeLessThan(CEILING_BYTES);
        // ~3.9 KB measured. The failing production response was 132,597.
        expect(bytes).toBeLessThan(10_000);
    });

    it('includes a rights-restricted and an audio-less record, not only clean ones', () => {
        const withheld = UPSTREAM.data.words.filter((word) => word.english_definition === '');
        const silent = UPSTREAM.data.words.filter((word) => word.audio_url === null);
        expect(withheld.length).toBeGreaterThan(0);
        expect(silent.length).toBeGreaterThan(0);
    });
});

describe('contract — limit=5 walks the whole chain', () => {
    it('forwards size=5 upstream and returns five records', async () => {
        const { app, upstreamCalls } = chain();
        const response = await call(app, '/api/dictionary/game-set?language=mnk&limit=5');

        // 1. The browser's request is accepted.
        expect(response.status).toBe(200);

        // 2. The bound reaches the Dictionary under its canonical name.
        expect(upstreamCalls).toHaveLength(1);
        const outbound = new URL(upstreamCalls[0]);
        expect(outbound.pathname).toBe('/v1/m2m/gamepack');
        expect(outbound.searchParams.get('language')).toBe('mnk');
        expect(outbound.searchParams.get('size')).toBe('5');
        expect(outbound.searchParams.has('limit')).toBe(false);

        // 3. The pack that comes back is bounded.
        expect(response.json.data.words).toHaveLength(5);
    });

    it('produces usable game records through the adapter', async () => {
        const { app } = chain();
        const response = await call(app, '/api/dictionary/game-set?language=mnk&limit=5');

        // 4. The games adapter renames the pack's fields for the components.
        const { adaptGamePackWords } = await import('../../src/api/gamePackAdapter.js');
        const words = adaptGamePackWords(response.json.data.words);

        expect(words).toHaveLength(5);
        for (const word of words) {
            // Every field the six game components and GameShell read. A blank
            // `uuid` is a result the engine cannot attribute; a blank
            // `headword` is a blank prompt.
            expect(typeof word.uuid).toBe('string');
            expect(word.uuid.length).toBeGreaterThan(0);
            expect(typeof word.headword).toBe('string');
            expect(word.headword.length).toBeGreaterThan(0);
            expect(Array.isArray(word.example_sentences)).toBe(true);
            // The pack's own spellings must not survive into the component model.
            expect(word.entry_id).toBeUndefined();
            expect(word.header_word).toBeUndefined();
        }
    });

    it('preserves the Dictionary’s rights decisions all the way to the components', async () => {
        const { app } = chain();
        const response = await call(app, '/api/dictionary/game-set?language=mnk&limit=5');
        const { adaptGamePackWords } = await import('../../src/api/gamePackAdapter.js');

        const packWords = response.json.data.words;
        const adapted = adaptGamePackWords(packWords);

        // The licensed entry's source glosses were withheld upstream. Nothing
        // in this chain may put them back, under any name.
        const licensedIndex = packWords.findIndex((word) => word.english_definition === '');
        expect(licensedIndex).toBeGreaterThanOrEqual(0);
        const restricted = adapted[licensedIndex];
        expect(restricted.english_definition).toBeUndefined();
        expect(restricted.french_definition).toBeUndefined();
        // The gloss the components show comes from the LEMMA, which the
        // Dictionary ships unconditionally — a different field, not a backfill.
        expect(restricted.translation_en).toBe(packWords[licensedIndex].english_lemma);

        // The recording-less entry stays silent; no URL is synthesized.
        const silentIndex = packWords.findIndex((word) => word.audio_url === null);
        expect(silentIndex).toBeGreaterThanOrEqual(0);
        expect(adapted[silentIndex].audio_url).toBeNull();
    });

    it('never lets the credential or the upstream address reach the browser', async () => {
        const { app } = chain();
        const response = await call(app, '/api/dictionary/game-set?language=mnk&limit=5');

        expect(response.body).not.toContain('service-token');
        expect(response.body).not.toContain('Bearer');
        expect(response.body).not.toContain('dictionary-api.sparxstar.com');

        /*
         * The pack `signature` IS forwarded, deliberately — it is in
         * `PACK_FIELDS` in server/rights.js. Noted rather than asserted
         * against: it is a MAC over the pack body, not a secret, and the
         * browser has no key to verify it with, so whether it should travel at
         * all is a product question rather than a leak. Left as shipped.
         */
        expect(JSON.parse(response.body).data.signature).toBeDefined();
    });
});
