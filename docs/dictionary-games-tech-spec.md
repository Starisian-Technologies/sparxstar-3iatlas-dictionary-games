# Dictionary Games (RLC Games) — Technical Specification

> Product group: **IAtlas** · Source repo:
> `Starisian-Technologies/sparxstar-3iatlas-dictionary-games` · Registry path:
> `specs/IAtlas/dictionary-games-tech-spec.md`
>
> This spec must reflect what the code actually does. When the code changes in
> a way that affects this document (new endpoints consumed, changed data model,
> new seams, removed features), update it and submit the change to the spec
> registry via PR. Update the Changelog with every meaningful change.

## 1. Identity

- **Name:** 3iAtlas Dictionary Games (a.k.a. RLC Games).
- **Package:** `sparxstar-rlc-games` (npm `name`), built as the UMD global
  `RlcGames`.
- **What it is:** A standalone, browser-only React package providing a game
  shell, six learning-game components, client-side session/progress hooks, an
  IndexedDB caching layer, and a typed REST client for the 3iAtlas dictionary
  API. Extracted from `sparxstar-3iatlas-dictionary`; it carries no PHP and no
  server-side logic.
- **Primary surface:** `<GameShell />`, mounted by host shells (AIWA Browse App
  Play tab, RLC standalone builds, WordPad/S2S).

## 2. Role boundary

See `ROLE.md` (authoritative). Summary:

- **Owns:** the game UI/UX, the six games, client session + progress state, the
  IndexedDB cache, and the browser-side dictionary REST client + its type
  contract mirror.
- **Does not own:** dictionary data, the REST API server and its auth, Helios
  identity/token issuance, audio generation, entry enrichment, WordPress/PHP, or
  the host app chrome.
- **Contracts produced:** none — consumes contracts only.

## 3. Platform citations

This repo follows the platform governance snapshot at
`.github/instructions/governance/` (compiled ADRs, invariants, open questions —
read-only, auto-synced). Cite ADRs and invariants by number from that snapshot;
do not restate them here.

Open questions this repo is bound by: **OQ-G1** (Helios token source), **OQ-G3**
(LetterReveal asset), **OQ-G4** (DomainFlash confirmation hook), **OQ-I3** (guest
device progress merge). Upstream dictionary specs are referenced (not vendored)
in `AGENTS.md`.

## 4. Architecture

- **Build:** webpack 5, single entry `src/index.jsx`, UMD output
  (`dist/js/rlc-games.min.js`, library `RlcGames`). `react` and `react-dom` are
  webpack `externals` — the host provides them. CSS is extracted via
  `mini-css-extract-plugin` and processed with PostCSS/Tailwind utilities; the
  host is expected to supply the Tailwind runtime/utility classes.
- **Runtime layering:**
    - `index.jsx` — public exports.
    - `components/GameShell.jsx` — orchestrates the three phases
      (setup → playing → complete), language selection, and game routing.
    - `components/games/*` — one component per game; each reports per-word results
      upward via callbacks.
    - `components/AccessoryBar.jsx` — floating Mandinka special-character input bar
      (positions above the on-screen keyboard via `window.visualViewport`).
    - `components/SessionComplete.jsx` — end-of-session summary.
    - `hooks/*` — data fetching (`useGameSet`), session lifecycle
      (`useGameSession`), progress queue (`useProgressSync`), IndexedDB primitives
      (`idbUtils`).
    - `api/*` — `createDictionaryApiClient` factory + TypeScript contract.
- **Data flow:** `GameShell` → `useGameSet` → REST `/game-set` (cached in
  IndexedDB, 3-day TTL) → game components → `useGameSession.recordResult` →
  IndexedDB session + learned-words → `useProgressSync.addEvent` → outbox
  (network sync deferred to OQ-G1).

## 5. Data model

- **IndexedDB database:** `aiwa-games-db`, version 1, key path `key` on every
  store.

    | Store             | Contents                                                                  |
    | ----------------- | ------------------------------------------------------------------------- |
    | `game-sets`       | Cached `/game-set` responses, keyed by lang+domain+limit+audio; 3-day TTL |
    | `game-sessions`   | Current session (`game-session:current`), persisted per word result       |
    | `progress-outbox` | Pending event queue (`progress-outbox:pending`)                           |
    | `learned-words`   | Cumulative correctly-written UUIDs (`learned-words:production`)           |

- **Core API types** (`src/api/dictionary-api.d.ts`): `DictionaryEntry`,
  `ExampleSentence`, `SearchItem`, `WordlistEntry`, `LanguageTerm`, `DomainTerm`,
  `GameWord` (= `DictionaryEntry`), `SpellResult`, `PageTokenData`,
  `WordOfDayData`. Success envelope: `{ success, data, meta }`; error:
  `{ code, message, data: { status } }`.
- **Production vs recognition:** `PRODUCTION_GAMES =
{ listen_write, arrange_word, complete_sentence, letter_reveal }`. Only these
  increment the learned-words count; `meaning_match` and `domain_flash` are
  recognition-only.

## 6. API surface

### 6a. Consumed REST endpoints (namespace `sparxstar/v1/dictionary`)

| Method | Path           | Auth                            | Used by                   |
| ------ | -------------- | ------------------------------- | ------------------------- |
| GET    | `/lookup`      | page token or API key           | client `lookup()`         |
| GET    | `/search`      | page token or API key           | client `search()`         |
| GET    | `/wordlist`    | API key only (page token → 403) | client `wordlist()`       |
| GET    | `/languages`   | page token or API key           | client `languages()`      |
| GET    | `/domains`     | page token or API key           | client `domains()`        |
| GET    | `/game-set`    | page token or API key           | `useGameSet`, `gameSet()` |
| GET    | `/word-of-day` | page token or API key           | client `wordOfDay()`      |
| POST   | `/spell`       | page token or API key           | client `spell()`          |
| GET    | `/page-token`  | none                            | token bootstrap/refresh   |

Quirks the client encodes: `/spell` duplicates results at `data.results`
(canonical) and top-level `results` (legacy) — always read `data.results`.
`/game-set` returns non-standard meta (`total`, `lang_source`, `domain`,
`include_audio`; no `page`/`per_page`). `limit` is capped at 50 server-side
(default 20). A 401 on a non-consumer-only GET triggers one automatic
page-token refresh and retry.

### 6b. Exported JS surface (`src/index.jsx`)

`GameShell`, `AccessoryBar`, `SessionComplete`, `useGameSet`, `useGameSession`,
`useProgressSync`, `openDB`, `getRecord`, `putRecord`, `getAllRecords`,
`deleteRecord`, `PRODUCTION_GAMES`, `createDictionaryApiClient`,
`DictionaryApiError`.

`<GameShell />` props: `restUrl`, `language`, `sourceLanguage`, `languages`,
`onSourceLanguage`, `onBrowse`.

## 7. Seams

- **REST seam:** all server interaction goes through `createDictionaryApiClient`
  / `useGameSet`. Auth is injected (API key or page token); no other module
  talks to the network.
- **Host seam:** `<GameShell />` props + `react`/`react-dom` externals. The host
  supplies React, Tailwind styling, navigation (`onBrowse`), and source-language
  state (`onSourceLanguage`).
- **Persistence seam:** `idbUtils` is the only IndexedDB access point; all hooks
  go through it and degrade gracefully when IndexedDB is unavailable.
- **Progress seam (deferred):** `useProgressSync.addEvent` writes to the outbox;
  `syncNow()` is the future network seam, gated on OQ-G1.
- **Global config seam:** `window.sparxstarDictionarySettings` (`restUrl`,
  `pageToken`) is read/refreshed by `useGameSet`.

## 8. Dependencies

- **Runtime:** `react` ^18.3.1, `react-dom` ^18.3.1 (both host-provided via
  externals), `lucide-react` ^0.300.0.
- **Build/dev:** webpack 5 + babel (`@babel/preset-env`, `@babel/preset-react`),
  `mini-css-extract-plugin`, `css-minimizer-webpack-plugin`,
  `terser-webpack-plugin`, PostCSS, Tailwind 3, ESLint 8, Prettier 3, Jest 29.
- **Upstream service:** the 3iAtlas dictionary REST API
  (`sparxstar-3iatlas-dictionary`).
- **No PHP / Composer dependencies** — this repo pulls no private Composer
  packages, so it needs no composer-resolver auth in CI.

## 9. Security and privacy

- **Auth model (Webster):** ephemeral page token (`X-Page-Token`) for
  same-origin browse; consumer API key (`X-Api-Key`) for all endpoints including
  `/wordlist`. `GET /page-token` is unauthenticated. Keys are SHA-256 hashed
  server-side.
- **Hard red lines:**
    - `syncNow()` must not post to the network until the Game-Service intake spec
      is committed and OQ-G1 resolves with an approved token-delivery mechanism.
    - Never read Helios Bearer tokens from `localStorage` (XSS exposure).
    - Never emit `Access-Control-Allow-Credentials`.
    - No WordPress auth (`is_user_logged_in()`) on game endpoints.
    - Never send an ephemeral page token to `/wordlist`.
- **Privacy:** all learner progress is local (IndexedDB) until an approved sync
  path exists. No PII is collected by this layer.

## 10. Current state

- Six games, the shell, hooks, IndexedDB layer, and REST client are present and
  exported. The package builds to a UMD bundle.
- Progress sync is intentionally local-only (`syncNow()` is a no-op) pending
  OQ-G1.
- LetterReveal uses an emoji placeholder for the pottery animation pending an
  approved asset (OQ-G3).
- Tests: `jest --passWithNoTests` (no test suites committed yet).
- Styling assumes the host supplies the Tailwind runtime; no Tailwind/PostCSS
  config or CSS entry is vendored in this repo.

## 11. Open items

| ID    | Description                                                                  |
| ----- | ---------------------------------------------------------------------------- |
| OQ-G1 | Helios token source — network progress sync blocked until resolved           |
| OQ-G3 | LetterReveal pottery animation — awaiting AIWA-approved asset                |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                    |
| OQ-I3 | Guest device progress merge — blocked on Game Service intake spec            |
| —     | Add a test suite; confirm Tailwind/PostCSS ownership (host vs package)       |
| —     | Reconcile npm package name (`sparxstar-rlc-games`) with repo name if desired |

## 12. Changelog

- **2026-06-29** — Initial spec. Repo restructured out of the extracted archive
  into a standard layout; governance, standards workflow, and AI-agent
  instruction files added.
