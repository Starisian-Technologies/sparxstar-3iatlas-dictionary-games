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

- `useProgressSync.syncNow()` MUST NOT post to the network until a
  Game-Service intake spec is committed and a token-issuance mechanism exists
  for anonymous/guest game clients. It is a deliberate no-op today. See
  `docs/dictionary-games-tech-spec.md` §11 for the current blocker stated in
  plain language — it is **no longer cited via the "OQ-G1" label**. That
  label drifted and now disagrees between this repo and
  `sparxstar-3iatlas-dictionary`'s governance docs, and no GitHub Issue backs
  it in either repo, so it has been retired as a citation (see the note in
  §11 for the full explanation).
- Do not read Helios Bearer tokens from `localStorage` (XSS exposure).
- Never emit `Access-Control-Allow-Credentials`.
- WordPress authentication is prohibited for all game endpoints.

### Open questions tracked by this repo

| ID    | Description                                                                                                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | Progress-sync token-issuance blocker for anonymous/guest game clients — stated in plain language in `docs/dictionary-games-tech-spec.md` §11. No longer cited as "OQ-G1"; see the retirement note there. |
| OQ-G3 | LetterReveal pottery animation — emoji placeholder, awaiting approved asset                                                                                                                              |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                                                                                                                                                |
| OQ-I3 | Guest device progress merge — blocked on Game Service intake spec                                                                                                                                        |

### Upstream spec references (in the dictionary repo)

These specs live in `Starisian-Technologies/sparxstar-3iatlas-dictionary` and
are not vendored here. Read them there when accessible:

- `.github/instructions/3IATLAS-DICTIONARY-ROLE-AND-PIPELINE-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-MULTILANGUAGE-MODEL-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-ENRICHMENT-FIELDS-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-APPROVED-ENTRY-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md`
