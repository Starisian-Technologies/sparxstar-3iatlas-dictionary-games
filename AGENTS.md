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

### Repo structure

```
src/
  index.jsx                  — public exports (components, hooks, API client)
  constants.js               — PRODUCTION_GAMES set
  components/
    GameShell.jsx            — top-level orchestrator (setup → playing → complete)
    AccessoryBar.jsx         — Mandinka special-character insertion bar (floating)
    SessionComplete.jsx      — post-session summary screen
    games/
      ListenWrite.jsx        — Game 4.1 — audio plays, player writes the word
      ArrangeWord.jsx        — Game 4.2 — scrambled tiles, tap to build the word
      MeaningMatch.jsx       — Game 4.3 — headword shown, choose correct meaning
      CompleteSentence.jsx   — Game 4.4 — fill the blank in a real example sentence
      LetterReveal.jsx       — Game 4.5 — blank tiles, tap letters to uncover
      DomainFlash.jsx        — Game 4.6 — flashcards through a semantic domain
  hooks/
    idbUtils.js              — IndexedDB open/get/put/getAll/delete helpers
    useGameSet.js            — fetches /game-set with 3-day IndexedDB cache
    useGameSession.js        — session persistence, result recording, XP tracking
    useProgressSync.js       — progress event outbox (network sync pending OQ-G1)
  api/
    DictionaryApiClient.js   — ES module REST client factory
    dictionary-api.d.ts      — TypeScript type contract (mirror of server contract)
```

### Dictionary API constraints

The game service is a **strict-mode consumer**:

- Always sends `lang_source` — never uses `mode=ecology` or `mode=cross_language`.
- `/game-set` returns only primary-language entries for the requested language.
- `/wordlist` requires a consumer **API key** (`X-Api-Key`), not an ephemeral
  page token; sending a page token returns 403.
- `mode=strict` is the default and the only mode the game layer uses.

### Authentication model (Webster)

| Credential            | Header         | Scope                                      |
|-----------------------|----------------|--------------------------------------------|
| Ephemeral page token  | `X-Page-Token` | Browse endpoints, same-origin apps         |
| Consumer API key      | `X-Api-Key`    | All endpoints, including `/wordlist`        |

- `GET /page-token` requires no credentials.
- Keys are stored SHA-256 hashed server-side — plaintext is never stored.
- Never use `is_user_logged_in()` or WordPress auth on game endpoints.

### IndexedDB stores (`aiwa-games-db`)

| Store             | Purpose                                                          |
|-------------------|-----------------------------------------------------------------|
| `game-sets`       | Cached `/game-set` responses (3-day TTL, keyed by lang+domain+limit+audio) |
| `game-sessions`   | Current session state (persisted on every word result)          |
| `progress-outbox` | Event queue for Helios sync (pending OQ-G1)                      |
| `learned-words`   | Cumulative set of UUIDs the player has correctly written        |

### Production vs recognition games

`PRODUCTION_GAMES = { listen_write, arrange_word, complete_sentence, letter_reveal }`.
Only production games contribute to the "words you can write" count shown in
`SessionComplete`. `DomainFlash` and `MeaningMatch` are recognition-only — they
do not increment `learnedCount`.

### Security rules (hard requirements)

- `useProgressSync.syncNow()` MUST NOT post to the network until the
  Game-Service intake spec is committed and **OQ-G1** is resolved with an
  approved token-delivery mechanism. It is a deliberate no-op today.
- Do not read Helios Bearer tokens from `localStorage` (XSS exposure).
- Never emit `Access-Control-Allow-Credentials`.
- WordPress authentication is prohibited for all game endpoints.

### Open questions tracked by this repo

| ID     | Description                                                              |
|--------|-------------------------------------------------------------------------|
| OQ-G1  | Helios token source — `useProgressSync.syncNow()` is a no-op until resolved |
| OQ-G3  | LetterReveal pottery animation — emoji placeholder, awaiting approved asset |
| OQ-G4  | DomainFlash "I knew it" hook confirmation                               |
| OQ-I3  | Guest device progress merge — blocked on Game Service intake spec       |

### Upstream spec references (in the dictionary repo)

These specs live in `Starisian-Technologies/sparxstar-3iatlas-dictionary` and
are not vendored here. Read them there when accessible:

- `.github/instructions/3IATLAS-DICTIONARY-ROLE-AND-PIPELINE-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-MULTILANGUAGE-MODEL-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-ENRICHMENT-FIELDS-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-DICTIONARY-APPROVED-ENTRY-SPEC-v1.0.md`
- `.github/instructions/3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md`
