# Agent Instructions — sparxstar-3iatlas-dictionary-games

## Platform governance

Read `.github/instructions/governance/` for compiled ADRs, invariants, and
open questions. These are the platform rules. Do not assume rules not in the
governance reference.

> If `.github/instructions/governance/` is empty or missing, the governance
> sync has not run yet. Ask the owner to trigger `governance-sync` from the
> ADR registry's Actions tab. Do not edit the files under that folder — they
> are overwritten on every sync.

Platform repos (read these for full context when accessible):

- Decisions: https://github.com/Starisian-Technologies/sparxstar-architecture-decision-record
- Specs: https://github.com/Starisian-Technologies/sparxstar-product-technical--specifications
- Standards: https://github.com/Starisian-Technologies/starisian-technologies-coding-standards
- Contracts: https://github.com/Starisian-Technologies/sparxstar-platform-contracts

If no spec exists for what you're asked to build — STOP implementation. Draft
or request the missing spec first. Do not invent product behavior in code. The
product spec for this repo lives at `docs/dictionary-games-tech-spec.md` and is
submitted to the spec registry under `specs/IAtlas/`.

## Repo-specific rules

### What this repo is

The RLC Games layer — the game shell, all six game components, session and
progress hooks, IndexedDB utilities, and the **server-side BFF** that reads
dictionary content. Extracted from `sparxstar-3iatlas-dictionary`. It contains
no WordPress code and no PHP. See `ROLE.md` for the full boundary.

> **This repo is no longer browser-only (2026-09-04).** It owns exactly one
> server-side component, the Dictionary Games BFF (`server/`), added under the
> locked cross-repository specification _Dictionary Service Authentication and
> Games Integration_. Earlier revisions of this file said the repo contained
> "no server-side logic"; that is corrected here rather than left to be
> discovered. The reason is not convenience — **the Dictionary API is private**,
> so a server-side credential holder is the only way the games can read words.
>
> The BFF is the only server-side code permitted here. It serves the games
> origin, holds one credential, and must not grow into a general application
> server. Read `docs/dictionary-games-bff.md` before touching anything under
> `server/`.

It builds **two artifacts from one source tree** (spec §4, §12.1): the reusable
UMD package (`pnpm run build` → `dist/`, React external) and the deployable
`games.sparxstar.com` website (`pnpm run build:site` → `dist-site/`, React
bundled). `src/site/` consumes the package sources; nothing under
`src/components/` or `src/hooks/` may import from `src/site/`. Keep that
one-way, or the package boundary stops being real.

### Repo structure, API constraints, auth model, and data model

`docs/dictionary-games-tech-spec.md` is the single canonical technical
specification for this repo and is kept current against the source code. See:

- §4 (Architecture) for the runtime layering / file-by-file repo structure.
- `docs/dictionary-games-bff.md` for the dictionary path: the BFF, the
  Identity subject, the route allowlist, rights preservation, and the known
  `/languages` + `/domains` gap. This SUPERSEDES the tech spec's §6a and the
  page-token half of §9 — the page-token flow and the consumer-API-key flow are
  both retired, and the Dictionary Node has no `/page-token` route.
- §9 (Security and privacy) for the suite-token model, which is unchanged.
- §5 (Data model) for the `aiwa-games-db` IndexedDB stores and the
  production-vs-recognition game split (`PRODUCTION_GAMES`).

Do not restate that content here — update the tech spec instead so there is
one place to keep in sync with the code.

### Security rules (hard requirements)

- **The browser MUST NOT call the Dictionary API.** It is private: no browser,
  anonymous user, or unregistered application may call it, and the Dictionary
  Node records a browser-shaped header on a credentialed request as a
  PRIORITY_1 security event. Browser code calls this site's own
  `/api/dictionary/*` and nothing else. Three things enforce it — the bundle
  holds no dictionary origin, the CSP `connect-src` does not permit one, and
  the browser dictionary client has been deleted. Do not reintroduce any of
  the three.
- **No dictionary credential may exist in the browser.** Not an API key, not a
  page token, not a service token. The BFF's Identity Node signing key is read
  from a read-only mounted FILE and never from an environment variable, and
  neither it nor the access token ever appears in a response, a header, or a
  log line. Tests in `server/__tests__/bff.test.js` assert this; do not weaken
  them.
- **Never widen what the Dictionary returned, and never backfill a withheld
  field.** An empty `english_definition` or a null `audio_url` is a rights
  decision, not a gap: substituting another field for it would ship withheld
  material under a different key. `server/rights.js` is an allowlist for this
  reason — both sides narrow, neither widens.
- **Do not persistently cache dictionary content.** Words carry rights and
  consent restrictions and can be WITHDRAWN; a cached copy is a place a
  withdrawn word outlives its withdrawal on a device nobody can reach. The
  former three-day IndexedDB cache in `useGameSet` was removed for this reason.
  A TTL is not a withdrawal mechanism. Caching returns only when withdrawal
  behaviour is defined and honoured.
- **A failure of the BFF's own credential is a 503, never a 401 or 403.** A 401
  tells the player to sign in again; that is a lie when the truth is that the
  service could not authenticate itself.
- `useProgressSync.syncNow()` MUST NOT post to the network without a real
  bearer token. It POSTs to the node-engine's `/events/batch`
  (`GAME-SERVICE-INTAKE-SPEC-v1.0`), and the network branch runs only when a
  caller-supplied `getSuiteToken()` resolves to a truthy token.
  **As of 2026-08-25 that path is live for signed-in adults**: the bundled
  website (`src/site/`) signs in against `sparxstar-3iatlas-identity-node`
  (`https://id.sparxstar.com`) and supplies the token.
    - This is **not** a guest-token-issuance gap. Guest play never calls this
      path at all, by design — device-local, permanent, per
      `3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md` §4. Do not add a
      guest token.
    - It is **not** a missing issuer either: `sparxstar-3iatlas-identity-node`
      mints RS256 suite tokens and is production-ready for adult accounts.
    - **Nor is the engine side outstanding any longer.** Earlier revisions of
      this file said `/events/batch` admits only RLC participant tokens and
      that adult suite-token intake was "approved but unimplemented"; that is
      no longer true, and was corrected on 2026-08-25 against the engine's
      own source. `src/routes/events.ts` there authenticates with
      `authenticateParticipantOrSuite`, `src/services/batch.ts` carries a
      `suite_solo` principal permitted `game.result`, and
      `src/services/gameResults.ts` implements `settleSoloGameResult` with no
      RLC session. In release 1 `classroomEnabled` is false, so the adult solo
      principal is in fact the **only** live one. See
      `docs/dictionary-games-tech-spec.md` §11 (no longer cited via the
      retired "OQ-G1" label).
- **Never persist a suite/Bearer token in the browser.** Not `localStorage`,
  not `sessionStorage`, not IndexedDB, not a cookie, not a URL parameter, and
  never in a log line. The website holds it in a module-scoped variable
  (`src/site/auth/suiteToken.js`) and nowhere else, which is why a refresh
  requires signing in again. **That is the accepted design, not a bug to
  fix** — a silent renewal needs an approved contract that does not exist yet
  (spec §12.4, §11). Two test suites enforce this; do not weaken them.
- Never emit `Access-Control-Allow-Credentials`. Both the Identity Service and
  the engine set `credentials: false`, and the website sends
  `credentials: 'omit'`.
- The website bundle must never contain a dictionary credential of any kind.
- WordPress authentication is prohibited for all game endpoints.
- **No PHP in this repo.** `backend/*.php` was removed 2026-08-25 as historical
  drafts superseded by the dictionary repo's own implementation (spec §12.8).
  The BFF is Node and is the only server-side code here; PHP remains excluded.

### Open questions tracked by this repo

| ID    | Description                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | **CLOSED, corrected 2026-08.** Not a guest-token gap — guest play is device-local by design, permanently, per `3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md` §4. `syncNow()` is implemented and gated on a suite token (authenticated adults only; `sparxstar-identity` is the issuer, and the engine's solo path accepts it). Live as of 2026-08-25 via the bundled website. See `docs/dictionary-games-tech-spec.md` §11. |
| —     | Secure session renewal — the website's token is memory-only, so a refresh signs the player out. Needs an approved contract before any persistence is added (§12.4).                                                                                                                                                                                                                                                                |
| —     | `https://games.sparxstar.com` must be added to `UI_ORIGINS` on the Identity Service and the engine, additively (§12.7). Deployment config, not code.                                                                                                                                                                                                                                                                               |
| OQ-G3 | LetterReveal pottery animation — emoji placeholder, awaiting approved asset                                                                                                                                                                                                                                                                                                                                                        |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                                                                                                                                                                                                                                                                                                                                                                          |
| OQ-I3 | Guest device progress merge — blocked on the Identity Service spec (out of scope here)                                                                                                                                                                                                                                                                                                                                             |

### Upstream spec references (in the dictionary repo)

These specs live in `Starisian-Technologies/sparxstar-3iatlas-dictionary` and
are not vendored here. Read them there when accessible:

- `.github/instructions/3IATLAS-DICTIONARY-ROLE-AND-PIPELINE-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-MULTILANGUAGE-MODEL-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-ENRICHMENT-FIELDS-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-APPROVED-ENTRY-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md`
