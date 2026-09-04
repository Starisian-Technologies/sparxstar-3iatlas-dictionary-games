/**
 * Identity Node client — `private_key_jwt` client authentication.
 *
 * This module holds the only credential in the games deployment, and its whole
 * job is to make sure that credential never leaves this process. Two rules,
 * both absolute:
 *
 *   THE PRIVATE KEY NEVER LEAVES. It signs assertions here. It is never
 *   serialized, never logged, never returned, and never sent anywhere — not to
 *   the Identity Node (which holds only the public half), and certainly not to
 *   a browser.
 *
 *   THE ACCESS TOKEN NEVER LEAVES EITHER. It is cached in memory only, attached
 *   to outbound Dictionary requests by server/dictionaryClient.js, and never
 *   put in a response body, a header, a cookie, or a log line. A games player
 *   has no use for it and holding it would let them call the Dictionary
 *   directly, which is the entire thing this design prevents.
 *
 * ========================= WHY private_key_jwt ==========================
 *
 * There is no client secret. The BFF signs a short-lived assertion with a
 * private key it alone holds; the Identity Node verifies it against the public
 * JWK registered for this `kid`. So there is no shared secret in this flow at
 * all — which keeps the platform's no-shared-secret rule (OQ-I2) intact for
 * machine callers as well as people, and means a disclosure of the Identity
 * Node's database yields nothing that can authenticate as this client.
 *
 * The assertion's `aud` is the Identity Node's TOKEN ENDPOINT, not the
 * audience being requested. That is what stops an assertion captured in flight
 * from being presented at some other endpoint. The requested audience
 * (`dictionary`) travels as a form parameter instead.
 *
 * ============================== FAIL CLOSED ==============================
 *
 * If the Identity Node cannot issue a token, this module throws and the route
 * returns 503. It never falls back to an unauthenticated call, never reuses an
 * expired token, and there is no static production credential to fall back to.
 * A dictionary request without a valid token is not a degraded request, it is
 * a request that must not be made.
 */

'use strict';

const { createPrivateKey, createSign, randomUUID } = require('crypto');

/**
 * Ceiling on a token-endpoint response, bytes.
 *
 * A token response is a handful of JSON fields around one JWT — kilobytes at
 * the very most. `response.json()` would buffer whatever arrives, so a
 * misrouted or misbehaving endpoint could spend this process's memory on the
 * one path that mints its credential. The Dictionary path was already bounded
 * (`readBounded` in dictionaryClient.js); this closes the same hole here.
 *
 * Generous by two orders of magnitude so a legitimate response can never trip
 * it, and small enough that an illegitimate one cannot hurt.
 */
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;

/** RFC 7523 §2.2 — the assertion type the Identity Node requires, exactly. */
const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/** RFC 6749 §4.4. */
const GRANT_TYPE = 'client_credentials';

function base64url(buffer) {
    return Buffer.from(buffer).toString('base64url');
}

/**
 * Sign an RS256 JWT with node's own crypto.
 *
 * Deliberately no JWT library. This process holds the deployment's only
 * private key, so every dependency it carries is a dependency that could reach
 * that key — and RS256 over a `header.payload` string is twenty lines of
 * `crypto`. The repo's runtime dependency set is unchanged by the whole BFF.
 */
function signRs256(header, payload, privateKey) {
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
    return `${signingInput}.${base64url(signature)}`;
}

/**
 * A client assertion — the thing that proves this process is this client.
 *
 * Every claim here is checked by the Identity Node and each is load-bearing:
 * `iss`/`sub` name the client, `aud` pins the endpoint, `exp` bounds the
 * window, and `jti` is what makes it single-use (the Identity Node records it
 * across instances and refuses a replay).
 */
function buildAssertion(config, now = Date.now()) {
    const issuedAt = Math.floor(now / 1000);

    return signRs256(
        { alg: 'RS256', typ: 'JWT', kid: config.identity.keyId },
        {
            iss: config.identity.clientId,
            sub: config.identity.clientId,
            aud: config.identity.tokenUrl,
            iat: issuedAt,
            exp: issuedAt + config.identity.assertionLifetimeSeconds,
            // Fresh per assertion. A reused value is a replay by definition and
            // is refused upstream.
            jti: randomUUID(),
        },
        // Parsed per call rather than memoized: the PEM string is already in
        // memory, and holding a KeyObject adds nothing but another place the
        // key exists.
        createPrivateKey(config.identity.privateKeyPem)
    );
}

/** Raised when a token cannot be obtained. Callers turn this into a 503 —
 *  never a 401 or 403, which would blame the player for a service problem. */
class IdentityUnavailableError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'IdentityUnavailableError';
        this.cause = cause;
    }
}

/**
 * Read a response body as text with a hard byte ceiling.
 *
 * Applied to success AND error responses: an error body is exactly where a
 * misbehaving endpoint would put something large, and it is read anyway to
 * extract the OAuth error code.
 */
async function readBoundedText(response) {
    const body = response.body;
    if (!body) return '';

    const chunks = [];
    let total = 0;

    for await (const chunk of body) {
        total += chunk.length;
        if (total > MAX_TOKEN_RESPONSE_BYTES) {
            throw new IdentityUnavailableError(
                `identity node response exceeded ${MAX_TOKEN_RESPONSE_BYTES} bytes — refusing to buffer it`
            );
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

/** Parse a bounded body as JSON. Returns null when the body is not JSON. */
async function readBoundedJson(response) {
    const text = await readBoundedText(response);
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * The token cache.
 *
 * MEMORY ONLY. Not a file, not Redis, not a database. A five-minute token is
 * not worth persisting, and a persisted one is a credential at rest in a
 * process that otherwise has none.
 *
 * @param {object} deps
 * @param {ReturnType<import('./config').loadConfig>} deps.config
 * @param {typeof fetch} [deps.fetch]
 * @param {() => number} [deps.now]
 * @param {{ warn: Function, info: Function, error: Function }} [deps.logger]
 */
function createIdentityClient({
    config,
    fetch: fetchImpl = fetch,
    now = Date.now,
    logger = console,
}) {
    /** @type {{ token: string, expiresAtMs: number, renewAtMs: number } | null} */
    let cached = null;

    /**
     * The in-flight renewal, shared by every caller.
     *
     * SINGLE-FLIGHT, and it matters more here than in most caches. Without it,
     * a cold start under load has every concurrent request mint its own
     * assertion — so a page that fires three fetches spends three tokens, each
     * one a signature and a round trip, against an endpoint that rate-limits
     * per client. Worse, they race: the last writer wins and the others'
     * tokens are discarded immediately after being paid for.
     *
     * @type {Promise<string> | null}
     */
    let inFlight = null;

    /**
     * When to start renewing: `renewSkewSeconds` before expiry, minus a random
     * spread so several BFF processes do not all wake on the same tick and
     * arrive at the token endpoint together.
     */
    function renewalPoint(expiresAtMs) {
        const skewMs = config.identity.renewSkewSeconds * 1000;
        const jitterMs = Math.floor(Math.random() * config.identity.renewJitterSeconds * 1000);
        return expiresAtMs - skewMs - jitterMs;
    }

    async function requestToken() {
        const body = new URLSearchParams({
            grant_type: GRANT_TYPE,
            client_id: config.identity.clientId,
            audience: config.identity.audience,
            client_assertion_type: CLIENT_ASSERTION_TYPE,
            client_assertion: buildAssertion(config, now()),
        });

        let response;
        try {
            response = await fetchImpl(config.identity.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
                body: body.toString(),
                signal: AbortSignal.timeout(config.identity.timeoutMs),
            });
        } catch (err) {
            // The assertion is NOT logged. It is a live credential until it
            // expires, and a log aggregator is not where it belongs.
            throw new IdentityUnavailableError(`identity node unreachable: ${err.message}`, err);
        }

        if (!response.ok) {
            /*
             * The OAuth error code is safe to log — it is `invalid_client` or
             * `invalid_request`, deliberately coarse, and it is the only signal
             * an operator gets about WHY a machine authentication failed. A 401
             * here usually means the kid was disabled, the client was revoked,
             * or the two services disagree about the token endpoint URL.
             */
            let code = '';
            try {
                const parsed = await readBoundedJson(response);
                code = typeof parsed?.error === 'string' ? parsed.error : '';
            } catch {
                // A non-JSON error body tells us nothing; the status is the signal.
            }
            throw new IdentityUnavailableError(
                `identity node refused the client assertion (status ${response.status}${code ? `, ${code}` : ''})`
            );
        }

        let payload;
        try {
            payload = await readBoundedJson(response);
        } catch (err) {
            // Includes the over-ceiling case, which readBoundedText raises as
            // an IdentityUnavailableError; re-wrapping keeps the type the route
            // maps to a 503.
            throw new IdentityUnavailableError(
                `identity node returned an unreadable token response: ${err.message}`,
                err
            );
        }
        if (payload === null) {
            throw new IdentityUnavailableError('identity node returned a non-JSON token response');
        }

        const token = payload?.access_token;
        const expiresIn = payload?.expires_in;

        if (typeof token !== 'string' || token === '') {
            throw new IdentityUnavailableError('identity node returned no access_token');
        }
        if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
            // Refused rather than defaulted. Guessing a lifetime is how a token
            // gets used past its expiry, and the upstream 401 that follows is
            // indistinguishable from a revocation.
            throw new IdentityUnavailableError('identity node returned no usable expires_in');
        }

        const issuedAtMs = now();
        const expiresAtMs = issuedAtMs + expiresIn * 1000;

        cached = { token, expiresAtMs, renewAtMs: renewalPoint(expiresAtMs) };

        // The token itself is never logged — only that one was obtained.
        logger.info?.(
            JSON.stringify({
                level: 'info',
                msg: 'service token obtained',
                audience: config.identity.audience,
                kid: config.identity.keyId,
                expires_in: expiresIn,
            })
        );

        return token;
    }

    /**
     * A usable access token, minting one if the cache is cold or due.
     *
     * @param {{ force?: boolean }} [options] `force` discards the cached token
     *   first. Used for the single retry after an upstream 401 — see
     *   server/dictionaryClient.js.
     */
    async function getToken(options = {}) {
        if (options.force) cached = null;

        // An EXPIRED token is discarded, not returned. The renewal point is an
        // optimisation; expiry is a correctness boundary.
        if (cached && now() >= cached.expiresAtMs) cached = null;

        if (cached && now() < cached.renewAtMs) return cached.token;

        // Past the renewal point but not yet expired, or cold. Either way one
        // renewal runs and everybody waits on it.
        if (!inFlight) {
            inFlight = requestToken().finally(() => {
                inFlight = null;
            });
        }

        try {
            return await inFlight;
        } catch (err) {
            /*
             * A still-valid token survives a FAILED renewal.
             *
             * This is the one place a stale-ish token is the right answer: the
             * renewal ran early precisely so a transient identity outage inside
             * the skew window does not become a games outage. The token is not
             * expired — it is simply due — and refusing to use it would fail
             * closed against a door that is still open.
             */
            if (cached && now() < cached.expiresAtMs) {
                logger.warn?.(
                    JSON.stringify({
                        level: 'warn',
                        msg: 'service token renewal failed; using the still-valid cached token',
                        reason: err.message,
                    })
                );
                return cached.token;
            }
            throw err;
        }
    }

    return {
        getToken,
        /** Test seam. Never called in production — the cache has no other exit. */
        _peek: () => cached,
    };
}

module.exports = {
    createIdentityClient,
    IdentityUnavailableError,
    buildAssertion,
    CLIENT_ASSERTION_TYPE,
    GRANT_TYPE,
};
