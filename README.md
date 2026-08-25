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
GAMES_DICTIONARY_URL=https://dictionary.example/wp-json/sparxstar/v1/dictionary \
  pnpm run build:site
```

Endpoints default to production and are overridable per build with
`GAMES_ENGINE_URL`, `GAMES_IDENTITY_URL`, `GAMES_SITE_URL` and
`GAMES_DICTIONARY_URL`. None is a secret; no credential is ever compiled in.

## Usage

### Mount the game shell

```jsx
import { GameShell } from 'sparxstar-rlc-games';

<GameShell
    restUrl="https://example.com/wp-json/sparxstar/v1/dictionary"
    language="en"
    sourceLanguage="mandinka"
    languages={[{ slug: 'mandinka', name: 'Mandinka' }]}
    onSourceLanguage={(slug) => setSourceLanguage(slug)}
    onBrowse={() => setTab('browse')}
/>;
```

### Call the dictionary API directly

```js
import { createDictionaryApiClient } from 'sparxstar-rlc-games';

// Consumer API key (server-side, WordPad, S2S):
const dict = createDictionaryApiClient({
    baseUrl: 'https://example.com/wp-json/sparxstar/v1/dictionary',
    apiKey: 'sk_...',
});
const wordlist = await dict.wordlist({ lang_source: 'mandinka' });

// Same-origin browser app (page-token flow):
const browser = createDictionaryApiClient({ baseUrl: restUrl });
browser.setPageToken((await browser.getPageToken()).data.token);
const result = await browser.lookup({ slug: 'my-word' });
```

`/wordlist` requires a consumer API key; sending an ephemeral page token returns 403. See `src/api/dictionary-api.d.ts` for the full type contract.

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
