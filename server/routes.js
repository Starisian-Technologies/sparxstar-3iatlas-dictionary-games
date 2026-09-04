/**
 * The browser-facing route table.
 *
 * ======================= ALLOWLIST, NOT A PROXY =========================
 *
 * This is the security boundary between the open internet and a credentialed
 * Dictionary caller, so it is written as an allowlist of OPERATIONS, not as a
 * proxy with rules bolted on:
 *
 *   - The set of reachable upstream paths is fixed in code. A caller cannot
 *     name a URL, a host, a path, or a path fragment. There is no
 *     `/api/dictionary/*` catch-all and no parameter that becomes part of an
 *     upstream path.
 *   - Every query parameter is named, typed, and bounded here. An unknown
 *     parameter is DROPPED, not forwarded — forwarding the unknown is how a
 *     future upstream parameter (a pagination walk, a wider size cap) becomes
 *     reachable from a browser the day it ships upstream.
 *   - Nothing about the player travels upstream. The Dictionary meters this
 *     deployment as one caller and is designed not to learn who is reading.
 *
 * A proxy would have been fewer lines and would have quietly inherited every
 * capability the Dictionary ever adds. This inherits none.
 */

'use strict';

/** ISO 639-3: exactly three lowercase letters, so `..` or a path can never be
 *  one. The same shape the Dictionary's own release importer enforces. */
const LANGUAGE_PATTERN = /^[a-z]{3}$/;

/** Domain codes and levels are short opaque labels from the corpus. Bounded to
 *  a conservative character set so neither can carry a separator, a space, or
 *  anything that would change how the upstream parses its own query string. */
const CODE_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

/** A caller-supplied selection seed. Bounded and opaque — it only ever reaches
 *  the upstream as a value to hash, never as anything structural. */
const SEED_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

class BadRequestError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BadRequestError';
    }
}

function readString(params, name, pattern, { required = false } = {}) {
    const raw = params.get(name);
    if (raw === null || raw === '') {
        if (required) throw new BadRequestError(`${name} is required`);
        return undefined;
    }
    if (!pattern.test(raw)) {
        // The expected SHAPE is named, not the value — enough to fix a client
        // bug, nothing about what the corpus contains.
        throw new BadRequestError(`${name} is not in the expected format`);
    }
    return raw;
}

function readBoolean(params, name) {
    const raw = params.get(name);
    if (raw === null || raw === '') return undefined;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new BadRequestError(`${name} must be true or false`);
}

function readSize(params, maximum) {
    const raw = params.get('size');
    if (raw === null || raw === '') return undefined;
    if (!/^\d{1,4}$/.test(raw)) throw new BadRequestError('size must be a positive integer');
    const value = Number(raw);
    if (value < 1) throw new BadRequestError('size must be at least 1');
    /*
     * Refused here rather than clamped. Clamping would silently serve 50 words
     * to a client that asked for 500 and believes it got them — and the
     * upstream's own answer to an over-cap request is a 400, so clamping would
     * also make this BFF more permissive than the service it fronts.
     */
    if (value > maximum) throw new BadRequestError(`size must not exceed ${maximum}`);
    return value;
}

/**
 * Build the handlers.
 *
 * @param {object} deps
 * @param {ReturnType<import('./config').loadConfig>} deps.config
 * @param {{ gamePack: Function }} deps.dictionary
 */
function createRoutes({ config, dictionary }) {
    /**
     * `GET /api/dictionary/game-set` → `GET /v1/m2m/gamepack`
     *
     * The one route with a real upstream, and the only one the games need to
     * play. Named `game-set` because that is what the browser client has always
     * called this operation; it maps onto the Dictionary Node's `gamepack`,
     * which is the successor to the WordPress `/game-set`.
     */
    async function gameSet(url, correlationId) {
        const params = url.searchParams;

        const query = {
            language: readString(params, 'language', LANGUAGE_PATTERN, { required: true }),
            domain: readString(params, 'domain', CODE_PATTERN),
            level: readString(params, 'level', CODE_PATTERN),
            size: readSize(params, config.dictionary.maxPackSize),
            swadesh: readBoolean(params, 'swadesh'),
            audioVerified: readBoolean(params, 'audio_verified'),
            seed: readString(params, 'seed', SEED_PATTERN),
        };

        /*
         * The language must be one this deployment offers. Without this the
         * BFF would happily spend the Dictionary's unique-entry budget on any
         * three-letter string a browser cared to send — the upstream would
         * return an empty pack, but the request was still made and still
         * metered.
         */
        if (!config.languages.some((language) => language.code === query.language)) {
            throw new BadRequestError('language is not offered by this deployment');
        }

        return dictionary.gamePack(query, correlationId);
    }

    /**
     * `GET /api/dictionary/languages`
     *
     * SERVED FROM CONFIGURATION, and that is a known gap rather than a design.
     * The Dictionary Node publishes no languages route — the WordPress original
     * had one, the Node port did not carry it over — so there is nothing to ask
     * and nothing this process could honestly derive. Inventing an upstream
     * would be worse than saying so.
     *
     * The shape matches what the site already consumes, so closing the gap
     * upstream is a change to this function and to nothing else.
     */
    function languages() {
        return {
            languages: config.languages.map((language) => ({
                // `slug` is what the existing client reads; `code` is the ISO
                // 639-3 value the Dictionary's own `language` parameter wants.
                // They are the same string here, and both are published so the
                // client does not have to know that.
                slug: language.code,
                code: language.code,
                name: language.name,
            })),
            /*
             * Stated in the payload, not just in a comment, so the gap is
             * visible to whoever is debugging a short language list at 2am
             * rather than buried in a repo they may not have open.
             */
            source: 'games-bff-configuration',
            note: 'The Dictionary API publishes no /languages route; this list is deployment configuration (GAMES_DICTIONARY_LANGUAGES).',
        };
    }

    /**
     * `GET /api/dictionary/domains`
     *
     * Also with no upstream. Answered as an empty list rather than an error,
     * deliberately: the games' domain selector already treats a failed domain
     * fetch as "All domains", so an empty list degrades to exactly the intended
     * behaviour, while a 5xx would put an error banner in front of a player
     * over a filter that is optional.
     */
    function domains() {
        return {
            domains: [],
            source: 'games-bff-configuration',
            note: 'The Dictionary API publishes no /domains route; the domain filter is unavailable until it does.',
        };
    }

    /**
     * The route table. Exact-match paths only — no prefixes, no patterns, no
     * parameters in the path.
     */
    return {
        'GET /api/dictionary/game-set': { handler: gameSet, upstream: true },
        'GET /api/dictionary/languages': { handler: languages, upstream: false },
        'GET /api/dictionary/domains': { handler: domains, upstream: false },
    };
}

module.exports = { createRoutes, BadRequestError, LANGUAGE_PATTERN, CODE_PATTERN, SEED_PATTERN };
