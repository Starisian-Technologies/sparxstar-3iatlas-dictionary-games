# sparxstar-3iatlas-dictionary-games

The **AIWA RLC Games layer** — a standalone React package containing the game
shell, six language-learning game components, session and progress hooks, an
IndexedDB caching layer, and the typed dictionary REST client.

A collection of challenging word games for any language. Extracted from
`sparxstar-3iatlas-dictionary`, this package is a **pure consumer** of that
dictionary's REST API — it contains no WordPress code, no PHP, and no
server-side logic.

> Built as the UMD global `RlcGames` (npm package name `sparxstar-rlc-games`).
> See **`ROLE.md`** for the repo boundary, **`AGENTS.md`** for the rules agents
> must follow, and **`docs/dictionary-games-tech-spec.md`** for the full spec.

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
pnpm run build      # webpack → dist/js/rlc-games.min.js (UMD global RlcGames)
pnpm run watch      # rebuild on change
pnpm run lint       # eslint --fix
pnpm run format     # prettier --write
pnpm test           # jest --passWithNoTests
```

`react` and `react-dom` are webpack externals — the host application provides
them.

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

## License

Proprietary — © Starisian Technologies.
