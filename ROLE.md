# 3iAtlas Dictionary Games (RLC Games) — Role and Boundary

This repo is the **RLC Games layer** — a standalone React package containing
the game shell, the six learning-game components, session and progress hooks,
IndexedDB utilities, and the dictionary REST API client. It was extracted from
`sparxstar-3iatlas-dictionary` and is a **pure consumer** of that dictionary's
REST API.

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

## Does not own

- **The dictionary data, the REST API server, and its authentication.**
  Owned by `Starisian-Technologies/sparxstar-3iatlas-dictionary`. This repo
  only calls those endpoints; it never defines them. The `.d.ts` here mirrors
  the server's published contract — the server is the source of truth.
- **Helios identity and token issuance.** Progress sync is blocked on OQ-G1
  until an approved token-delivery mechanism exists. This repo must not read
  Helios Bearer tokens from `localStorage` or ship a network sync path.
- **Audio asset generation** and **dictionary entry enrichment** — owned by
  the dictionary pipeline.
- **WordPress / PHP / server-side logic** — this is a browser package only.
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

- **AIWA Browse App** — mounts `<GameShell />` in the Play tab.
- **RLC standalone builds** — embed the game suite in other shell apps.
- **WordPad / S2S** — may use individual game components or the API client.

## Governance

Platform decisions, invariants, and open questions live in the governance
snapshot at `.github/instructions/governance/` (auto-synced; read-only) and in
the registries cited from `AGENTS.md`. Cite ADRs and invariants by number —
do not restate them here. Open questions tracked by this repo: **OQ-G1**,
**OQ-G3**, **OQ-G4**, **OQ-I3** (see `AGENTS.md`).
