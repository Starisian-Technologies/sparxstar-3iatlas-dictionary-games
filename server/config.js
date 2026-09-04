/**
 * Dictionary Games BFF — configuration.
 *
 * This is the FIRST server-side code in this repository, and it exists because
 * the Dictionary API is private: no browser, anonymous user, or unregistered
 * application may call it. The browser calls this process on the games origin;
 * this process authenticates itself to the Identity Node and calls the
 * Dictionary. See `docs/dictionary-games-bff.md`.
 *
 * The RLC engine is deliberately NOT in this path — Dictionary Contract A.5
 * keeps the engine out of the content plane, and that is unchanged: the BFF is
 * a games-side component, not an engine route.
 *
 * ============================ SECRET HANDLING =============================
 *
 * The signing key is read from a FILE, never from an environment variable.
 * That is not a preference. An env var is visible in `docker inspect`, in
 * `/proc/<pid>/environ`, in a process listing on some platforms, in a crash
 * dump that captures the environment, and in any log line that dumps config.
 * A read-only mounted file is visible to the process and to whoever can read
 * the mount, and nothing else — which is the same seam identity-node uses for
 * its own signing key (`IDENTITY_JWT_PRIVATE_KEY_FILE`).
 *
 * An unreadable path is FATAL rather than a fallback. A deploy that believes
 * it loaded a mounted key and actually loaded nothing would fail closed on
 * every request with an error that looks like an upstream problem.
 */

'use strict';

const { readFileSync } = require('fs');

/** Read a required setting. Throws rather than defaulting — this process
 *  holds a credential, and a wrong endpoint is worse than a refusal to boot. */
function required(name) {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`${name} is required`);
    }
    return value;
}

function optional(name) {
    const value = process.env[name];
    return value === undefined || value === '' ? undefined : value;
}

function integer(name, fallback, minimum, maximum) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(
            `${name} must be an integer between ${minimum} and ${maximum} (got ${JSON.stringify(raw)})`
        );
    }
    return value;
}

/**
 * An https:// URL with no trailing slash — the same rule `site-endpoints.cjs`
 * applies to the browser-facing endpoints, for the same reason: a malformed
 * endpoint otherwise surfaces as an opaque failure in a deployed container,
 * which is a far worse place to find a typo than a failed boot.
 *
 * http:// is permitted only outside production, so a developer can point at a
 * local identity node without editing this file.
 */
function httpsUrl(name, { allowHttp }) {
    const value = required(name);
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be an absolute URL (got ${JSON.stringify(value)})`);
    }
    const schemeOk = parsed.protocol === 'https:' || (allowHttp && parsed.protocol === 'http:');
    if (!schemeOk) {
        throw new Error(
            `${name} must be an https:// URL${allowHttp ? ' (http:// allowed outside production)' : ''} — got ${value}`
        );
    }
    if (value.endsWith('/')) {
        throw new Error(`${name} must not end with a trailing slash (got ${value})`);
    }
    return value;
}

/**
 * Read the RSA private key from its mounted path.
 *
 * PEM in, PEM out — no parsing here beyond a shape check, because a key that
 * is present but malformed should fail at boot with a message naming the file,
 * not at the first token request with a crypto error naming nothing.
 */
function readSigningKey(path) {
    let pem;
    try {
        pem = readFileSync(path, 'utf8');
    } catch (err) {
        throw new Error(
            `GAMES_IDENTITY_PRIVATE_KEY_FILE is set but unreadable (${path}): ${err.message}. ` +
                'The BFF cannot authenticate to the Identity Node without it and will not start.'
        );
    }

    if (!pem.includes('-----BEGIN') || !pem.includes('PRIVATE KEY-----')) {
        throw new Error(
            `GAMES_IDENTITY_PRIVATE_KEY_FILE (${path}) does not contain a PEM private key. ` +
                'Expected a PKCS#8 "-----BEGIN PRIVATE KEY-----" block.'
        );
    }

    return pem;
}

/**
 * Build the configuration. Called once at boot.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadConfig(env = process.env) {
    const previous = process.env;
    // `required`/`optional` read process.env, so a caller passing an explicit
    // environment (the tests do) gets that environment consistently rather
    // than a mixture of it and the ambient one.
    process.env = env;
    try {
        const isProd = env.NODE_ENV === 'production';
        const allowHttp = !isProd;

        const config = {
            isProd,
            /** Loopback by default: this process is reached through Nginx on the
             *  same host, and a service holding a signing key has no reason to
             *  be listening on a public interface. */
            host: optional('BFF_HOST') ?? '127.0.0.1',
            port: integer('BFF_PORT', 8081, 1, 65_535),

            identity: {
                /** Token endpoint. Must equal the `aud` the Identity Node pins
                 *  (its IDENTITY_TOKEN_ENDPOINT), or every assertion is refused
                 *  as a wrong audience. */
                tokenUrl: httpsUrl('GAMES_IDENTITY_TOKEN_URL', { allowHttp }),
                clientId: required('GAMES_IDENTITY_CLIENT_ID'),
                /** The `kid` of the registered public key. Sent in the assertion
                 *  header so the Identity Node knows which key to verify with —
                 *  it is how a rotation is switched over. */
                keyId: required('GAMES_IDENTITY_KEY_ID'),
                privateKeyPem: readSigningKey(required('GAMES_IDENTITY_PRIVATE_KEY_FILE')),
                /** Requested audience. The Identity Node decides whether this
                 *  client may have it; asking is not being granted. */
                audience: optional('GAMES_DICTIONARY_AUDIENCE') ?? 'dictionary',
                /** Assertion lifetime, seconds. The Identity Node refuses
                 *  anything over 60 (its SERVICE_ASSERTION_MAX_LIFETIME_SECONDS),
                 *  so this stays well under it — an assertion is consumed within
                 *  one round trip and a longer window only widens replay. */
                assertionLifetimeSeconds: integer('GAMES_ASSERTION_LIFETIME_SECONDS', 30, 5, 60),
                /** Short. A stalled identity node must not stall a page load; it
                 *  must produce a fast 503 the browser can retry. */
                timeoutMs: integer('GAMES_IDENTITY_TIMEOUT_MS', 3_000, 250, 10_000),
                /**
                 * Renew this many seconds before expiry. 60 against a 300-second
                 * token, per the owner's spec (§5) — roughly four minutes in.
                 * Bounded below the token lifetime by the check further down, so
                 * a misconfiguration cannot produce a token that is always
                 * "about to expire" and renewed on every request.
                 */
                renewSkewSeconds: integer('GAMES_TOKEN_RENEW_SKEW_SECONDS', 60, 5, 240),
                /** Random spread on the renewal point, seconds, so several BFF
                 *  processes do not all refresh on the same tick. */
                renewJitterSeconds: integer('GAMES_TOKEN_RENEW_JITTER_SECONDS', 10, 0, 60),
            },

            dictionary: {
                /** Dictionary API origin — e.g. https://dictionary-api.sparxstar.com.
                 *  Paths are appended by the allowlist in server/routes.js; a
                 *  caller can never choose one. */
                baseUrl: httpsUrl('GAMES_DICTIONARY_API_URL', { allowHttp }),
                /** Short, and shorter than any browser's patience. */
                timeoutMs: integer('GAMES_DICTIONARY_TIMEOUT_MS', 5_000, 250, 20_000),
                /**
                 * Ceiling on an upstream response, bytes.
                 *
                 * The Dictionary caps a query response at 100 KB itself
                 * (JSON_RESPONSE_MAX_BYTES), so this is a defence against a
                 * misbehaving or impersonated upstream rather than against the
                 * real one — it bounds what this process will buffer whatever
                 * answers.
                 */
                maxResponseBytes: integer(
                    'GAMES_DICTIONARY_MAX_RESPONSE_BYTES',
                    256 * 1024,
                    1024,
                    4 * 1024 * 1024
                ),
                /*
                 * Words per pack the browser may ask for.
                 *
                 * THE DICTIONARY IS AUTHORITATIVE. Its gamepack cap is 100
                 * (GAMEPACK_MAX_SIZE), derived from the 102,400-byte query
                 * ceiling and ~750 bytes per gamepack word; asking for more is
                 * a 400 there, so it is refused here rather than forwarded.
                 * This value must never EXCEED the upstream cap — a BFF more
                 * permissive than the service it fronts turns a clean 400 into
                 * a spent request and a confusing upstream error.
                 *
                 * It was 50 while the upstream cap was believed to be 200. The
                 * upstream number was the wrong one: 200 gamepack words is
                 * ~140 KB and could never be served. Both are now the same
                 * measured 100.
                 *
                 * Note this is not the games' SESSION size — `useGameSet`
                 * clamps a play session to 50 words, which is a product choice
                 * about how long a round should be, not a contract bound.
                 */
                maxPackSize: integer('GAMES_MAX_PACK_SIZE', 100, 1, 100),
            },

            /**
             * The languages this deployment offers.
             *
             * A STOPGAP, and flagged as one. The Dictionary Node publishes no
             * `/languages` route — the WordPress original had one, the Node port
             * did not carry it over — so there is nothing to ask. Rather than
             * invent an endpoint or hard-code a list as though it were corpus
             * truth, the list is an explicit operator setting whose default is
             * the one language with a compiled corpus in the Dictionary's own
             * release documentation (Mandinka, `mnk`, release 2026.1).
             *
             * Format: `code:Label,code:Label`. When the Dictionary publishes a
             * languages endpoint this setting is deleted, not extended.
             */
            languages: parseLanguages(optional('GAMES_DICTIONARY_LANGUAGES') ?? 'mnk:Mandinka'),

            /** Per-IP request ceiling for the browser-facing routes. */
            rateLimit: {
                capacity: integer('BFF_RATE_CAPACITY', 60, 1, 10_000),
                refillPerSec: integer('BFF_RATE_REFILL_PER_SEC', 1, 1, 1_000),
            },
        };

        if (config.identity.renewSkewSeconds >= 300) {
            // Guarded because the failure mode is silent and expensive: a skew at
            // or above the token lifetime means every token is born already due
            // for renewal, so the BFF mints one per request and grinds the
            // identity node's rate limiter instead of caching anything.
            throw new Error(
                'GAMES_TOKEN_RENEW_SKEW_SECONDS must be shorter than the access-token lifetime (300s), ' +
                    'or every token is renewed on the request that fetched it'
            );
        }

        return config;
    } finally {
        process.env = previous;
    }
}

/** Parse `code:Label,code:Label`. Refuses a malformed entry rather than
 *  dropping it — a language quietly missing from the selector is a bug report
 *  nobody can reproduce. */
function parseLanguages(raw) {
    const entries = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');

    if (entries.length === 0) {
        throw new Error('GAMES_DICTIONARY_LANGUAGES must name at least one language as code:Label');
    }

    return entries.map((entry) => {
        const separator = entry.indexOf(':');
        if (separator < 1 || separator === entry.length - 1) {
            throw new Error(
                `GAMES_DICTIONARY_LANGUAGES entry ${JSON.stringify(entry)} must be "code:Label" (e.g. mnk:Mandinka)`
            );
        }
        const code = entry.slice(0, separator).trim();
        const name = entry.slice(separator + 1).trim();
        if (!/^[a-z]{3}$/.test(code)) {
            throw new Error(
                `GAMES_DICTIONARY_LANGUAGES code ${JSON.stringify(code)} must be a three-letter ISO 639-3 code`
            );
        }
        return { code, name };
    });
}

module.exports = { loadConfig, parseLanguages };
