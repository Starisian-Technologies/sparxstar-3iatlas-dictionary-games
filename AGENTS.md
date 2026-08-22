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

The RLC Games layer — a standalone React package containing the game shell,
all six game components, session and progress hooks, IndexedDB utilities, and
the dictionary API client. Extracted from `sparxstar-3iatlas-dictionary`. It is
a **pure consumer** of the dictionary REST API. It contains no WordPress code,
no PHP, and no server-side logic. See `ROLE.md` for the full boundary.

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

- `useProgressSync.syncNow()` MUST NOT post to the network without a real
  bearer token. As of Phase 3 (2026-08-05) it is **no longer a no-op** — the
  Game-Service intake spec (`GAME-SERVICE-INTAKE-SPEC-v1.0`, node-engine
  repo) is committed and implemented, and `syncNow()` POSTs to it — but the
  network branch only runs when a host-supplied `getSuiteToken()` call
  resolves to a truthy token, and no host does that today. This is **not** a
  guest-token-issuance gap — guest play never calls this path at all, by
  design (device-local, permanent, per
  `3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md` §4) — and it is
  **not** a missing issuer: `sparxstar-identity` exists
  (`sparxstar-3iatlas-identity-node`), mints RS256 suite tokens, and is
  production-ready for adult accounts. The outstanding work is engine-side:
  `/events/batch` admits only RLC participant tokens today, and settlement
  still requires an RLC session. Adult suite-token intake is approved but
  unimplemented there. See `docs/dictionary-games-tech-spec.md` §11 (no
  longer cited via the retired "OQ-G1" label).
- Do not read Helios Bearer tokens from `localStorage` (XSS exposure).
- Never emit `Access-Control-Allow-Credentials`.
- WordPress authentication is prohibited for all game endpoints.

### Open questions tracked by this repo

| ID    | Description                                                                                                                                                                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | **CLOSED, corrected 2026-08.** Not a guest-token gap — guest play is device-local by design, permanently, per `3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md` §4. `syncNow()` is implemented (Phase 3) and gated on `sparxstar-identity` (not yet built) for authenticated accounts only. See `docs/dictionary-games-tech-spec.md` §11. |
| OQ-G3 | LetterReveal pottery animation — emoji placeholder, awaiting approved asset                                                                                                                                                                                                                                                                   |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                                                                                                                                                                                                                                                                                     |
| OQ-I3 | Guest device progress merge — blocked on Game Service intake spec                                                                                                                                                                                                                                                                             |

### Upstream spec references (in the dictionary repo)

These specs live in `Starisian-Technologies/sparxstar-3iatlas-dictionary` and
are not vendored here. Read them there when accessible:

- `.github/instructions/3IATLAS-DICTIONARY-ROLE-AND-PIPELINE-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-MULTILANGUAGE-MODEL-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-ENRICHMENT-FIELDS-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-APPROVED-ENTRY-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md`
