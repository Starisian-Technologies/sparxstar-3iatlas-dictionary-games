/**
 * Sparxstar 3iAtlas Dictionary — REST API type contract.
 *
 * Base namespace: sparxstar/v1/dictionary
 *
 * Auth model (Webster):
 *   - Ephemeral page token (X-Page-Token header) — browse endpoints, same-origin apps
 *   - Consumer API key  (X-Api-Key header)        — all endpoints, including /wordlist
 *   - GET /page-token                             — no credentials required
 *   - /wordlist rejects ephemeral page tokens with 403; API key only.
 *
 * Standard success envelope: { success: true, data: T, meta: M }
 * Standard error:            { code, message, data: { status: number } }
 *
 * @see AGENTS.md §REST API and §Authentication Rule
 * @see .github/instructions/3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md
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

export interface WordlistEntry {
  headword: string;
  slug: string;
  uuid: string;
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
export type GameWord = DictionaryEntry;

export interface SpellResult {
  word: string;
  valid: boolean;
  suggestions: string[];
}

export interface PageTokenData {
  token: string;
  /** Unix timestamp (seconds). */
  expires_at: number;
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
export type LookupErrorCode = "not_found" | "missing_param";

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

/**
 * GET /wordlist?lang_source=&[per_page=]&[page=]&[include_audio=true]
 *
 * Consumer API key required. Ephemeral page token is rejected with 403.
 */
export interface WordlistData {
  words: WordlistEntry[];
}
export type WordlistResponse = ApiSuccess<WordlistData>;

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
 * GET /game-set?lang_source=&[domain=]&[limit=]&[include_audio=true]
 *
 * NOTE: non-standard meta — no page/per_page fields.
 */
export interface GameSetMeta {
  total: number;
  lang_source: string;
  domain: string;
  include_audio: boolean;
}
export interface GameSetData {
  words: GameWord[];
}
export type GameSetResponse = ApiSuccess<GameSetData, GameSetMeta>;

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

/** GET /page-token — no credentials required */
export type PageTokenResponse = ApiSuccess<PageTokenData>;

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

export interface WordlistParams {
  lang_source: string;
  per_page?: number;
  page?: number;
  include_audio?: boolean;
}

export interface GameSetParams {
  lang_source: string;
  domain?: string;
  /** Capped at 50 server-side. Default 20. */
  limit?: number;
  include_audio?: boolean;
}

export interface SpellParams {
  words: string[];
}

// ─── Client configuration ─────────────────────────────────────────────────────

export interface DictionaryClientConfig {
  /**
   * Full base URL of the dictionary REST namespace.
   * Example: "https://example.com/wp-json/sparxstar/v1/dictionary"
   */
  baseUrl: string;
  /**
   * Consumer API key (X-Api-Key).
   * Required for /wordlist. Enables all other endpoints without needing a page token.
   */
  apiKey?: string;
  /**
   * Ephemeral page token (X-Page-Token).
   * Cannot be used for /wordlist. Call getPageToken() to obtain one.
   */
  pageToken?: string;
}

// ─── Client interface ─────────────────────────────────────────────────────────

export interface DictionaryApiClient {
  lookup(params: LookupParams): Promise<LookupResponse>;
  search(params: SearchParams): Promise<SearchResponse>;
  /**
   * Consumer API key required. Sending an ephemeral page token to this
   * endpoint returns 403.
   */
  wordlist(params: WordlistParams): Promise<WordlistResponse>;
  languages(): Promise<LanguagesResponse>;
  domains(): Promise<DomainsResponse>;
  gameSet(params: GameSetParams): Promise<GameSetResponse>;
  wordOfDay(): Promise<WordOfDayResponse>;
  spell(params: SpellParams): Promise<SpellResponse>;
  /**
   * Obtain a fresh ephemeral page token. No credentials required.
   * Pass the returned token to setPageToken() before calling browse endpoints.
   */
  getPageToken(): Promise<PageTokenResponse>;
  /** Store a page token for subsequent requests. */
  setPageToken(token: string): void;
}

export declare class DictionaryApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number);
}

export declare function createDictionaryApiClient(
  config: DictionaryClientConfig,
): DictionaryApiClient;
