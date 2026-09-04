/**
 * The BFF request handler.
 *
 * Kept separate from the listener (server/index.js) so tests can drive it
 * without opening a socket — the same split identity-node and the engine use.
 *
 * ============================== NO CORS =================================
 *
 * There is deliberately no CORS handling here. The browser reaches these routes
 * SAME-ORIGIN, through the games site's own Nginx (`/api/dictionary/` proxies
 * to this process), so no preflight happens and no `Access-Control-*` header is
 * needed. Adding one would create a second allowlist to keep in step with the
 * site's own, which is exactly how an origin ends up permitted here that the
 * site itself rejects.
 *
 * `Access-Control-Allow-Credentials` in particular is never emitted — a hard
 * rule across this deployment (AGENTS.md).
 */

'use strict';

const { randomUUID } = require('crypto');
const { BadRequestError } = require('./routes');
const { IdentityUnavailableError } = require('./identityClient');
const {
    DictionaryAuthError,
    DictionaryRequestError,
    DictionaryUnavailableError,
} = require('./dictionaryClient');

/** Per-IP token bucket. In-memory, which is correct here: this process is one
 *  replica behind one Nginx, and the ceiling exists to stop a single client
 *  spending the Dictionary's entry budget, not to be a distributed quota. */
function createRateLimiter({ capacity, refillPerSec, now = Date.now }) {
    const buckets = new Map();

    return function consume(key) {
        const at = now();
        const bucket = buckets.get(key) ?? { tokens: capacity, updated: at };
        const elapsedSec = (at - bucket.updated) / 1000;
        bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
        bucket.updated = at;

        // Bounded so a spray of distinct source addresses cannot grow this map
        // without limit. Full buckets are indistinguishable from absent ones,
        // so dropping them costs nothing.
        if (buckets.size > 10_000) {
            for (const [existingKey, existing] of buckets) {
                if (existing.tokens >= capacity) buckets.delete(existingKey);
                if (buckets.size <= 5_000) break;
            }
        }

        if (bucket.tokens < 1) {
            buckets.set(key, bucket);
            return false;
        }

        bucket.tokens -= 1;
        buckets.set(key, bucket);
        return true;
    };
}

/**
 * Map an internal failure to a status and a stable code.
 *
 * THE CENTRAL RULE: a failure of OUR credential is a 503, never a 401 or 403.
 * A 401 tells the player to sign in again, and a 403 tells them they are not
 * allowed — both are lies when the truth is that this service could not
 * authenticate ITSELF. The player's own authorization is a separate question
 * that these routes do not ask at all.
 */
function describeError(err) {
    if (err instanceof BadRequestError) {
        return { status: 400, code: 'bad_request', message: err.message };
    }
    if (err instanceof DictionaryRequestError) {
        /*
         * 429 upstream is the Dictionary's unique-entry budget for this whole
         * deployment, not this player's rate limit. Passed through as a 429 so
         * a client backs off, with a code that names the real cause for
         * whoever reads the log.
         */
        if (err.status === 429) {
            return {
                status: 429,
                code: 'dictionary_budget_exceeded',
                message: 'The dictionary entry budget is spent.',
            };
        }
        return {
            status: 502,
            code: 'dictionary_rejected_request',
            message: 'The dictionary refused the request.',
        };
    }
    if (err instanceof IdentityUnavailableError || err instanceof DictionaryAuthError) {
        return {
            status: 503,
            code: 'upstream_unavailable',
            message: 'The dictionary is temporarily unavailable.',
        };
    }
    if (err instanceof DictionaryUnavailableError) {
        return {
            status: 503,
            code: 'upstream_unavailable',
            message: 'The dictionary is temporarily unavailable.',
        };
    }
    return { status: 500, code: 'internal_error', message: 'Something went wrong.' };
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./config').loadConfig>} deps.config
 * @param {Record<string, { handler: Function, upstream: boolean }>} deps.routes
 * @param {{ warn: Function, info: Function, error: Function }} [deps.logger]
 */
function createApp({ config, routes, logger = console, now = Date.now }) {
    const consume = createRateLimiter({ ...config.rateLimit, now });

    function log(level, fields) {
        const emit = logger[level] ?? logger.info;
        emit?.(JSON.stringify({ ts: new Date().toISOString(), level, ...fields }));
    }

    function send(res, status, payload, correlationId) {
        const body = JSON.stringify(payload);
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
            /*
             * `no-store`, always.
             *
             * Not a formality. Dictionary content carries rights and consent
             * restrictions and can be WITHDRAWN, and a shared cache is a place
             * a withdrawn word survives past its withdrawal with nobody able to
             * say for how long. It is also a place one caller's content is
             * served to another — the same reasoning the Dictionary applies to
             * its own responses, which are all `no-store, private`.
             */
            'Cache-Control': 'no-store, private',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'X-Request-Id': correlationId,
        });
        res.end(body);
    }

    /**
     * The source address, for rate limiting.
     *
     * Read from the LAST `X-Forwarded-For` hop, not the first. The first is
     * caller-supplied and trivially spoofed past a limiter; the last is what
     * the trusted proxy in front of this process appended. This process only
     * ever listens on loopback behind that proxy, so there is exactly one hop
     * to account for.
     */
    function clientAddress(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded !== '') {
            const hops = forwarded
                .split(',')
                .map((hop) => hop.trim())
                .filter((hop) => hop !== '');
            if (hops.length > 0) return hops[hops.length - 1];
        }
        return req.socket?.remoteAddress ?? 'unknown';
    }

    return async function handle(req, res) {
        /*
         * A correlation id, generated here or adopted from the proxy. It travels
         * to the Dictionary as `X-Request-Id` and comes back to the browser in
         * the same header, so one player's failed request can be followed across
         * three services. It carries no credential and nothing about the player.
         */
        const inbound = req.headers['x-request-id'];
        const correlationId =
            typeof inbound === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(inbound)
                ? inbound
                : randomUUID();

        const started = now();

        // Liveness. Answers without touching a credential or an upstream, so an
        // orchestrator does not restart this process during a Dictionary outage.
        if (req.method === 'GET' && req.url === '/healthz') {
            send(res, 200, { status: 'ok' }, correlationId);
            return;
        }

        let url;
        try {
            // The base is a fixed placeholder: only the path and query are ever
            // read from it, and parsing relative to a real origin would invite
            // treating a caller-supplied absolute URL as the target.
            url = new URL(req.url ?? '/', 'http://bff.invalid');
        } catch {
            send(
                res,
                400,
                { error: 'bad_request', message: 'Unparseable request URL.' },
                correlationId
            );
            return;
        }

        const route = routes[`${req.method} ${url.pathname}`];

        if (!route) {
            /*
             * 404 for anything not in the table, including a path that only
             * differs by a trailing segment. There is no catch-all: an unlisted
             * path is not a proxy target, it is nothing.
             */
            send(res, 404, { error: 'not_found' }, correlationId);
            return;
        }

        if (!consume(clientAddress(req))) {
            send(res, 429, { error: 'rate_limited', message: 'Too many requests.' }, correlationId);
            return;
        }

        try {
            const payload = await route.handler(url, correlationId);
            send(res, 200, { ok: true, data: payload }, correlationId);

            log('info', {
                msg: 'bff request',
                path: url.pathname,
                status: 200,
                duration_ms: now() - started,
                request_id: correlationId,
            });
        } catch (err) {
            const described = describeError(err);

            /*
             * The log carries the internal message; the RESPONSE carries only a
             * stable code and a fixed sentence. No stack trace, no upstream body,
             * and above all no token or assertion — a credential failure is
             * exactly the moment someone is tempted to log the credential.
             */
            log(described.status >= 500 ? 'error' : 'warn', {
                msg: 'bff request failed',
                path: url.pathname,
                status: described.status,
                code: described.code,
                reason: err.message,
                duration_ms: now() - started,
                request_id: correlationId,
            });

            send(
                res,
                described.status,
                { error: described.code, message: described.message },
                correlationId
            );
        }
    };
}

module.exports = { createApp, createRateLimiter, describeError };
