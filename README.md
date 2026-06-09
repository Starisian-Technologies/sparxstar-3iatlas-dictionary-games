# sparxstar-3iatlas-dictionary-games

SPARXSTAR 3iAtlas RLC Games — React game shell and components for the AIWA dictionary learning games suite.

A collection of challenging word games for any language, including Listen & Write, Arrange Word, Meaning Match, Complete Sentence, Letter Reveal, and Domain Flash.

## Development

```bash
pnpm install
pnpm build      # production webpack build → dist/
pnpm watch      # webpack watch mode
pnpm lint       # ESLint
pnpm lint:fix   # ESLint with auto-fix
pnpm format     # Prettier
pnpm test       # Jest
```

## Usage

```jsx
import { GameShell } from 'sparxstar-3iatlas-dictionary-games';

<GameShell
  restUrl="https://example.com/wp-json/sparxstar/v1/dictionary"
  language="en"
  sourceLanguage="mandinka"
  languages={[{ slug: 'mandinka', name: 'Mandinka' }]}
  onSourceLanguage={(slug) => setSourceLanguage(slug)}
  onBrowse={() => setTab('browse')}
/>
```

See [AGENTS.md](./AGENTS.md) for architecture details, open questions, and security rules.
