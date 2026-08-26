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

Open questions this repo is bound by: **OQ-G3** (LetterReveal asset), **OQ-G4**
(DomainFlash confirmation hook), **OQ-I3** (guest device progress merge). The
progress-sync blocker previously cited here as "OQ-G1" is now stated directly,
in plain language, in §11 — see the note there for why that label is retired
as a citation. Upstream dictionary specs are referenced (not vendored) in
`AGENTS.md`.

This repo is also the client side of `sparxstar-3iatlas-rlc-node-engine`'s
**GAME-SERVICE-INTAKE-SPEC-v1.0** (`.github/instructions/GAME-SERVICE-INTAKE-SPEC-v1.0.md`
in that repo) — the engine-side spec for the `game.result` batch event this
repo's `syncNow()` now targets (§4, §7, §11). That spec's **OQ-3** (outbox
couldn't populate a conformant `GameResultEvent` — only reported `correct`,
no `attempts`/`time_ms`) was resolved from this side, 2026-08-05: see §11.

## 4. Architecture

- **Build (two targets, 2026-08-25):** webpack 5.
    - **Package** — `webpack.config.js`, entry `src/index.jsx`, UMD output
      (`dist/js/rlc-games.min.js`, library `RlcGames`). `react` and `react-dom`
      are webpack `externals` — the host provides them. CSS is extracted via
      `mini-css-extract-plugin` and processed with PostCSS/Tailwind utilities;
      the host is expected to supply the Tailwind runtime/utility classes.
      **Unchanged** by the website work.
    - **Website** — `webpack.site.config.js`, entry `src/site/main.jsx`, output
      `dist-site/` (`index.html` plus content-hashed JS/CSS under `/assets/`),
      React bundled, Tailwind vendored via `src/site/styles.css`. This is the
      `games.sparxstar.com` artifact; see §12 for everything about it. It also
      settles the long-open "Tailwind: host or package?" question for the one
      case the repo controls — the site is a host, so the site owns the CSS
      entry, and the package still ships none.
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
  IndexedDB, 3-day TTL) → game components (each timing its own per-word
  elapsed time via a `wordStartRef`) → `onResult(uuid, outcome, attempts, xp,
timeMs)` → `useGameSession.recordResult` → IndexedDB session +
  learned-words, and in parallel `useProgressSync.addEvent({ type:
'game_result', run_id, word_uuid, ... })` → outbox → `syncNow()`. The
  `run_id` comes from the session `useGameSession.initSession` stamped
  (`src/ids.js`); together with `word_uuid` it is what the engine keys its
  per-question award claim on, so it is not optional decoration — see §12.3
  and §6c. Network sync is **gated** on a supplied token, and the bundled
  website (§12) is the first thing in this platform that can supply one.
- **Backend connectivity (updated 2026-08-05, Phase 3):** this repo now has a
  **conditional, dependency-injected** connection to
  `sparxstar-3iatlas-rlc-node-engine`. `useProgressSync.syncNow()`
  (`src/hooks/useProgressSync.js`) POSTs to `{engineUrl}/events/batch` — the
  engine's `game.result` intake (GAME-SERVICE-INTAKE-SPEC-v1.0) — via the
  native `fetch()` API (no new package dependency), but **only** when the
  host app supplies both an `engineUrl` and a `getSuiteToken` callback
  (new optional `<GameShell />` props, §6b) and `getSuiteToken()` actually
  resolves to a token. Neither is supplied by anything in this repo or wired
  up by any host shell today — there is still no suite-token issuer anywhere
  in this platform (§11) — so in production this stays exactly as inert as
  before: no request is ever made. The code path itself, however, is real,
  fully built, and integration-tested (against a fake injected token) rather
  than theoretical. All other network traffic in this repo — through
  `DictionaryApiClient.js` or the page-token reads in `useGameSet.js`
  (`/game-set`) and `GameShell.jsx` (`/domains`), both of which now go
  through the shared `src/api/pageToken.js` helper — is
  unaffected and still targets only the separate Webster Dictionary
  WordPress REST API (`sparxstar/v1/dictionary`, §6a); none of it is
  related to game state or backend authority, and nothing in the Phase 3
  diff adds a write path toward that dictionary API. Game session state,
  scoring, and progress remain computed and persisted **entirely
  client-side in IndexedDB** (§5) as the durable source of truth; the
  engine, when reachable, is a settlement/reward sink for already-recorded
  local results, not an authority this repo reads from.

## 5. Data model

- **IndexedDB database:** `aiwa-games-db`, version 1, key path `key` on every
  store.

    | Store             | Contents                                                                  |
    | ----------------- | ------------------------------------------------------------------------- |
    | `game-sets`       | Cached `/game-set` responses, keyed by lang+domain+limit+audio; 3-day TTL |
    | `game-sessions`   | Current session (`game-session:current`), persisted per word result       |
    | `progress-outbox` | Pending event queue (`progress-outbox:pending`)                           |
    | `learned-words`   | Cumulative correctly-written UUIDs (`learned-words:production`)           |

- **Run identifier (2026-08-25).** Every `game-sessions` record carries a
  `runId`, minted once per `initSession` (`src/ids.js`) and stable for the whole
  play-through; a session resumed from an older build is backfilled with one on
  load. It is sent as the `game.result` payload's `session_id` and is the
  `run_id` half of the engine's award claim, so its two properties are
  load-bearing in opposite directions: **stable within a run** (or a refresh
  pays twice) and **unique across runs** (or a replay never settles). Covered by
  `src/hooks/__tests__/useGameSession.test.js`.
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

| Method | Path           | Auth                            | Used by                                                      |
| ------ | -------------- | ------------------------------- | ------------------------------------------------------------ |
| GET    | `/lookup`      | page token or API key           | client `lookup()`                                            |
| GET    | `/search`      | page token or API key           | client `search()`                                            |
| GET    | `/wordlist`    | API key only (page token → 403) | client `wordlist()`                                          |
| GET    | `/languages`   | page token or API key           | client `languages()`                                         |
| GET    | `/domains`     | page token or API key           | client `domains()`, `GameShell.jsx` via `fetchWithPageToken` |
| GET    | `/game-set`    | page token or API key           | `useGameSet`, `gameSet()`                                    |
| GET    | `/word-of-day` | page token or API key           | client `wordOfDay()`                                         |
| POST   | `/spell`       | page token or API key           | client `spell()`                                             |
| GET    | `/page-token`  | none                            | token bootstrap/refresh                                      |

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
`onSourceLanguage`, `onBrowse`, plus (Phase 3, both optional, no default)
`engineUrl` (node-engine base URL) and `getSuiteToken` (`() =>
string|null|Promise<string|null>`, the bearer token for the engine's batch
endpoint). Omitting either keeps progress sync local-only, unchanged from
pre-Phase-3 behavior — see §4 and §11.

### 6c. Produced event contract (`game.result` → the engine)

`POST {engineUrl}/events/batch`, `Authorization: Bearer <suite token>`, body
`{ events: [...] }` (max 200). Each element:

```
{ event_id, event_type: 'game.result', payload: { … } }
```

| Field                | Source                                                | Why the engine needs it                                                                                                                                      |
| :------------------- | :---------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`           | minted once at queue time (`newEventId`)              | Transport idempotency. `processed_events` dedupes on it, so re-flushing an unconfirmed outbox is a no-op. Never regenerated on retry — that would defeat it. |
| `payload.game_type`  | constant `dictionary_quiz`                            | The one manifest registered for this client. Not a per-minigame id; the minigame stays local. An unregistered value is rejected `unsupported_game_type`.     |
| `payload.session_id` | the session's `runId`                                 | The run. Namespaced `solo:` server-side and used as `run_id` in the award claim. Empty ⇒ `run_id_required`.                                                  |
| `payload.deal_id`    | the dictionary entry `uuid`                           | The question. Empty ⇒ `question_id_required`.                                                                                                                |
| `payload.word_uuid`  | the same `uuid`                                       | Retained alongside `deal_id` so a later change to how a question is keyed cannot silently re-point the dictionary reference. Ignored by the engine today.    |
| `payload.outcome`    | `correct` \| `learning` (this client emits these two) | Scored from the manifest. The manifest also accepts `incorrect` and `skipped`; anything else is refused, never silently scored.                              |
| `payload.attempts`   | per-word attempt count                                | Recorded alongside the award; never an input to it. Non-negative.                                                                                            |
| `payload.time_ms`    | measured per-word elapsed time                        | Same. Non-negative.                                                                                                                                          |

**No `xp` or `score` is ever sent.** The engine derives the award from
`game_type` + `outcome` (Reward Rail Contract §3); a client-supplied amount
would be ignored at best.

**Two independent idempotency mechanisms, and both are needed.** `event_id`
covers a replayed event. It does _not_ cover a refresh, which re-queues the same
result under a new `event_id` — that is caught by the per-question claim on
`(game_type, run_id, question_id, account_id)`, which pays the first report of a
question and settles every later one to zero. The same question in a **new run**
is a different claim and settles again, which is the intended behaviour: replay
value would otherwise be worth nothing. All four rules are proven against a
model of the engine in `src/hooks/__tests__/settlement.test.js`.

An event that can never settle — no run id, no question id, an unscored outcome,
an over-length run id — is **discarded rather than retried**, with a warning.
Retrying a permanent 400 on every flush grows the outbox without bound and
buries the failures worth retrying. Nothing is lost: `game-sessions` is the
durable record of progress; the outbox is only a reward-claim queue.

That discard happens **before the request and independently of its outcome**.
It is deliberately not part of draining a successful flush: these events cannot
settle whatever the server answers, so folding the two together means a batch
carrying both a good event and a malformed one leaves the malformed one queued
whenever the request fails — reinstating exactly the unbounded growth the
screening exists to prevent. Covered by
`src/hooks/__tests__/useProgressSync.test.js`.

## 7. Seams

- **REST seam:** all server interaction goes through `createDictionaryApiClient`
  / `useGameSet`. Auth is injected (API key or page token); no other module
  talks to the network.
- **Host seam:** `<GameShell />` props + `react`/`react-dom` externals. The host
  supplies React, Tailwind styling, navigation (`onBrowse`), and source-language
  state (`onSourceLanguage`).
- **Persistence seam:** `idbUtils` is the only IndexedDB access point; all hooks
  go through it and degrade gracefully when IndexedDB is unavailable.
- **Progress seam (implemented, gated):** `useProgressSync.addEvent` writes to
  the outbox; `syncNow()` (Phase 3) translates queued `game_result` events to
  the engine's `game.result` wire shape and POSTs them to
  `{engineUrl}/events/batch`, but only runs the network call when the host
  supplies both `engineUrl` and a `getSuiteToken` callback that resolves to a
  token (§4, §6b) — dependency injection, not a hardcoded token source. No
  host wires either today, so this stays local-only in production pending
  the guest-client token-issuance blocker described in §11 (previously
  miscited here as "OQ-G1"; see the note in §11).
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
- **Game service (Phase 3, conditional dependency):**
  `sparxstar-3iatlas-rlc-node-engine` is the Game Service this layer's
  progress events target, per its **GAME-SERVICE-INTAKE-SPEC-v1.0**
  (`.github/instructions/GAME-SERVICE-INTAKE-SPEC-v1.0.md` in that repo).
  The event contract is implemented on both sides as of Phase 3
  (`game.result`, §1–§2 of that spec; `useProgressSync.syncNow()` here). This
  repo still has **no npm package dependency** on the node engine and no
  socket.io/WebSocket client — the connection is a plain `fetch()` POST, made
  only when a host app supplies `engineUrl`/`getSuiteToken` (§4, §6b). No
  device-identity/suite token issuer exists yet, so no host does this today;
  treat the network path as implemented-but-inert, not as live integration
  traffic.
- **No PHP / Composer dependencies** — this repo pulls no private Composer
  packages, so it needs no composer-resolver auth in CI.

## 9. Security and privacy

- **Auth model (Webster):** ephemeral page token (`X-Page-Token`) for
  same-origin browse; consumer API key (`X-Api-Key`) for all endpoints including
  `/wordlist`. `GET /page-token` is unauthenticated. Keys are SHA-256 hashed
  server-side.
- **Hard red lines:**
    - `syncNow()` must not post to the network without a real bearer token —
      as of Phase 3 this is enforced structurally, not just by convention:
      the network branch only runs when a host-supplied `getSuiteToken()`
      call resolves to a truthy token (`src/hooks/useProgressSync.js`); there
      is no fallback, cache, or default token source. The Game-Service intake
      spec is committed (GAME-SERVICE-INTAKE-SPEC-v1.0, node-engine repo) and
      the wire shape is implemented; the still-open half of this red line is
      that **no token-issuance mechanism exists for anonymous/guest game
      clients**, so no host can satisfy `getSuiteToken()` with a real token
      today (see §11).
    - `useProgressSync` must never read a Bearer/suite token from
      `localStorage` itself (XSS exposure) — token acquisition is entirely
      the host app's responsibility via the injected `getSuiteToken`
      callback, and this hook never inspects how that callback is
      implemented.
    - **The bundled website goes further and holds the token in memory only**
      (§12.3): no `localStorage`, no `sessionStorage`, no IndexedDB, no cookie,
      no URL parameter, no log line. This is verified as an observed property,
      not a promise — `src/site/auth/__tests__/tokenStorage.test.js` runs a full
      sign-in → play → sync → sign-out flow and then sweeps every one of those
      channels, and `scripts/browser-check.mjs` repeats the sweep in a real
      Chromium against the built bundle. A refresh therefore requires signing in
      again (§12.4); **do not "fix" that by persisting the token.**
    - The token is never logged. Sync failures report a status code and a count,
      never the `Authorization` header or a body that might echo it.
    - Never emit `Access-Control-Allow-Credentials`.
    - No WordPress auth (`is_user_logged_in()`) on game endpoints.
    - Never send an ephemeral page token to `/wordlist`.
    - The website bundle must never contain the dictionary consumer API key —
      a key in a static bundle is a published key. `/wordlist` is therefore
      unreachable from the site by design (§12.2).
    - The engine sync path must never add a write toward the dictionary's own
      REST API (`sparxstar/v1/dictionary`) — `useGameSet`'s pull-only
      `/game-set` fetch is untouched by Phase 3 and stays that way.
- **Privacy:** a guest's progress never leaves the device (§12.5). For a
  signed-in adult, what leaves is exactly the §6c payload: `game_type`,
  `session_id` (a random per-run UUID), `deal_id`/`word_uuid` (an opaque
  dictionary-entry identifier), `outcome`, `attempts`, `time_ms`. **No PII is
  collected or transmitted by this layer** — none of those fields identifies a
  learner; the account is identified only by the bearer token the engine
  verifies, and this layer never sees or sends a name, an email, or a device
  identifier. The run id is random and per-run, so it cannot be used to link
  two sessions of the same player either. Local storage keeps more (the word
  list, the results, the learned-word set), and that stays local.

## 10. Current state

- Six games, the shell, hooks, IndexedDB layer, and REST client are present and
  exported. The package builds to a UMD bundle. Verified against the live
  `sparxstar-3iatlas-dictionary` REST controller: all 9 consumed routes, auth
  headers, and response envelopes match; confirmed GraphQL (WPGraphQL + SCF)
  in that repo is a content-authoring surface only, not something this
  package needs to call.
- **Progress sync: live as of 2026-08-25.** The 2026-08-05 Phase 3 work built
  the path and left it dormant because nothing in the platform could mint a
  suite token for this class of client. `https://id.sparxstar.com`
  (`sparxstar-3iatlas-identity-node`) is now that issuer, and the engine's solo
  settlement path (`settleSoloGameResult`) accepts an adult suite token, so the
  blocker is resolved for **authenticated adults** and the bundled website
  (§12) supplies both `engineUrl` and a real `getSuiteToken`. Queued
  `game_result` events are translated to the engine's `game.result` shape and
  POSTed to `{engineUrl}/events/batch` (§6c), idempotently.
  The **guest** half of the old blocker is unchanged and still open: there is
  no token for an anonymous player and the engine's guest-claim flow is still
  fenced, so guest progress stays device-local (§11, §12.5) — which is the
  intended product behaviour, not a degradation.
- **The `game.result` payload was repaired in the same change.** It previously
  carried `game_type`, `word_uuid`, `outcome`, `attempts` and `time_ms` but
  **no `session_id` and no `deal_id`** — and `dictionary_quiz` is
  question-scoped, so the engine would have refused every one of those events
  with `run_id_required`. The dormant path had never been exercised against a
  real engine, so nothing surfaced it. Both keys are now sent (§6c), sourced
  from the session's `runId` and the entry `uuid`.
- The `aiwa_game_*` bonus markers (streak, first-practice, return-visit,
  session-complete) are unaffected and stay local-only — the engine has no
  scoring path for them.
- All 6 game components (`ListenWrite`, `ArrangeWord`, `CompleteSentence`,
  `LetterReveal`, `MeaningMatch`, `DomainFlash`) now measure real per-word
  elapsed time via a `wordStartRef` reset each time a new word/card is shown,
  and pass it through their `onResult` callback's new 5th `timeMs` argument.
  `useGameSession.recordResult` and the local session's `results[]` records
  carry it too (`timeMs`, defaulting to 0 only if the caller omits it).
- LetterReveal uses an emoji placeholder for the pottery animation pending an
  approved asset (OQ-G3).
- **Tests: `jest`, 51 across 7 suites.** `--passWithNoTests` was dropped
  2026-08-25 — real suites exist, and the flag would let all of them vanish
  silently.
    - `useProgressSync.test.js` — guest/local-only invariant; authenticated
      translation, idempotent drain, failure handling; unsettleable-event
      screening and measurement clamping.
    - `settlement.test.js` — the four reward rules, asserted on **XP paid**
      rather than on request shape, against `testUtils/fakeEngine.js`: a model
      of the engine's `processed_events` dedupe and its
      `(game_type, run_id, question_id, account_id)` claim. A payload that is
      well-formed but keyed wrongly passes a shape assertion and still pays
      twice; only a ledger assertion catches that.
    - `useGameSession.test.js` — run-id stability within a run, uniqueness
      across runs, backfill on resume, and the engine's length budget.
    - `src/site/auth/__tests__/guestPlay.test.js` — the site's own wiring stays
      local while signed out, and flushes what a guest earned after sign-in.
    - `src/site/auth/__tests__/tokenStorage.test.js` — the storage sweep (§9).
    - `useGameSet.test.js`, `pageToken.test.js` — unchanged content-plane checks.
- **Browser check (not in CI):** `scripts/browser-check.mjs` — 31 checks driving
  the built bundle through the real Nginx config in Chromium, including a full
  four-card run whose captured wire payload is asserted field by field, and the
  token sweep repeated against real browser storage. Pre-release, run by hand.
- The node-engine repo's `tests/gameResults.db.test.ts` (Postgres-gated,
  `RUN_DB_TESTS=1`) covers the other half of the chain end-to-end — batch →
  settlement → ledger → the `game.result.settled` myCred webhook — against the
  same payload shape this repo now sends.
- **Styling:** the package still vendors no CSS entry and assumes its host
  supplies the Tailwind runtime. The website is such a host and supplies its own
  (`src/site/styles.css`), compiled by the site build only (§12.1).

## 11. Open items

| ID    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | **Progress-sync blocker — HALF RESOLVED 2026-08-25 (see note below — no longer cited as "OQ-G1").** The blocker was that no token issuer fitted this class of client. For an **authenticated adult** that is now answered: `https://id.sparxstar.com` is the suite-token issuer, the engine's `settleSoloGameResult` accepts an adult suite token, and the bundled website signs in against it (§12.3) — sync is live for signed-in adults. For an **anonymous guest** it is unchanged and still open: there is no token for a player with no account, so guest progress stays device-local. That is the intended product behaviour rather than a gap to close, and closing it would need the engine's still-fenced guest-claim flow (see OQ-I3), not a new token type. |
| —     | **Secure session renewal — NEW, open.** The website holds the suite token in memory only, so a refresh signs the player out (§12.4). Closing that needs an approved renewal contract the Identity Service does not offer today: `/auth/v1/login` mints a bearer and nothing else, and its CORS policy sets `credentials: false`, so a cookie session is refused rather than merely unimplemented — and `Access-Control-Allow-Credentials` is a platform red line (§9). **Until such a contract is specified and approved, do not add browser token persistence to this repo.**                                                                                                                                                                                          |
| —     | **Deployment configuration, not code — blocking the launch.** `https://games.sparxstar.com` must be added to `UI_ORIGINS` on BOTH the Identity Service and the engine, additively, without displacing the WordPad origin (§12.7). Neither needs a code change. Until it lands, sign-in and settlement fail in the browser with a CORS error while every server-side check passes.                                                                                                                                                                                                                                                                                                                                                                                       |
| —     | ~~GAME-SERVICE-INTAKE-SPEC-v1.0 (wire schema for the eventual Game Service POST) is unwritten~~ — **resolved.** Written and approved in the node-engine repo (`.github/instructions/GAME-SERVICE-INTAKE-SPEC-v1.0.md`); its **OQ-3** (this repo's outbox couldn't populate a conformant `GameResultEvent` — only reported `correct`, no `attempts`/`time_ms`) is also resolved, from this side, as of Phase 3 — see §4 and §10. The old "frozen event schema" citation (`GH-ISSUE-dictionary-PR59-fixes.md` "Fix 2") remains unverified/nonexistent and was never used; the real spec superseded it.                                                                                                                                                                    |
| OQ-G3 | LetterReveal pottery animation — awaiting AIWA-approved asset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| OQ-I3 | Guest device progress merge — blocked on Game Service intake spec's guest-claim flow, which is itself FENCED on the Identity Service keystone (`sparxstar-identity`, out of scope). Unaffected by the Phase 3 progress-sync work: `syncNow()` only ever sends progress for a player who already has a suite token, never merges/claims prior guest history.                                                                                                                                                                                                                                                                                                                                                                                                             |
| —     | ~~Add a test suite~~ — **done, Phase 3**, extended 2026-08-25 with `settlement.test.js` (the four idempotency rules, against a model of the engine), `useGameSession.test.js` (run-id invariants), and `src/site/auth/__tests__/{guestPlay,tokenStorage}.test.js`. ~~Confirm Tailwind/PostCSS ownership (host vs package)~~ — **settled** for the case this repo controls: the website is a host and owns its CSS entry (`src/site/styles.css`); the package still ships none (§4, §12.1).                                                                                                                                                                                                                                                                              |
| —     | **Browser check is not in CI.** `scripts/browser-check.mjs` drives the built bundle through the real Nginx config in Chromium (31 checks, including the token-storage sweep). It needs a browser download and a running server, so it is a pre-release step rather than a per-commit one. Wire it into a release workflow if that trade stops making sense.                                                                                                                                                                                                                                                                                                                                                                                                             |
| —     | **Port the TTS deployment notes upstream.** `backend/pronounce-config-sample.php` was removed here (§12.8); confirm the owning implementation (`sparxstar-3iatlas-dictionary`, `src/api/Sparxstar3IAtlasDictionaryTts.php`) documents the Kasanoma model URLs, the two Piper runtime options and the cache TTL, and port them from `c54cc65` if not.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| —     | Reconcile npm package name (`sparxstar-rlc-games`) with repo name if desired                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

> **Note on the retired "OQ-G1" citation.** Earlier versions of this
> document, `AGENTS.md`, and `.github/copilot-instructions.md` cited "OQ-G1"
> as the tracking ID for the progress-sync blocker above, described as
> "Helios token source." Cross-repo verification found that "OQ-G1" is not a
> stable, agreed-upon reference: the sibling `sparxstar-3iatlas-dictionary`
> repo's own governance docs describe an OQ-G1 that was later redefined and
> marked "closed (historical)" — but that redefined/closed version concerns
> WP-nonce authentication for a since-deprecated `/progress/sync` endpoint, a
> _different_ sub-question from what this document originally meant by
> OQ-G1. (The Helios-token-source framing above is actually closer to the
> _original_, pre-drift meaning of OQ-G1 in that repo's oldest spec doc, not
> the redefined-then-closed version.) No GitHub Issue object backs "OQ-G1" in
> either repo — it exists only as markdown-table bookkeeping, with no single
> authoritative source (this repo's own
> `.github/instructions/governance/README.md` confirms the governance sync
> has never run here, so there is no compiled `open-questions.compiled.md` to
> resolve the drift against either). The "frozen event schema" cited
> alongside OQ-G1 in the decision doc has the identical problem: its named
> source, `GH-ISSUE-dictionary-PR59-fixes.md` "Fix 2," does not exist in
> either repo either — the same pattern of an unverifiable citation, not a
> coincidence. Rather than continue citing a label whose meaning has drifted
> and disagrees across repos, this document states the blocker directly, in
> plain language, in the table above. The "OQ-G1" number is retired as a
> citation — this note preserves the historical fact that it once existed,
> but it should not be treated as a stable or resolvable cross-repo pointer
> going forward. Do not reintroduce "OQ-G1" as a citation without first
> establishing a single authoritative source for it across both repos.

## 12. The deployable website (`games.sparxstar.com`)

Added 2026-08-25. This section governs the website host; it is the section to
change **before** changing how that host behaves.

### 12.1 What it is, and why it is a second build target

The repo now produces **two artifacts from one source tree**:

|                     | `webpack.config.js`         | `webpack.site.config.js`     |
| :------------------ | :-------------------------- | :--------------------------- |
| Purpose             | Reusable UMD package        | Deployable website           |
| Entry               | `src/index.jsx` (exports)   | `src/site/main.jsx` (mounts) |
| Output              | `dist/js/rlc-games.min.js`  | `dist-site/`                 |
| `react`/`react-dom` | `externals` — host-provided | bundled                      |
| Filenames           | stable                      | content-hashed               |
| HTML                | none                        | `index.html`                 |
| Script              | `pnpm run build`            | `pnpm run build:site`        |

The package build is **unchanged**. Two configs rather than one config with a
mode flag is the point: the site needs React bundled, and folding the two
together would make `react` non-external and produce a UMD bundle no host could
mount. `pnpm run build:all` runs both.

`src/site/` is a **consumer of the package sources**, the same way the AIWA
Browse App is a consumer of the built package. It imports `GameShell` and the
shared helpers; nothing under `src/components/` or `src/hooks/` imports anything
from `src/site/`. That one-way dependency is what keeps the package boundary
real rather than nominal, and it is the rule to check when adding to either
side.

### 12.2 Deployment endpoints

Compiled in at build time by DefinePlugin, read through `src/site/config.js`,
overridable per build with the environment variables named below.

| Role            | Value                                                              | Build override         |
| :-------------- | :----------------------------------------------------------------- | :--------------------- |
| Site origin     | `https://games.sparxstar.com`                                      | `GAMES_SITE_URL`       |
| Game engine     | `https://rlc-api.sparxstar.com/api/v1`                             | `GAMES_ENGINE_URL`     |
| Identity        | `https://id.sparxstar.com`                                         | `GAMES_IDENTITY_URL`   |
| Dictionary REST | `https://dictionary.sparxstar.com/wp-json/sparxstar/v1/dictionary` | `GAMES_DICTIONARY_URL` |

**On the dictionary base.** The _path_ — `/wp-json/sparxstar/v1/dictionary` — is
authoritative and is stated identically by three independent sources: this
repo's `src/api/dictionary-api.d.ts`, the node-engine's
`SPARXSTAR-3iAtlas-Dictionary-Contract-v0.1.md` ("Base namespace:
`<host>/wp-json/sparxstar/v1/dictionary`") and its `clients/dictionary.ts`, and
WordPad's `VITE_DICTIONARY_API_URL` documentation. The _host_ is not committed
anywhere in the platform — WordPad's `.env.example` states the convention of
never committing real endpoints — and was supplied by the repo owner for this
deployment. It is recorded here, and in the build default, so there is one
place to correct if it changes.

None of the four is a secret; all are visible in the browser's network tab on
first load. The dictionary **consumer API key is deliberately absent** from the
website and must stay absent: a key in a static bundle is a published key. The
site uses the ephemeral page-token flow (§9), which is why `/wordlist` — the one
consumer-key-only endpoint — is not reachable from the site and must be proxied
server-side by whoever holds the key if it is ever needed.

The build **fails** rather than emitting a bundle if any of the four is not an
`https://` URL without a trailing slash. A typo would otherwise surface as an
opaque CORS error in a deployed browser.

### 12.3 Adult Identity sign-in, and the in-memory token rule

Sign-in is against the Identity Service's browser surface
(`sparxstar-3iatlas-identity-node`, `src/routes/auth.ts`, camelCase):

| Method | Path                 | Used for                                  |
| :----- | :------------------- | :---------------------------------------- |
| POST   | `/auth/v1/login`     | adult sign-in (`screenName` + `password`) |
| POST   | `/auth/v1/login/mfa` | completing a second-factor challenge      |
| POST   | `/auth/v1/validate`  | authoritative re-check of a held token    |
| POST   | `/auth/v1/logout`    | server-side revocation on sign-out        |

Adult tier only. The site has no `schoolId`, so the class-code and PIN tiers are
not offered. **Registration is not implemented here** and should not be: it
requires a captcha and, in this platform, the wrapped-key store WordPad's
create-account flow writes to. A player without an account is pointed at the
suite.

**THE TOKEN LIVES IN MEMORY AND NOWHERE ELSE.** `src/site/auth/suiteToken.js`
holds it in a module-scoped variable. It is never written to `localStorage`,
`sessionStorage`, IndexedDB, a cookie, or a URL parameter, and never logged.
`getSuiteToken` — the callback `useProgressSync` already took as an injected
dependency (§6b) — is that module's getter, so the hook's existing contract is
what carries the token to the wire and nothing new was added to reach it.

This **diverges from WordPad on purpose**, and the difference is not a
disagreement about risk but about requirements. WordPad persists its token
because it needs one at cold start to unwrap already-stored documents; without
persistence its offline-first promise breaks, so it accepts the XSS exposure and
compensates with a separate key store. This site needs the token for exactly one
thing — the `Authorization` header on `POST /events/batch` — and losing it costs
a sign-in and nothing else, because progress is already durable in IndexedDB.
There is no requirement to trade against, so the exposure is not accepted.

### 12.4 Refresh requires signing in again (accepted, not a defect)

A page refresh destroys the realm, and therefore the token, and the player signs
in again. The UI states this in the sign-in panel rather than letting it be
discovered. **Progress is not lost**: the run and its results are in
`game-sessions`, and queued results settle on the first sync after the next
sign-in.

**Do not add browser token persistence to fix this.** A silent renewal needs a
refresh-token or cookie-session contract that does not exist today: the Identity
Service's `/auth/v1/login` mints a bearer and nothing else, and its CORS policy
sets `credentials: false` — so a cookie session is not merely unimplemented but
actively refused, and `Access-Control-Allow-Credentials` is a platform red line
(§9). Until such a contract is specified and approved, this behaviour stands.
That approved contract is tracked as an open item in §11.

### 12.5 Guest play

Guest play is the default and is complete: every game works and progress is
saved on the device. `App.jsx` passes `engineUrl` and `getSuiteToken`
**unconditionally** — there is no guest branch. The only thing between a guest
and the network is that the token store returns `null`, which `syncNow()`
already treats as "stay local". Signing in mid-session flushes what the guest
already earned; signing out stops the flushing and re-queues.

### 12.6 Static host (Docker / Nginx)

`deploy/Dockerfile` builds the site with pnpm and serves `dist-site/` from
`nginx:1.27-alpine`. The runtime stage carries no Node, no toolchain, no source
and **no secret** — the only configuration is the four public URLs already
compiled into the bundle. Build args are used for those URLs and must never
carry a credential: a `--build-arg` is visible in `docker history`.

`deploy/nginx/games-site.conf` provides:

- **SPA fallback** — `try_files $uri $uri/ /index.html`, so any client route
  boots the app.
- **Immutable asset caching** — `/assets/` is served
  `public, max-age=31536000, immutable`. Safe because every asset name carries a
  content hash. `expires` is deliberately not used: it emits a second,
  conflicting `Cache-Control`.
- **`index.html` never cached** — it is the map to the hashed names, and a stale
  copy points at assets that no longer exist.
- **A missing hashed asset 404s** rather than falling through to the SPA
  fallback — returning HTML for a `.js` request is how "Unexpected token '<'"
  reaches production.
- **Source maps refused.** They are built (`hidden-source-map`) for
  symbolicating a stack trace, deleted from the image, and 404'd by config. The
  `/assets/` location must NOT use `^~`, which would suppress regex evaluation
  and serve them.
- **Security headers**, including a CSP whose `connect-src` names exactly the
  three origins the app may reach, so an injected script cannot exfiltrate a
  token even if it obtains one.
- **No CORS headers.** Identity and the engine answer CORS from their own
  allowlists; a second source of truth is how an origin ends up permitted here
  and rejected there.

Nginx's `add_header` **replaces** the inherited set rather than merging, so the
security headers live in `deploy/nginx/games-security-headers.conf` and are
`include`d by every location. Adding a location without that include silently
drops the CSP. The include path is absolute because a relative one resolves
against nginx's prefix, which differs between the official image and a distro
package.

That snippet is **generated**, not hand-written
(`scripts/generate-csp-headers.cjs`), from the same `site-endpoints.cjs` the
bundle is compiled against (§12.2). The CSP's `connect-src` has to name the
exact origins the bundle calls, and two hand-maintained copies agreed in
production and nowhere else: a staging build overriding `GAMES_DICTIONARY_URL`
shipped a bundle calling staging behind a policy permitting only production, so
the browser blocked every request and reported a CSP violation rather than
anything naming the cause. Deriving both from one source removes the class of
bug — an override cannot reach one artifact without reaching the other. The
container regenerates the snippet in its build stage and copies it from there;
a droplet deploy must run `pnpm run build:headers` with the same overrides. CI
regenerates and fails on any difference from the committed copy, so the two
cannot drift.

### 12.7 CORS the deployment depends on

Neither service needs a code change — both already support an additive
multi-origin allowlist — but **both need `https://games.sparxstar.com` added to
their deployed configuration**, and neither may lose the origin it already
serves:

| Service                          | Variable     | Action                                                                     |
| :------------------------------- | :----------- | :------------------------------------------------------------------------- |
| Identity (`id.sparxstar.com`)    | `UI_ORIGINS` | add `https://games.sparxstar.com`; leave `UI_ORIGIN` on the WordPad origin |
| Engine (`rlc-api.sparxstar.com`) | `UI_ORIGINS` | add `https://games.sparxstar.com`; leave `UI_ORIGIN` as deployed           |

`UI_ORIGINS` is comma-separated and **additive** to `UI_ORIGIN`
(`parseUiOrigins` in both repos), so adding Games cannot displace WordPad. Both
services keep `credentials: false`, which the platform requires. Until this
configuration lands, sign-in and settlement fail in the browser with a CORS
error while every server-side check passes.

### 12.8 Server-side PHP: reconciled

`backend/pronounce-endpoint.php` and `backend/pronounce-config-sample.php` were
**removed** in this change, as historical drafts, on this evidence:

1. Nothing in this repo calls `/pronounce`. The games obtain audio from
   `word.audio_url` on the `/game-set` response; there are no other callers, and
   no build, test, or CI file references `backend/`.
2. The route is **owned and implemented upstream**, by the repo that owns the
   namespace: `Starisian-Technologies/sparxstar-3iatlas-dictionary`,
   `src/api/Sparxstar3IAtlasDictionaryTts.php`, which registers
   `sparxstar/v1/dictionary` + `/pronounce`. The files here were a July 2026
   draft (`feature/tts-backend`) that the upstream class superseded.
3. They contradict this repo's stated boundary — no WordPress code, no PHP, no
   server-side logic (`ROLE.md`, §2).

They were therefore historical, not consumed, and removing them reconciles the
boundary rather than deleting live code. The full content remains in git history
at `c54cc65`. **One follow-up for the owner:** the config sample carried
deployment knowledge (Kasanoma model download URLs, the two Piper runtime
options, the cache TTL) — confirm the upstream implementation documents the
same, and port it there if not.

## 13. Changelog

- **2026-08-25 (review pass)** — Two defects found in review of the deployment
  change, both fixed with regression coverage. (1) `syncNow()` pruned
  unsettleable events only when there was nothing settleable to send, so a
  batch carrying both a good and a malformed event left the malformed one
  queued whenever the request failed — it then warned and was re-screened on
  every subsequent flush, which is the unbounded growth the screening exists to
  prevent. The prune now runs before the request and does not depend on its
  outcome (§6c). (2) The Nginx CSP's `connect-src` was hand-written while the
  bundle's endpoints were build-time configurable, so any endpoint override
  produced a bundle calling one origin behind a policy permitting another —
  a staging deployment that fails with nothing but CSP violations. The snippet
  is now generated from the same `site-endpoints.cjs` the bundle uses, the
  container regenerates it in its build stage, and CI fails on drift (§12.6).
- **2026-08-25** — Deployment release: the repo now ships a website, not only a
  package. Added a second build target (`webpack.site.config.js` → `dist-site/`,
  content-hashed assets and an `index.html`) alongside the **unchanged** UMD
  package build, and the site sources under `src/site/` that consume the package
  sources one-way (§4, §12.1). Configured the four deployment endpoints (§12.2),
  with the dictionary host supplied by the repo owner — the path was already
  authoritative in three repos, the host is committed nowhere in the platform.
  Added **adult Identity sign-in** against `/auth/v1/{login,login/mfa,validate,logout}`,
  holding the suite token **in memory only** and feeding it to the existing
  `getSuiteToken` seam (§12.3); a refresh therefore signs the player out, which
  is documented as accepted rather than patched with browser persistence
  (§12.4, §11).
  **Repaired the `game.result` payload**, which was the substantive bug behind
  this release: it carried no `session_id` and no `deal_id`, and
  `dictionary_quiz` is question-scoped, so the engine would have refused every
  event with `run_id_required`. The dormant path had never met a real engine, so
  nothing surfaced it. `useGameSession` now stamps each run with a `runId`
  (`src/ids.js`, backfilled on resume), `GameShell` carries it and the entry
  uuid into the outbox event, and `syncNow()` sends both as `session_id` and
  `deal_id` alongside `game_type: dictionary_quiz`, a manifest-valid outcome,
  and non-negative `attempts`/`time_ms` (§5, §6c). Events that can never settle
  are now discarded with a warning instead of being retried forever.
  Added the tests that make the reward rules checkable: `settlement.test.js`
  drives the real hook against a model of the engine's two idempotency
  mechanisms and asserts XP paid — replayed event ids don't pay twice, new event
  ids for the same run+question don't pay twice, and the same question in a new
  run settles again — plus guest-locality and a storage sweep proving no token
  reaches `localStorage`/`sessionStorage`/IndexedDB/cookies/URLs/logs.
  Added production static-host artifacts (`deploy/Dockerfile`,
  `deploy/nginx/*.conf`) with SPA fallback, immutable asset caching, refused
  source maps, a CSP pinning `connect-src` to the three permitted origins, and
  no embedded secret (§12.6). Recorded the CORS configuration both services need
  (§12.7) — additive `UI_ORIGINS`, WordPad untouched.
  Removed `backend/*.php` as historical drafts superseded by the dictionary
  repo's own `/pronounce` implementation, reconciling the repo's no-PHP boundary
  (§12.8). No dictionary endpoint, response shape, or auth model changed; the
  page-token path is untouched.
- **2026-08-21** — Page-token auth fix. `GameShell.jsx`'s `/domains` request
  sent no `X-Page-Token` and had no retry, so against a token-enforcing
  server it 401'd and the domain selector silently fell back to "All
  domains" — indistinguishable from a language with no domains. The
  refresh-and-retry-once logic that `useGameSet.js` already had (and that
  the dictionary repo's since-deleted copy of `GameShell` had for this exact
  request) is now extracted to `src/api/pageToken.js`
  (`currentPageToken`, `refreshPageToken`, `fetchWithPageToken`) and used by
  both call sites, so there is one implementation rather than two that can
  drift. Covered by `src/api/__tests__/pageToken.test.js` (header sent,
  refresh-and-retry on 401, at most one retry, non-401 not retried, refresh
  failure still retried, caller `init` preserved). No endpoint, wire shape or
  auth model changed — §9's red lines are untouched, and this is the
  page-token path only, not the suite/Bearer path.
- **2026-08-05** — Phase 3: implemented `syncNow()` against
  `sparxstar-3iatlas-rlc-node-engine`'s `GAME-SERVICE-INTAKE-SPEC-v1.0`,
  resolving that spec's OQ-3 from this side. Instrumented all 6 game
  components with real per-word elapsed-time tracking (`wordStartRef`,
  extending `onResult`'s signature with a `timeMs` argument);
  `GameShell.jsx`'s `handleWordResult` now queues a `game_result` outbox
  event for every outcome (not just `correct`), carrying `attempts` and
  `time_ms`. `useProgressSync.syncNow()` translates queued `game_result`
  events to the engine's `game.result` wire shape and POSTs them to
  `{engineUrl}/events/batch`, idempotently (stable per-event `event_id`,
  partial-failure-safe outbox draining), gated on new optional
  `<GameShell />` props `engineUrl` and `getSuiteToken` — a
  dependency-injected callback, not a hardcoded token source, so the path
  is fully built and integration-tested (fake token in tests) while
  staying genuinely dormant in production (no host supplies either prop;
  no suite-token issuer exists — §11's progress-sync blocker is
  unaffected and still open). Added this repo's first test suites
  (`src/hooks/__tests__/useProgressSync.test.js`,
  `src/hooks/__tests__/useGameSet.test.js`) covering the guest/local-only
  invariant, the authenticated sync path, and a content-plane regression
  check confirming `/game-set` stays a GET-only pull, untouched by this
  diff. Updated §3, §4, §6b, §7, §8, §9, §10, §11 to match.
- **2026-07-09** — Verified the REST client against the live dictionary
  controller (no drift found) and confirmed GraphQL is a content-authoring
  surface only, not a games consumer. A payload builder for the decision
  doc's §3 "frozen event schema" was drafted and then removed after
  discovering its citation (`GH-ISSUE-dictionary-PR59-fixes.md` "Fix 2")
  does not exist in either this repo or the dictionary repo — folded into
  the note below rather than kept as a separate finding. No network
  behavior changed; `syncNow()` remains a no-op with no wire-schema
  assumption baked in.
- **2026-07-08** — Documentation consolidation and correction pass. Re-verified
  every claim in this document against current source code
  (`useProgressSync.js`, `useGameSet.js`, `useGameSession.js`,
  `DictionaryApiClient.js`, `package.json`) — no code-behavior drift found.
  Made explicit (§4, §8) that this repo has zero current connection to any
  game-node-engine backend (no socket.io/WebSocket client, no HTTP client
  calling a node-engine service, no such dependency in `package.json`) and
  that `sparxstar-3iatlas-rlc-node-engine` is only an _intended_ future Game
  Service, not yet integrated on either side. **Corrected the "OQ-G1"
  citation** (§3, §4, §7, §9, §10, §11): retired it as an unreliable
  cross-repo reference — the label has drifted and now disagrees between
  this repo and `sparxstar-3iatlas-dictionary`'s governance docs, and no
  GitHub Issue backs it in either repo — and replaced every reference to it
  with a plain-language statement of the actual progress-sync blocker (§11),
  plus a note explaining the retirement. Trimmed duplicated
  architecture/technical content in `AGENTS.md` and `ROLE.md` to short
  pointers back to this document, which remains the single canonical
  technical specification for this repo.
- **2026-06-29** — Initial spec. Repo restructured out of the extracted archive
  into a standard layout; governance, standards workflow, and AI-agent
  instruction files added.
