# sparxstar-3iatlas-dictionary-games

The **AIWA RLC Games layer** — a standalone React package containing the game
shell, six language-learning game components, session and progress hooks, an
IndexedDB caching layer, and the typed dictionary REST client.

A collection of challenging word games for any language. Extracted from
`sparxstar-3iatlas-dictionary`, it is a **pure consumer** of that dictionary's
REST API — no WordPress code, no PHP, no server-side logic.

**Two build targets, one source tree:**

|         | What                                      | Command               | Output                                                         |
| :------ | :---------------------------------------- | :-------------------- | :------------------------------------------------------------- |
| Package | UMD bundle for host shells to mount       | `pnpm run build`      | `dist/js/rlc-games.min.js` (global `RlcGames`, React external) |
| Website | The deployable `games.sparxstar.com` site | `pnpm run build:site` | `dist-site/` (`index.html` + hashed assets, React bundled)     |

> See **`ROLE.md`** for the repo boundary, **`AGENTS.md`** for the rules agents
> must follow, **`DEPLOY.md`** for shipping the website, and
> **`docs/dictionary-games-tech-spec.md`** for the full spec (§12 covers the
> website).

## The six games

| Game             | ID                  | Description                                |
| ---------------- | ------------------- | ------------------------------------------ |
| ListenWrite      | `listen_write`      | Audio plays, the player writes the word    |
| ArrangeWord      | `arrange_word`      | Scrambled tiles, tap to build the word     |
| MeaningMatch     | `meaning_match`     | Headword shown, choose the correct meaning |
| CompleteSentence | `complete_sentence` | Fill the blank in a real example sentence  |
| LetterReveal     | `letter_reveal`     | Blank tiles, tap letters to uncover        |
| DomainFlash      | `domain_flash`      | Flashcards through a semantic domain       |

`listen_write`, `arrange_word`, `complete_sentence`, and `letter_reveal` are
_production_ games and contribute to the learner's "words you can write" count.
`meaning_match` and `domain_flash` are recognition-only.

## Install & build

This repo uses **pnpm** (`packageManager` is pinned in `package.json`; enable it
with `corepack enable`).

```bash
pnpm install
pnpm run build       # package → dist/js/rlc-games.min.js (UMD global RlcGames)
pnpm run build:site  # website → dist-site/ (index.html + hashed assets)
pnpm run build:all   # both
pnpm run watch       # rebuild the package on change
pnpm run lint        # eslint --fix
pnpm run format      # prettier --write
pnpm test            # jest
```

In the **package** build `react` and `react-dom` are webpack externals — the
host application provides them. In the **website** build they are bundled,
because the website is the host.

### The website

`src/site/` is a first-party host for the same components: it mounts
`<GameShell />`, supplies Tailwind, and adds adult sign-in against the 3iAtlas
Identity Service. Signing in is optional — guest play is complete and stays on
the device; signing in lets finished results earn XP.

The suite token is held **in memory only**, so a page refresh signs the player
out. That is deliberate and documented (spec §12.3–§12.4) — please read it
before "fixing" it.

`src/site/` imports from the package sources; the package must never import from
`src/site/`.

```bash
GAMES_ENGINE_URL=https://staging-rlc.example/api/v1 pnpm run build:site
```

Endpoints default to production and are overridable per build with
`GAMES_ENGINE_URL`, `GAMES_IDENTITY_URL` and `GAMES_SITE_URL`. None is a secret;
no credential is ever compiled in.

There is deliberately **no dictionary endpoint** among them. See below.

### The BFF — how dictionary content is read

The Dictionary API is private: no browser, anonymous user, or unregistered
application may call it. So the browser calls this site's own
`/api/dictionary/*`, Nginx proxies that to a small server-side BFF (`server/`),
and the BFF authenticates itself to the Identity Node as
`service:dictionary-games` and calls the Dictionary with a five-minute service
token.

```bash
pnpm run start:bff   # needs the env in docs/dictionary-games-bff.md §8
```

The BFF has **zero runtime dependencies** — `node:http` and `node:crypto` only.
It holds the deployment's one private key, and every package it carried would be
a package that could reach that key.

Consequences worth knowing before you change browser code:

- The dictionary origin is not in the bundle **and** is not permitted by the
  CSP's `connect-src`. A direct call from the page is blocked by policy, not
  merely absent from the code.
- `createDictionaryApiClient` and the page-token helpers are **deleted**. The
  Dictionary Node has no `/page-token` route, and a browser client for a private
  API is the capability this design removes.
- `useGameSet` no longer caches to IndexedDB. Words carry rights and consent
  restrictions and can be withdrawn; a TTL is not a withdrawal mechanism.

Full design, the Identity subject, the route allowlist, rights handling and the
known `/languages` gap: [`docs/dictionary-games-bff.md`](./docs/dictionary-games-bff.md).

## Usage

### Mount the game shell

```jsx
import { GameShell } from 'sparxstar-rlc-games';

<GameShell
    /* Same-origin base path of a BFF that holds a dictionary credential.
       Never the Dictionary API's own address — it is private. */
    bffPath="/api/dictionary"
    language="en"
    sourceLanguage="mnk"
    languages={[{ slug: 'mnk', code: 'mnk', name: 'Mandinka' }]}
    onSourceLanguage={(slug) => setSourceLanguage(slug)}
    onBrowse={() => setTab('browse')}
/>;
```

### Reading dictionary content from another host

There is no longer a browser client to import, and that is the point: the
Dictionary API is private, so a client a browser can hold is a credential a
browser can hold.

A host that wants dictionary content runs its own server-side holder and points
`<GameShell />` at it:

```jsx
<GameShell bffPath="/api/dictionary" /* ...your BFF, on your origin... */ />
```

This repo ships a reference implementation in `server/` — 300 lines, zero
runtime dependencies, and documented in
[`docs/dictionary-games-bff.md`](./docs/dictionary-games-bff.md). It needs an
Identity Node service client (`private_key_jwt`) and a matching caller row in
the Dictionary Node's registry; both are provisioned by CLI, and DEPLOY.md has
the ordered runbook.

`src/api/dictionary-api.d.ts` remains the type contract for the content shapes.
The Dictionary Node is the source of truth for them.

## Governance

This repo participates in the platform governance system:

- `.github/instructions/governance/` — compiled ADRs, invariants, and open
  questions (auto-synced, read-only).
- `.github/workflows/standards.yml` — org-wide JS/CSS/formatting enforcement.
- `docs/dictionary-games-tech-spec.md` — the product spec (submitted to the
  spec registry under `specs/IAtlas/`).
- `DEPLOY.md` — building and serving the website.

## License

Proprietary — © Starisian Technologies.
