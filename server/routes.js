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

/**
 * Languages Dictionary Games serves from public-domain material only.
 *
 * `mnk` (Mandinka) is restricted to the Peace Corps corpus. A set rather than
 * a comparison so the next language is a data change, and so the rule reads as
 * a policy list rather than as a special case buried in a handler.
 */
const PEACE_CORPS_ONLY_LANGUAGES = new Set(['mnk']);

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

/**
 * Refuse a repeated query parameter.
 *
 * `URLSearchParams.get` returns the FIRST value, so `?size=5&size=500` would
 * have been read as 5 while a reader of the raw request — or an upstream that
 * parsed it differently — saw 500. Two readings of one request is not a value,
 * so it is a refusal. The same reasoning the Identity Node applies to a
 * repeated form field.
 */
function refuseRepeated(params, name) {
    if (params.getAll(name).length > 1) {
        throw new BadRequestError(`${name} must not be repeated`);
    }
}

/**
 * The pack size, from `size` or its accepted alias `limit`.
 *
 * ===================== WHY THERE IS AN ALIAS AT ALL =====================
 *
 * `size` is the CANONICAL name and the only one that ever leaves this process:
 * it is what the Dictionary's `/v1/m2m/gamepack` accepts, so there is exactly
 * one upstream contract and this function is where the two spellings converge.
 *
 * `limit` is accepted because it was already the name of this concept on the
 * browser side — `useGameSet({ limit })` is the package's own public option —
 * and because the allowlist above DROPS anything it does not recognise. That
 * combination is what broke production: a caller sent `limit=5`, the parameter
 * was dropped without a word, no size reached the Dictionary, and the
 * Dictionary's own default for an absent size was its MAXIMUM. A 200-word pack
 * on a 9,134-entry corpus is ~140 KB against a 102,400-byte ceiling, so every
 * such request came back `response_too_large`.
 *
 * Silently dropping a parameter a client plainly meant is the failure mode
 * here, not the alias. If both spellings arrive they must AGREE — picking one
 * would be choosing which half of a contradictory request to honour.
 */
function readPackSize(params, maximum) {
    refuseRepeated(params, 'size');
    refuseRepeated(params, 'limit');

    /*
     * Each spelling is parsed on its OWN before they are compared, and the
     * comparison is between NUMBERS.
     *
     * Comparing the raw strings looked equivalent and was not: `?size=05&limit=5`
     * is the same request written two ways — the pattern below accepts a
     * leading zero and `Number()` normalizes it — but a string comparison
     * called them a disagreement and returned 400. So a value that either
     * spelling accepted alone was refused when sent under both, which is the
     * opposite of what "accepted when they agree" promises.
     *
     * Parsing first also means a malformed value is named as malformed rather
     * than being mistaken for a conflict: `?size=abc&limit=5` is a bad `size`,
     * not two clients disagreeing.
     */
    const parsed = ['size', 'limit']
        .map((name) => ({ name, raw: params.get(name) }))
        .filter((entry) => entry.raw !== null && entry.raw !== '')
        .map((entry) => ({
            name: entry.name,
            value: parsePackSize(entry.name, entry.raw, maximum),
        }));

    if (parsed.length === 0) {
        /*
         * Omitted. Nothing is forwarded and the DICTIONARY applies the default,
         * which is deliberate: the default and the maximum are one fact and
         * they live upstream, where the byte ceiling they are derived from is
         * also enforced. A second default here would be a second number to
         * drift.
         */
        return undefined;
    }
    if (parsed.length === 2 && parsed[0].value !== parsed[1].value) {
        throw new BadRequestError('size and limit disagree; send one of them');
    }

    return parsed[0].value;
}

/**
 * Parse one spelling of the pack size.
 *
 * @param {string} name  Which spelling, so a refusal names the field the
 *                       caller actually sent rather than always saying `size`.
 */
function parsePackSize(name, raw, maximum) {
    // Bounded before Number(): rejects '+5', '5e2', '1.5', ' 5', '-1' and
    // anything long enough to be an attempt at something else.
    if (!/^\d{1,4}$/.test(raw)) {
        throw new BadRequestError(`${name} must be a positive integer`);
    }
    const value = Number(raw);
    if (value < 1) throw new BadRequestError(`${name} must be at least 1`);
    /*
     * Refused here rather than clamped. Clamping would silently serve 50 words
     * to a client that asked for 500 and believes it got them — and the
     * upstream's own answer to an over-cap request is a 400, so clamping would
     * also make this BFF more permissive than the service it fronts.
     */
    if (value > maximum) throw new BadRequestError(`${name} must not exceed ${maximum}`);
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

        // Every accepted parameter is scalar. A repeated one is two readings of
        // one request, so it is refused rather than silently resolved to the
        // first. `size`/`limit` are checked inside readPackSize.
        for (const name of ['language', 'domain', 'level', 'swadesh', 'audio_verified', 'seed']) {
            refuseRepeated(params, name);
        }

        const query = {
            language: readString(params, 'language', LANGUAGE_PATTERN, { required: true }),
            domain: readString(params, 'domain', CODE_PATTERN),
            level: readString(params, 'level', CODE_PATTERN),
            size: readPackSize(params, config.dictionary.maxPackSize),
            swadesh: readBoolean(params, 'swadesh'),
            audioVerified: readBoolean(params, 'audio_verified'),
            seed: readString(params, 'seed', SEED_PATTERN),
            /*
             * MANDINKA IS SERVED FROM THE PEACE CORPS MATERIAL ONLY.
             *
             * Set HERE, from the language, and never read from the query.
             * A corpus restriction a client can ask for is a corpus
             * restriction a client can decline: the browser is not a place to
             * enforce which material a product may serve, and the games client
             * could not enforce it even if it wanted to, because the fields
             * that identify a Peace Corps entry (`source`, `source_batch`) are
             * on the Dictionary's GAME_PACK_FORBIDDEN list and never reach it.
             *
             * `public_domain` is the property the Dictionary filters on. For
             * the release-1 corpus that is exactly "cites Peace Corps and
             * nothing more restrictive", so the ~1,004 entries citing both
             * Peace Corps and Gamble — licensed third-party material — are
             * excluded. The Dictionary drift-guards that equivalence.
             *
             * Scoped to this product and this language deliberately: no other
             * consumer of the Dictionary is affected, and no other language is
             * narrowed. Widening or lifting it is an owner/AIWA decision, not
             * a client one.
             */
            publicDomain: PEACE_CORPS_ONLY_LANGUAGES.has(
                readString(params, 'language', LANGUAGE_PATTERN, { required: true })
            ),
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
