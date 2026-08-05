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
  IndexedDB, 3-day TTL) → game components (each timing its own per-word
  elapsed time via a `wordStartRef`) → `onResult(uuid, outcome, attempts, xp,
timeMs)` → `useGameSession.recordResult` → IndexedDB session +
  learned-words, and in parallel `useProgressSync.addEvent({ type:
'game_result', ... })` → outbox → `syncNow()` (network sync **gated**, not
  deferred — see §11 for what's still blocking it in production).
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
  `DictionaryApiClient.js` or the direct `fetch()` calls in `useGameSet.js`
  (`/page-token`, `/game-set`) and `GameShell.jsx` (`/domains`) — is
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
`onSourceLanguage`, `onBrowse`, plus (Phase 3, both optional, no default)
`engineUrl` (node-engine base URL) and `getSuiteToken` (`() =>
string|null|Promise<string|null>`, the bearer token for the engine's batch
endpoint). Omitting either keeps progress sync local-only, unchanged from
pre-Phase-3 behavior — see §4 and §11.

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
    - Never emit `Access-Control-Allow-Credentials`.
    - No WordPress auth (`is_user_logged_in()`) on game endpoints.
    - Never send an ephemeral page token to `/wordlist`.
    - The engine sync path must never add a write toward the dictionary's own
      REST API (`sparxstar/v1/dictionary`) — `useGameSet`'s pull-only
      `/game-set` fetch is untouched by Phase 3 and stays that way.
- **Privacy:** all learner progress is local (IndexedDB) until a host app
  wires up both `engineUrl` and a real `getSuiteToken`. No PII is collected
  by this layer; `game.result` events carry only `word_uuid`, `outcome`,
  `attempts`, `time_ms` — no learner-identifying data.

## 10. Current state

- Six games, the shell, hooks, IndexedDB layer, and REST client are present and
  exported. The package builds to a UMD bundle. Verified against the live
  `sparxstar-3iatlas-dictionary` REST controller: all 9 consumed routes, auth
  headers, and response envelopes match; confirmed GraphQL (WPGraphQL + SCF)
  in that repo is a content-authoring surface only, not something this
  package needs to call.
- **Progress sync (Phase 3, 2026-08-05): implemented, gated, dormant in
  production.** `syncNow()` is no longer a no-op — GAME-SERVICE-INTAKE-SPEC-v1.0
  is now written and approved (node-engine repo), so the wire schema exists
  and is implemented against: queued `game_result` outbox events (`word_uuid`,
  `game`, `outcome`, `attempts`, `time_ms` — every outcome, not just
  `correct`) are translated to the engine's `game.result` shape
  (`game_type: 'dictionary_quiz'`, per that spec's OQ-4 placeholder) and
  POSTed to `{engineUrl}/events/batch` with a `Bearer` token, idempotently
  (each event carries a stable `event_id`; only server-accepted events are
  drained from the outbox). This only runs when a host supplies both
  `engineUrl` and a `getSuiteToken` callback that resolves to a token (§4,
  §6b, §9) — the guest-client token-issuance blocker itself (§11) is
  **still unresolved**, so no host does this yet and the path is inert in
  production today. The `aiwa_game_*` bonus markers (streak, first-practice,
  return-visit, session-complete) are unaffected and stay local-only — the
  engine has no scoring path for them.
- All 6 game components (`ListenWrite`, `ArrangeWord`, `CompleteSentence`,
  `LetterReveal`, `MeaningMatch`, `DomainFlash`) now measure real per-word
  elapsed time via a `wordStartRef` reset each time a new word/card is shown,
  and pass it through their `onResult` callback's new 5th `timeMs` argument.
  `useGameSession.recordResult` and the local session's `results[]` records
  carry it too (`timeMs`, defaulting to 0 only if the caller omits it).
- LetterReveal uses an emoji placeholder for the pottery animation pending an
  approved asset (OQ-G3).
- Tests: `jest` (no longer `--passWithNoTests` — Phase 3 added the first test
  suites, `src/hooks/__tests__/useProgressSync.test.js` (guest/local-only
  invariant; authenticated sync path — translation, idempotent drain,
  failure handling) and `src/hooks/__tests__/useGameSet.test.js` (content-plane
  regression check: `/game-set` pull is GET-only and unaffected by the
  sync-layer changes). The node-engine repo's
  `tests/gameResults.db.test.ts` (Postgres-gated, `RUN_DB_TESTS=1`) covers
  the other half of the chain end-to-end — batch → settlement → ledger →
  the `game.result.settled` myCred webhook — using the exact
  `dictionary_quiz`/`outcome`/`attempts`/`time_ms` payload shape this
  repo's `syncNow()` now sends.
- Styling assumes the host supplies the Tailwind runtime; no Tailwind/PostCSS
  config or CSS entry is vendored in this repo.

## 11. Open items

| ID    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —     | **Progress-sync blocker — STILL OPEN (see note below — no longer cited as "OQ-G1"):** anonymous/guest game clients have no token-issuance mechanism that fits. Not a Helios JWT (that's for authenticated staff/platform users). Not an RLC-style session-participant token (that requires an active RLC session, which this games layer doesn't have). As of Phase 3 (2026-08-05) `syncNow()` is fully implemented and gated on a dependency-injected `getSuiteToken` callback (§4, §6b, §9) rather than a no-op, so the code is no longer what's missing — but nothing in this platform can supply that callback with a real token yet, so network sync stays dormant in production until a suite-token issuer exists. |
| —     | ~~GAME-SERVICE-INTAKE-SPEC-v1.0 (wire schema for the eventual Game Service POST) is unwritten~~ — **resolved.** Written and approved in the node-engine repo (`.github/instructions/GAME-SERVICE-INTAKE-SPEC-v1.0.md`); its **OQ-3** (this repo's outbox couldn't populate a conformant `GameResultEvent` — only reported `correct`, no `attempts`/`time_ms`) is also resolved, from this side, as of Phase 3 — see §4 and §10. The old "frozen event schema" citation (`GH-ISSUE-dictionary-PR59-fixes.md` "Fix 2") remains unverified/nonexistent and was never used; the real spec superseded it.                                                                                                                     |
| OQ-G3 | LetterReveal pottery animation — awaiting AIWA-approved asset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| OQ-I3 | Guest device progress merge — blocked on Game Service intake spec's guest-claim flow, which is itself FENCED on the Identity Service keystone (`sparxstar-identity`, out of scope). Unaffected by the Phase 3 progress-sync work: `syncNow()` only ever sends progress for a player who already has a suite token, never merges/claims prior guest history.                                                                                                                                                                                                                                                                                                                                                              |
| —     | ~~Add a test suite~~ — **done, Phase 3.** `src/hooks/__tests__/useProgressSync.test.js`, `src/hooks/__tests__/useGameSet.test.js`. Confirm Tailwind/PostCSS ownership (host vs package) — still open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| —     | Reconcile npm package name (`sparxstar-rlc-games`) with repo name if desired                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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

## 12. Changelog

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
