/**
 * Sparxstar 3iAtlas Dictionary — typed REST API client.
 *
 * Requires a bundler (webpack, Vite, esbuild). Not intended for direct Node require().
 *
 * Usage — consumer app (API key):
 *   import { createDictionaryApiClient } from '@sparxstar/dictionary-api';
 *   const dict = createDictionaryApiClient({
 *     baseUrl: 'https://example.com/wp-json/sparxstar/v1/dictionary',
 *     apiKey: 'sk_...',
 *   });
 *   const res = await dict.languages();
 *
 * Usage — same-origin browser app (page-token flow):
 *   const dict = createDictionaryApiClient({ baseUrl: window.sparxstarDictionarySettings.restUrl });
 *   const tokenRes = await dict.getPageToken();
 *   dict.setPageToken(tokenRes.data.token);
 *   const res = await dict.lookup({ slug: 'my-word' });
 *
 * /wordlist requires a consumer API key. Sending an ephemeral page token to
 * that endpoint returns 403.
 *
 * @module DictionaryApiClient
 */

/**
 * Thrown when the server returns a non-2xx response.
 *
 * @property {string} code   — WP REST error code (e.g. "rest_missing_callback_param")
 * @property {number} status — HTTP status code
 */
export class DictionaryApiError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   */
  constructor(code, message, status) {
    super(message);
    this.name = "DictionaryApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Creates a Dictionary API client.
 *
 * @param {import('./dictionary-api').DictionaryClientConfig} config
 * @returns {import('./dictionary-api').DictionaryApiClient}
 */
export function createDictionaryApiClient(config) {
  if (!config.baseUrl) {
    throw new Error("baseUrl is required in DictionaryApiClient configuration");
  }
  let pageToken = config.pageToken ?? "";
  const apiKey = config.apiKey ?? "";
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  /**
   * Build request headers.
   *
   * consumerOnly=true suppresses X-Page-Token. Used for /wordlist because the
   * server rejects ephemeral tokens on consumer-only endpoints with 403.
   *
   * @param {boolean} [consumerOnly]
   * @returns {Record<string, string>}
   */
  function buildHeaders(consumerOnly = false) {
    /** @type {Record<string, string>} */
    const h = {};
    if (apiKey) h["X-Api-Key"] = apiKey;
    if (!consumerOnly && pageToken) h["X-Page-Token"] = pageToken;
    return h;
  }

  /**
   * Parse a fetch Response, throwing DictionaryApiError on non-2xx.
   *
   * @param {Response} res
   * @returns {Promise<unknown>}
   */
  async function parseResponse(res) {
    if (res.status === 304) {
      return null;
    }
    let json;
    try {
      json = await res.json();
    } catch {
      throw new DictionaryApiError(
        "parse_error",
        "Invalid JSON response",
        res.status,
      );
    }
    if (!res.ok) {
      const err = /** @type {import('./dictionary-api').ApiError} */ (json);
      throw new DictionaryApiError(
        err?.code ?? "api_error",
        err?.message ?? `HTTP ${res.status}`,
        res.status,
      );
    }
    return json;
  }

  let activeRefreshPromise = null;

  /**
   * Refresh the ephemeral page token by calling GET /page-token.
   * Concurrent callers share the same in-flight request.
   *
   * @returns {Promise<boolean>} True if a new token was obtained.
   */
  function refreshPageToken() {
    if (activeRefreshPromise) return activeRefreshPromise;
    activeRefreshPromise = (async () => {
      try {
        const res = await fetch(`${baseUrl}/page-token`);
        if (!res.ok) return false;
        const json = await res.json();
        const token = json?.data?.token ?? "";
        if (token) {
          pageToken = token;
          return true;
        }
      } catch {
        // Degrade silently — caller handles the error response.
      } finally {
        activeRefreshPromise = null;
      }
      return false;
    })();
    return activeRefreshPromise;
  }

  /**
   * GET request with one automatic page-token refresh on 401.
   *
   * @param {string} path         Relative path (e.g. '/lookup').
   * @param {URLSearchParams|null} [params]
   * @param {boolean} [consumerOnly]
   * @returns {Promise<unknown>}
   */
  async function get(path, params = null, consumerOnly = false) {
    const url = params ? `${baseUrl}${path}?${params}` : `${baseUrl}${path}`;
    let res = await fetch(url, { headers: buildHeaders(consumerOnly) });

    if (res.status === 401 && !consumerOnly) {
      const refreshed = await refreshPageToken();
      if (refreshed) {
        res = await fetch(url, { headers: buildHeaders(consumerOnly) });
      }
    }

    return parseResponse(res);
  }

  /**
   * POST request.
   *
   * @param {string} path
   * @param {unknown} body
   * @returns {Promise<unknown>}
   */
  async function post(path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildHeaders() },
      body: JSON.stringify(body),
    });
    return parseResponse(res);
  }

  return {
    setPageToken(token) {
      pageToken = token;
    },

    /**
     * GET /lookup
     *
     * @param {import('./dictionary-api').LookupParams} params
     * @returns {Promise<import('./dictionary-api').LookupResponse>}
     */
    async lookup({ slug, uuid, include_audio = false }) {
      const p = new URLSearchParams();
      if (slug) p.set("slug", slug);
      if (uuid) p.set("uuid", uuid);
      if (include_audio) p.set("include_audio", "true");
      return /** @type {any} */ (get("/lookup", p));
    },

    /**
     * GET /search
     *
     * @param {import('./dictionary-api').SearchParams} params
     * @returns {Promise<import('./dictionary-api').SearchResponse>}
     */
    async search({ q, lang_source, per_page, page }) {
      const p = new URLSearchParams({ q });
      if (lang_source) p.set("lang_source", lang_source);
      if (per_page != null) p.set("per_page", String(per_page));
      if (page != null) p.set("page", String(page));
      return /** @type {any} */ (get("/search", p));
    },

    /**
     * GET /wordlist — consumer API key required.
     * Ephemeral page token is not sent to this endpoint (server returns 403).
     *
     * @param {import('./dictionary-api').WordlistParams} params
     * @returns {Promise<import('./dictionary-api').WordlistResponse>}
     */
    async wordlist({ lang_source, per_page, page, include_audio = false }) {
      const p = new URLSearchParams({ lang_source });
      if (per_page != null) p.set("per_page", String(per_page));
      if (page != null) p.set("page", String(page));
      if (include_audio) p.set("include_audio", "true");
      return /** @type {any} */ (get("/wordlist", p, true));
    },

    /**
     * GET /languages
     *
     * @returns {Promise<import('./dictionary-api').LanguagesResponse>}
     */
    async languages() {
      return /** @type {any} */ (get("/languages"));
    },

    /**
     * GET /domains
     *
     * @returns {Promise<import('./dictionary-api').DomainsResponse>}
     */
    async domains() {
      return /** @type {any} */ (get("/domains"));
    },

    /**
     * GET /game-set
     *
     * @param {import('./dictionary-api').GameSetParams} params
     * @returns {Promise<import('./dictionary-api').GameSetResponse>}
     */
    async gameSet({ lang_source, domain, limit, include_audio = false }) {
      const p = new URLSearchParams({ lang_source });
      if (domain) p.set("domain", domain);
      if (limit != null) p.set("limit", String(limit));
      if (include_audio) p.set("include_audio", "true");
      return /** @type {any} */ (get("/game-set", p));
    },

    /**
     * GET /word-of-day
     *
     * @returns {Promise<import('./dictionary-api').WordOfDayResponse>}
     */
    async wordOfDay() {
      return /** @type {any} */ (get("/word-of-day"));
    },

    /**
     * POST /spell
     *
     * QUIRK: results appear at both response.data.results (canonical) and
     * response.results (legacy top-level). Always read from response.data.results.
     *
     * @param {import('./dictionary-api').SpellParams} params
     * @returns {Promise<import('./dictionary-api').SpellResponse>}
     */
    async spell({ words }) {
      return /** @type {any} */ (post("/spell", { words }));
    },

    /**
     * GET /page-token — no credentials required.
     * Use the returned token with setPageToken() before browse requests.
     *
     * @returns {Promise<import('./dictionary-api').PageTokenResponse>}
     */
    async getPageToken() {
      return /** @type {any} */ (get("/page-token"));
    },
  };
}
