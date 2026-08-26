# Copilot Review Instructions

## Reference repositories (read via MCP)

Before reviewing any PR, read these repos:

- ADR Registry: Starisian-Technologies/sparxstar-architecture-decision-record
- Product Specs: Starisian-Technologies/sparxstar-product-technical--specifications
- Coding Standards: Starisian-Technologies/starisian-technologies-coding-standards
- Contracts: Starisian-Technologies/sparxstar-platform-contracts

Also read the upstream API contract source in
Starisian-Technologies/sparxstar-3iatlas-dictionary, since this repo is a pure
consumer of that dictionary's REST API.

## Review checklist

Flag any PR that:

- Contradicts an ADR or invariant
- Assumes an answer to an open question (OQ in OPEN state) — in particular,
  the progress-sync guest-client token-issuance blocker (see
  `docs/dictionary-games-tech-spec.md` §11; no longer cited as "OQ-G1" — see
  the retirement note there), OQ-G3, OQ-G4, OQ-I3
- Violates a coding standard
- Changes a contract interface without updating the README
- Changes behavior that contradicts the product spec
  (`docs/dictionary-games-tech-spec.md`)
- Adds code with no spec backing it

## Repo-specific red lines (this is a browser-only consumer package)

- `useProgressSync.syncNow()` MUST NOT post to the network without a real
  bearer token. As of Phase 3 it is no longer a no-op; the network path is
  gated on a host-supplied truthy suite token and remains dormant for guest
  play by design (see `docs/dictionary-games-tech-spec.md` §11).
- Reading a Helios Bearer token from `localStorage` (XSS exposure).
- Emitting `Access-Control-Allow-Credentials`.
- Any WordPress / PHP / server-side auth on game endpoints
  (`is_user_logged_in()` and friends are prohibited).
- Sending an ephemeral page token to `/wordlist` (API key only — server returns 403).
- Using `mode=ecology` or `mode=cross_language` — the game layer is strict-mode only.

You are a reviewer, not the authority. Flag and explain. The owner decides.
