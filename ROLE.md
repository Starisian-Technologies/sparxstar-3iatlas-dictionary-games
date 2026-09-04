# 3iAtlas Dictionary Games (RLC Games) — Role and Boundary

This repo is the **RLC Games layer** — the game shell, the six learning-game
components, session and progress hooks, IndexedDB utilities, and (since
2026-09-04) the **server-side BFF** through which all dictionary content is
read. It was extracted from `sparxstar-3iatlas-dictionary` and is a **consumer**
of that dictionary's API.

> **BOUNDARY CHANGE, 2026-09-04.** This repo is no longer browser-only. It owns
> one server-side component: the Dictionary Games BFF (`server/`), added under
> the locked cross-repository specification _Dictionary Service Authentication
> and Games Integration_. Earlier revisions of this file and of `AGENTS.md` said
> the repo "contains no server-side logic" — that is no longer true, and the
> reason it changed is not convenience: **the Dictionary API is private.** No
> browser, anonymous user, or unregistered application may call it, so a
> server-side holder of a credential is the only way the games can read words at
> all. See `docs/dictionary-games-bff.md`.
>
> The boundary that replaces it is narrower and enforceable: the BFF is the
> **only** server-side code here, it serves the games origin only, and it exists
> solely to hold a credential the browser must not. It is not a general
> application server and must not grow into one.

Since 2026-08-25 it also owns the **deployable website** at
`games.sparxstar.com` (`src/site/`, built by `webpack.site.config.js`), which is
a first-party host for the same components — the package boundary is preserved
by keeping the site a one-way consumer of the package sources, not by keeping
the site out of the repo.

## Owns

- The `<GameShell />` orchestrator and the six game components
  (`ListenWrite`, `ArrangeWord`, `MeaningMatch`, `CompleteSentence`,
  `LetterReveal`, `DomainFlash`).
- Client-side session lifecycle and progress tracking
  (`useGameSession`, `useGameSet`, `useProgressSync`) and the IndexedDB
  caching layer (`idbUtils` — database `aiwa-games-db`).
- **The Dictionary Games BFF** (`server/`): the `private_key_jwt` client that
  authenticates to `sparxstar-3iatlas-identity-node` as
  `service:dictionary-games`, the authenticated M2M call to the Dictionary's
  `GET /v1/m2m/gamepack`, the rights-preserving projection, and the
  browser-facing route allowlist. Zero runtime dependencies, by design.
- The TypeScript type contract for dictionary content
  (`src/api/dictionary-api.d.ts`), which mirrors the server's published shapes.

    **Retired 2026-09-04:** `src/api/DictionaryApiClient.js` and
    `src/api/pageToken.js` are deleted, not moved. They existed to call the
    Dictionary REST API from a browser, carrying an ephemeral page token or a
    consumer API key. The Dictionary API is private and the Node service has no
    `/page-token` route; a browser client for it is the exact capability this
    architecture removes.

- The build that produces the UMD bundle consumed by host shells
  (`webpack.config.js`, output `RlcGames`).
- **The `games.sparxstar.com` website**: its React shell and adult Identity
  sign-in (`src/site/`), its build (`webpack.site.config.js`), and its static
  host artifacts (`deploy/Dockerfile`, `deploy/nginx/*.conf`). The site holds
  the suite token in memory only — see `docs/dictionary-games-tech-spec.md`
  §12.3.

## Does not own

- **The dictionary data, the API server, and its authentication.**
  Owned by `Starisian-Technologies/sparxstar-3iatlas-dictionary-node`. This repo
  only calls those endpoints; it never defines them. The `.d.ts` here mirrors
  the server's published contract — the server is the source of truth. In
  particular this repo does **not** decide the Dictionary's caller scopes, entry
  budgets, rights filtering, or which fields a projection carries; the BFF
  narrows what it receives and never widens it.
- **Identity and token issuance.** Owned by `sparxstar-identity` — the
  `Starisian-Technologies/sparxstar-3iatlas-identity-node` repo, which
  **exists and is production-ready for adult accounts** — the sole issuer of
  suite JWTs. This repo only ever _presents_ one: it never issues, signs,
  refreshes, or persists a token, and never decides what a token holder may
  do. It must not read a Bearer/suite token
  from `localStorage`; the website holds it in memory only
  (`docs/dictionary-games-tech-spec.md` §12.3). Guest play never authenticates
  at all — device-local by design, permanently, per
  `3IATLAS-IDENTITY-AND-GAME-SERVICES-DECISION-v1.0.md` §4 — and this repo must
  not invent a guest token. Progress sync is **live for signed-in adults as of
  2026-08-25**: an earlier note here said the Game Node did not yet accept
  suite tokens on `/events/batch`, which is no longer accurate — it
  authenticates with `authenticateParticipantOrSuite` and settles adult solo
  results through `settleSoloGameResult`. See §11 and §12.3 (the retired
  "OQ-G1" label is explained there).
- **Audio asset generation** and **dictionary entry enrichment** — owned by
  the dictionary pipeline.
- **WordPress / PHP.** Still none, and none is wanted. The server-side code
  this repo now owns is the BFF and nothing else — see the boundary change
  above. The `/pronounce` TTS endpoint once drafted here belongs to the
  dictionary repo, which implements it (spec §12.8).
- **The static host's secrets — because it has none.** `deploy/Dockerfile`
  builds an Nginx image that serves files and proxies one location; it runs no
  application code and holds no credential. The dictionary signing key lives
  only in the BFF container (`deploy/Dockerfile.bff`), mounted read-only at
  runtime.
- **The host application chrome** (navigation, the Browse tab, page-level
  auth). Hosts mount `<GameShell />`; they own everything around it.

## Product group

- **IAtlas** (`sparxstar-3iatlas-*`)

## Contracts produced

- **The BFF's browser-facing routes** (`/api/dictionary/*`), documented in
  `docs/dictionary-games-bff.md` §4. Same-origin and consumed only by this
  repo's own site and by hosts that mount `<GameShell />` against their own
  BFF, so it is a narrow contract — but it is one, and it is the first this
  repo has published.
- Otherwise this repo **consumes contracts only**. The dictionary API contract
  it depends on is published by `sparxstar-3iatlas-dictionary-node`. This repo
  does not publish any PHP interfaces to `sparxstar-platform-contracts`, so it
  runs no contract-sync workflow.

## Consumed by

- **`games.sparxstar.com`** — this repo's own website, built from `src/site/`.
- **AIWA Browse App** — mounts `<GameShell />` in the Play tab.
- **RLC standalone builds** — embed the game suite in other shell apps.
- **WordPad / S2S** — may use individual game components or the API client.

## Governance

Platform decisions, invariants, and open questions live in the governance
snapshot at `.github/instructions/governance/` (auto-synced; read-only) and in
the registries cited from `AGENTS.md`. Cite ADRs and invariants by number —
do not restate them here. Open questions tracked by this repo: **OQ-G3**,
**OQ-G4**, **OQ-I3** (blocked on the Identity Service spec, not the intake
spec — see `AGENTS.md`). The progress-sync blocker previously cited as
"OQ-G1" is **closed, not open** — guest play never syncs, by design; see
`docs/dictionary-games-tech-spec.md` §11.
