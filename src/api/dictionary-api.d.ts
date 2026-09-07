/**
 * Sparxstar 3iAtlas Dictionary — REST API type contract.
 *
 * ===================== CONTENT SHAPES ONLY, AS OF 2026-09 =====================
 *
 * This file declares the SHAPES of dictionary content. It no longer declares a
 * client, an auth model, or a browser transport, because there is no longer a
 * browser client to type: the Dictionary API is private, and every request goes
 * through the server-side BFF (`server/`, docs/dictionary-games-bff.md).
 *
 * WHAT WAS REMOVED, AND WHY IT IS NOT COMING BACK:
 *
 *   - `DictionaryApiClient`, `DictionaryClientConfig`,
 *     `createDictionaryApiClient`, `DictionaryApiError` — a browser client for
 *     a private API is the capability the BFF exists to remove.
 *   - The ephemeral page-token flow (its request header and its issuing
 *     route). The
 *     Dictionary Node has no such route: every endpoint there is authenticated
 *     machine-to-machine, and a credential a browser can hold is a credential
 *     that has left the server.
 *   - The consumer API key (`X-Api-Key`). Retired with the WordPress service.
 *     Callers now present an RS256 Identity Node token (`aud: dictionary`).
 *   - `/wordlist`. Retired by the port as an unbounded bulk walk of the corpus,
 *     along with every pagination parameter.
 *
 * The Dictionary Node is the source of truth for these shapes; this file
 * mirrors them and is corrected when it drifts, never the other way round.
 *
 * Standard success envelope: { success: true, data: T, meta: M }
 * Standard error:            { code, message, data: { status: number } }
 *
 * UNVERIFIED AGAINST THE PORT: the display-tier shapes below — `DictionaryEntry`,
 * `LookupResponse`, `SearchResponse`, `LanguagesResponse`, `DomainsResponse`,
 * `WordOfDayResponse`, `SpellResponse` — were written against the WordPress
 * service and have NOT been re-verified against `sparxstar-3iatlas-dictionary-node`.
 * Two of them are known not to exist there: the Node service publishes no
 * `/languages` and no `/domains` route (see docs/dictionary-games-bff.md §7).
 * Do not treat them as a contract without checking the Node service's own
 * `src/domain/types.ts`. The GamePack types are the ones this repo actually
 * consumes and they ARE verified.
 *
 * @see docs/dictionary-games-bff.md
 * @see server/rights.js — the allowlist the BFF actually enforces
 */

// ─── Core data types ──────────────────────────────────────────────────────────

export interface ExampleSentence {
    sentence: string;
    ipa: string;
    phonetic: string;
    translation_en: string;
    translation_fr: string;
}

export interface DictionaryEntry {
    uuid: string;
    headword: string;
    slug: string;
    definition: string;
    translation_en: string;
    translation_fr: string;
    ipa: string;
    phonetic: string;
    part_of_speech: string;
    language: string;
    domain: string;
    origin: string;
    synonyms: string[];
    antonyms: string[];
    example_sentences: ExampleSentence[];
    /**
     * Only present when the requesting endpoint was called with include_audio=true.
     * Absent (key not serialised) when include_audio is false or omitted.
     */
    audio_url?: string | null;
}

export interface SearchItem {
    uuid: string;
    headword: string;
    slug: string;
    definition: string;
    translation_en: string;
    ipa: string;
    language: string;
}

export interface LanguageTerm {
    slug: string;
    name: string;
    count: number;
}

export interface DomainTerm {
    slug: string;
    name: string;
    /** Short domain code used in game-set routing. */
    code: string;
    count: number;
}

/** A word in a game set. Same shape as DictionaryEntry. */
/**
 * One word in a GamePack.
 *
 * NOT `DictionaryEntry` any more. The Node service's GamePack projection is a
 * different, narrower shape, and `server/rights.js` is the authoritative list
 * of what the BFF carries.
 *
 * READ THE EMPTY STRINGS AS DECISIONS, NOT GAPS. `english_definition` and
 * `french_definition` come back EMPTY for an entry whose sourced fields are
 * licensed third-party material, and `audio_url` is null when there is no
 * consented recording. Never substitute another field for a withheld one and
 * never synthesize a media URL — the entry would then read as complete to
 * every consumer downstream.
 */
export interface GameWord {
    entry_id: string;
    concept_id: string | null;
    letter: string;
    header_word: string;
    header_word_root: string;
    normalized_headword: string;
    alternative_spelling: string;
    ajami_form: string;
    part_of_speech: string;
    /** AIWA-elicited and owned; ships regardless of the source's licence. */
    definition: string;
    ipa_pronunciation: string;
    phonetic_pronunciation: string;
    /** Signed and short-lived, or null when no consented recording exists. */
    audio_url: string | null;
    example: { sentence: string; translation_en: string } | null;
    english_lemma: string;
    /** EMPTY when withheld for licensed material. Never backfill it. */
    english_definition: string;
    french_lemma: string;
    /** EMPTY when withheld for licensed material. Never backfill it. */
    french_definition: string;
    domain_code: string;
    difficulty: string;
    /**
     * Is this word's concept on the verified universal list?
     *
     * Optional because a pack compiled before the Dictionary shipped the field
     * simply has no key. Absent must read as "not known to be universal", not
     * as universal: the first-session runway uses it as a hard filter and
     * failing open would put unfamiliar words in the one round that promises
     * familiar ones.
     */
    swadesh?: boolean;
}

export interface SpellResult {
    word: string;
    valid: boolean;
    suggestions: string[];
}

export interface WordOfDayData {
    word: DictionaryEntry;
    /** ISO 8601 calendar date (YYYY-MM-DD). Same word for all users on a given day. */
    date: string;
}

// ─── Response envelope ────────────────────────────────────────────────────────

export interface StandardMeta {
    total?: number;
    page?: number;
    per_page?: number;
}

export interface ApiSuccess<T, M extends object = StandardMeta> {
    success: true;
    data: T;
    meta: M;
}

export interface ApiError {
    code: string;
    message: string;
    data: { status: number };
}

// ─── Endpoint response types ──────────────────────────────────────────────────

/**
 * Discriminated error codes for GET /lookup.
 *
 * Consumers MUST scope their error handling to this allowlist:
 *   - `not_found`     (404) — headword / UUID is genuinely absent from the dictionary.
 *                            Map to null / "word not found" UX.
 *   - `missing_param` (400) — caller supplied neither slug nor uuid. Client bug; surface
 *                            as an error, do NOT silently swallow as null.
 *
 * All other codes (rate_limited, quota_exceeded, invalid_api_key, …) must also surface
 * as errors — fail closed, not null.
 *
 * SCOPE NOTE: `not_found` is reused by /word-of-day with a different meaning ("couldn't
 * select a word today"). Do not apply this allowlist globally — keep it scoped to the
 * lookup() call site.
 */
export type LookupErrorCode = 'not_found' | 'missing_param';

/** GET /lookup?slug=&uuid=&[include_audio=true] */
export interface LookupData {
    word: DictionaryEntry;
}
export type LookupResponse = ApiSuccess<LookupData>;

/** GET /search?q=&[lang_source=]&[per_page=] */
export interface SearchData {
    results: SearchItem[];
}
export type SearchResponse = ApiSuccess<SearchData>;

/** GET /languages */
export interface LanguagesData {
    languages: LanguageTerm[];
}
export type LanguagesResponse = ApiSuccess<LanguagesData>;

/** GET /domains */
export interface DomainsData {
    domains: DomainTerm[];
}
export type DomainsResponse = ApiSuccess<DomainsData>;

/**
 * `GET /api/dictionary/game-set` (BFF) → `GET /v1/m2m/gamepack` (Dictionary).
 *
 * The GamePack shape, which is what the Node service actually returns — not the
 * WordPress `{ words, meta: { lang_source, include_audio } }` this used to
 * declare. Two properties of a pack are worth knowing because they are
 * guarantees, not incidental:
 *
 *   CLOSED GRAPH. Every edge connects two words INSIDE this pack. A dangling
 *   edge would let a consumer walk the corpus graph pack by pack, which is
 *   enumeration wearing a game's clothes.
 *
 *   NO UNCONFIRMED ANSWER KEYS. Only `confirmed` relations travel. A derived
 *   relation is a hypothesis — English synonymy does not transfer — and may
 *   prompt a question in the workshop, never be the answer a game marks you
 *   wrong against.
 */
export interface GamePackEdge {
    from: string;
    to: string;
    type: string;
    /** Always true on a shipped pack. */
    confirmed: boolean;
}

export interface GamePack {
    pack_id: string;
    /** ISO 639-3. */
    language: string;
    domain_code: string | null;
    level: string | null;
    corpus_version: string;
    release_id: string;
    /** ISO 8601. */
    generated_at: string;
    words: GameWord[];
    edges: GamePackEdge[];
    /** The Dictionary's own signature over the pack body, or null if unsigned. */
    signature: string | null;
}

/** The BFF's envelope: `{ ok: true, data: <GamePack> }`. */
export interface BffSuccess<T> {
    ok: true;
    data: T;
}

export type GameSetResponse = BffSuccess<GamePack>;

/** GET /word-of-day */
export type WordOfDayResponse = ApiSuccess<WordOfDayData>;

/**
 * POST /spell  { words: string[] }
 *
 * QUIRK: results are duplicated at both response.data.results (canonical envelope)
 * and response.results (legacy top-level field). Always read from response.data.results.
 */
export interface SpellData {
    results: SpellResult[];
}
export type SpellResponse = ApiSuccess<SpellData> & {
    /** @deprecated Legacy field — duplicate of data.results. Read data.results instead. */
    results?: SpellResult[];
};

// ─── Request parameter types ──────────────────────────────────────────────────

export interface LookupParams {
    /** Word slug. Provide slug OR uuid — at least one is required by the server. */
    slug?: string;
    /** AIWA entry UUID. Alternative to slug. */
    uuid?: string;
    include_audio?: boolean;
}

export interface SearchParams {
    q: string;
    lang_source?: string;
    per_page?: number;
    page?: number;
}

/**
 * Query for `GET /api/dictionary/game-set` on the BFF, which maps onto the
 * Dictionary's `GET /v1/m2m/gamepack`.
 *
 * `lang_source` is gone: the Dictionary Node keys by ISO 639-3 `language`, not
 * by a WordPress taxonomy slug. `include_audio` is gone too — it asked for
 * audio URLs to be added to any entry, and the question a game actually has is
 * `audio_verified`: does this entry HAVE a consented, verified recording. An
 * entry with no consented recording is not a `listen_write` prompt.
 */
export interface GameSetParams {
    /** ISO 639-3, e.g. 'mnk'. Must be one the deployment offers. */
    language: string;
    domain?: string;
    level?: string;
    /** Words per pack. The BFF REFUSES an over-cap value rather than clamping. */
    size?: number;
    swadesh?: boolean;
    audio_verified?: boolean;
    /** Deterministic selection seed: same seed + corpus version → same pack. */
    seed?: string;
}

export interface SpellParams {
    words: string[];
}

// ─── No client is declared here ───────────────────────────────────────────────
//
// There is deliberately no `DictionaryApiClient` interface, no
// `DictionaryClientConfig`, and no `createDictionaryApiClient`. See the header:
// the Dictionary API is private, so a typed browser client for it would be a
// published capability rather than a convenience.
//
// The games read content through the BFF's own routes
// (`GET /api/dictionary/game-set`), whose response is
// `{ ok: true, data: <GamePack> }` narrowed by `server/rights.js`. The word
// shape is `GameWord` above; the fields the BFF carries are listed in
// `server/rights.js` and are the contract that matters at runtime.
