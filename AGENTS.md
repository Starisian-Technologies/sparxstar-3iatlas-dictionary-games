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
progress hooks, IndexedDB utilities, and the dictionary API client. Extracted
from `sparxstar-3iatlas-dictionary`. It contains no WordPress code, no PHP, and
no server-side logic. See `ROLE.md` for the full boundary.

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
- §6a (Consumed REST endpoints) for the dictionary API constraints
  (`lang_source`-only strict-mode consumer, `/wordlist` API-key-only, etc).
- §9 (Security and privacy) for the full authentication model (Webster page
  token vs consumer API key).
- §5 (Data model) for the `aiwa-games-db` IndexedDB stores and the
  production-vs-recognition game split (`PRODUCTION_GAMES`).

Do not restate that content here — update the tech spec instead so there is
one place to keep in sync with the code.

### Security rules (hard requirements)

- `useProgressSync.syncNow()` posts to the network **only** when a caller
  supplies both `engineUrl` and a `getSuiteToken` that resolves to a real
  token. As of 2026-08-25 the bundled website does that for a signed-in adult
  (Identity Service is the issuer), so the path is live — for **guests it is
  not, and must not become so**: an anonymous player has no token and their
  progress stays on the device. See `docs/dictionary-games-tech-spec.md` §12.5
  and §11. (The blocker is no longer cited via the "OQ-G1" label; see the note
  in §11 for why.)
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
- The website bundle must never contain the dictionary consumer API key.
- WordPress authentication is prohibited for all game endpoints.
- **No PHP in this repo.** `backend/*.php` was removed 2026-08-25 as historical
  drafts superseded by the dictionary repo's own implementation (spec §12.8).
  Server-side code belongs in the repo that owns the namespace.

### Open questions tracked by this repo

| ID    | Description                                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | Progress-sync token issuance: resolved for authenticated adults (Identity Service), still open for anonymous guests — `docs/dictionary-games-tech-spec.md` §11. No longer cited as "OQ-G1"; see the retirement note there. |
| —     | Secure session renewal — the website's token is memory-only, so a refresh signs the player out. Needs an approved contract before any persistence is added (§12.4).                                                        |
| —     | `https://games.sparxstar.com` must be added to `UI_ORIGINS` on the Identity Service and the engine, additively (§12.7). Deployment config, not code.                                                                       |
| OQ-G3 | LetterReveal pottery animation — emoji placeholder, awaiting approved asset                                                                                                                                                |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                                                                                                                                                                  |
| OQ-I3 | Guest device progress merge — blocked on Game Service intake spec                                                                                                                                                          |

### Upstream spec references (in the dictionary repo)

These specs live in `Starisian-Technologies/sparxstar-3iatlas-dictionary` and
are not vendored here. Read them there when accessible:

- `.github/instructions/3IATLAS-DICTIONARY-ROLE-AND-PIPELINE-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-MULTILANGUAGE-MODEL-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-ENRICHMENT-FIELDS-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-APPROVED-ENTRY-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md`
