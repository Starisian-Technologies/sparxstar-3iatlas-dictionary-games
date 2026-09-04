/**
 * Dictionary API client — the authenticated M2M half of the BFF.
 *
 * Calls `GET /v1/m2m/gamepack` with the Identity Node service token as a
 * Bearer credential. Three things about this file are deliberate:
 *
 *   NO CALLER-SUPPLIED URLS. The path is chosen from a fixed set by
 *   server/routes.js and the base comes from configuration. Nothing a browser
 *   sends can influence which host or path is dialled — an open proxy that
 *   happens to hold a Dictionary credential would be a far worse hole than the
 *   one this design closes.
 *
 *   NO `Origin` OR `Referer`. The Dictionary treats a browser-shaped header on
 *   a credentialed M2M request as a PRIORITY_1 security event, on the reasoning
 *   that a credential which reached a browser has already left the server it
 *   was supposed to stay on. This client is a server, so it must not look like
 *   a browser — `fetch` in Node sends neither by default, and nothing here adds
 *   them.
 *
 *   NO `X-Api-Key`. That was the WordPress dictionary's scheme. The Node
 *   service authenticates callers against the Identity Node's JWKS and has no
 *   static credential path in production at all.
 *
 * ONE RETRY, AND ONLY ONE REASON FOR IT. A 401 can mean the token expired in
 * flight — the window between "cached and valid" and "presented" is small but
 * real. So a 401 buys exactly one forced token refresh and one replay. A second
 * 401 is a genuine authentication failure (the caller was revoked, the subject
 * is unregistered, the audience is wrong) and is reported, not retried:
 * grinding a revoked credential against an audit log is how a revocation
 * becomes an incident report about the client.
 */

'use strict';

const { projectGamePack } = require('./rights');

/** The upstream is unreachable, slow, or broken. Becomes a 503. */
class DictionaryUnavailableError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'DictionaryUnavailableError';
        this.cause = cause;
    }
}

/** The upstream refused our CREDENTIAL. Also a 503 to the browser — the player
 *  did nothing wrong and must not be shown a 401 for a service misconfiguration. */
class DictionaryAuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DictionaryAuthError';
    }
}

/** The upstream refused the REQUEST (a 400 or a 429 against our budget). */
class DictionaryRequestError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'DictionaryRequestError';
        this.status = status;
    }
}

/**
 * Read a response body with a hard ceiling.
 *
 * `response.json()` would buffer whatever arrives. The Dictionary caps a query
 * response at 100 KB itself, so this is a defence against a misbehaving or
 * impersonated upstream rather than the real one — it bounds what this process
 * will hold whatever answers it.
 */
async function readBounded(response, maxBytes) {
    const body = response.body;
    if (!body) return '';

    const chunks = [];
    let total = 0;

    for await (const chunk of body) {
        total += chunk.length;
        if (total > maxBytes) {
            throw new DictionaryUnavailableError(
                `dictionary response exceeded ${maxBytes} bytes — refusing to buffer it`
            );
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./config').loadConfig>} deps.config
 * @param {{ getToken: (options?: { force?: boolean }) => Promise<string> }} deps.identity
 * @param {typeof fetch} [deps.fetch]
 * @param {{ warn: Function, info: Function }} [deps.logger]
 */
function createDictionaryClient({ config, identity, fetch: fetchImpl = fetch, logger = console }) {
    /**
     * One authenticated GET against a FIXED path.
     *
     * @param {string} path      Chosen by the route table, never by a caller.
     * @param {URLSearchParams} params
     * @param {string} correlationId
     */
    async function get(path, params, correlationId) {
        const url = `${config.dictionary.baseUrl}${path}?${params.toString()}`;

        const attempt = async (force) => {
            const token = await identity.getToken(force ? { force: true } : undefined);

            let response;
            try {
                response = await fetchImpl(url, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                        /*
                         * Correlation only. Deliberately not a credential and
                         * deliberately not the player's identity: the Dictionary
                         * meters this whole deployment as ONE caller and has no
                         * business learning who is playing. Its own
                         * `X-Reader-Ref` sub-budget header is for the Display
                         * App, which is a different consumer with a different
                         * bargain; sending a per-player value here would hand
                         * the Dictionary a reader identity it is designed not
                         * to have.
                         */
                        'X-Request-Id': correlationId,
                    },
                    signal: AbortSignal.timeout(config.dictionary.timeoutMs),
                });
            } catch (err) {
                throw new DictionaryUnavailableError(`dictionary unreachable: ${err.message}`, err);
            }

            return response;
        };

        let response = await attempt(false);

        if (response.status === 401) {
            // The one legitimate retry: the token may have expired between the
            // cache read and the upstream's clock.
            logger.warn?.(
                JSON.stringify({
                    level: 'warn',
                    msg: 'dictionary rejected the service token; refreshing once',
                    path,
                    request_id: correlationId,
                })
            );
            response = await attempt(true);

            if (response.status === 401) {
                // Not retried again. A fresh token was refused, so this is the
                // caller's standing, not its clock.
                throw new DictionaryAuthError(
                    'dictionary refused a freshly-issued service token — check the registered subject, its m2m scope, and that the caller is not revoked'
                );
            }
        }

        if (response.status === 403) {
            throw new DictionaryAuthError('dictionary refused the caller scope (403)');
        }

        if (!response.ok) {
            /*
             * 429 is the Dictionary's unique-entry budget, not an HTTP rate
             * limit — this deployment has spent its distinct-entry ceiling for
             * the window. Surfaced as itself so an operator sees a budget
             * problem rather than a generic upstream failure; the fix is a
             * budget change on the caller row, not a retry.
             */
            const text = await readBounded(response, 2048).catch(() => '');
            throw new DictionaryRequestError(
                `dictionary returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
                response.status
            );
        }

        const raw = await readBounded(response, config.dictionary.maxResponseBytes);

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            throw new DictionaryUnavailableError(
                `dictionary returned unparseable JSON: ${err.message}`,
                err
            );
        }

        return parsed;
    }

    /**
     * Fetch a GamePack.
     *
     * The Dictionary's envelope is `{ ok: true, data: ... }`; anything else is
     * treated as a failure rather than unwrapped optimistically, so a changed
     * envelope surfaces as an error instead of an empty word list that reads
     * like an empty corpus.
     *
     * @param {{ language: string, domain?: string, level?: string, size?: number,
     *           swadesh?: boolean, audioVerified?: boolean, seed?: string }} query
     * @param {string} correlationId
     */
    async function gamePack(query, correlationId) {
        const params = new URLSearchParams({ language: query.language });
        if (query.domain) params.set('domain', query.domain);
        if (query.level) params.set('level', query.level);
        if (query.size !== undefined) params.set('size', String(query.size));
        if (query.swadesh) params.set('swadesh', 'true');
        if (query.audioVerified) params.set('audio_verified', 'true');
        // A seed makes a pack reproducible: the same seed and corpus version
        // yield a byte-identical pack, which is what makes "today's game" the
        // same game for every player.
        if (query.seed) params.set('seed', query.seed);

        const envelope = await get('/v1/m2m/gamepack', params, correlationId);

        const pack = envelope?.data;
        if (envelope?.ok !== true || pack === null || typeof pack !== 'object') {
            throw new DictionaryUnavailableError(
                'dictionary returned an unexpected envelope for /v1/m2m/gamepack'
            );
        }

        // Narrowed, never widened — and no withheld field is ever backfilled.
        return projectGamePack(pack);
    }

    return { gamePack };
}

module.exports = {
    createDictionaryClient,
    DictionaryUnavailableError,
    DictionaryAuthError,
    DictionaryRequestError,
};
