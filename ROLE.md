# 3iAtlas Dictionary Games (RLC Games) — Role and Boundary

This repo is the **RLC Games layer** — the game shell, the six learning-game
components, session and progress hooks, IndexedDB utilities, and the dictionary
REST API client. It was extracted from `sparxstar-3iatlas-dictionary` and is a
**pure consumer** of that dictionary's REST API.

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
- The browser-side dictionary REST **client** and its TypeScript type
  contract (`src/api/DictionaryApiClient.js`, `src/api/dictionary-api.d.ts`).
- The build that produces the UMD bundle consumed by host shells
  (`webpack.config.js`, output `RlcGames`).
- **The `games.sparxstar.com` website**: its React shell and adult Identity
  sign-in (`src/site/`), its build (`webpack.site.config.js`), and its static
  host artifacts (`deploy/Dockerfile`, `deploy/nginx/*.conf`). The site holds
  the suite token in memory only — see `docs/dictionary-games-tech-spec.md`
  §12.3.

## Does not own

- **The dictionary data, the REST API server, and its authentication.**
  Owned by `Starisian-Technologies/sparxstar-3iatlas-dictionary`. This repo
  only calls those endpoints; it never defines them. The `.d.ts` here mirrors
  the server's published contract — the server is the source of truth.
- **Identity and token issuance.** `sparxstar-3iatlas-identity-node`
  (`https://id.sparxstar.com`) is the platform's one authentication authority
  and the only minter of suite tokens. This repo authenticates against it and
  never issues, signs, refreshes, or persists a token — and never decides what
  a token holder may do. Guest progress stays device-local; there is no token
  for an anonymous player and this repo must not invent one. See
  `docs/dictionary-games-tech-spec.md` §12.3 and §11 (the retired "OQ-G1"
  label is explained there).
- **Audio asset generation** and **dictionary entry enrichment** — owned by
  the dictionary pipeline.
- **WordPress / PHP / server-side logic** — browser code only. The static host
  in `deploy/` serves files; it runs no application code and holds no secret.
  The `/pronounce` TTS endpoint once drafted here belongs to the dictionary
  repo, which implements it (spec §12.8).
- **The host application chrome** (navigation, the Browse tab, page-level
  auth). Hosts mount `<GameShell />`; they own everything around it.

## Product group

- **IAtlas** (`sparxstar-3iatlas-*`)

## Contracts produced

- None — this repo **consumes contracts only**. The dictionary REST contract
  it depends on is published by `sparxstar-3iatlas-dictionary`. This repo does
  not publish any PHP interfaces to `sparxstar-platform-contracts`, so it runs
  no contract-sync workflow.

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
**OQ-G4**, **OQ-I3** (see `AGENTS.md`); the progress-sync blocker previously
cited as "OQ-G1" is now stated in plain language in
`docs/dictionary-games-tech-spec.md` §11 (see the retirement note there).
