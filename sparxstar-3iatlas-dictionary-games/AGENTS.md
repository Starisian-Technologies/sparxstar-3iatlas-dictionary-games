# AGENTS.md — sparxstar-rlc-games

## What This Repo Is

The AIWA RLC Games layer — a standalone React package containing the game shell, all six game components, session and progress hooks, IndexedDB utilities, and the dictionary API client.

This repo is extracted from `sparxstar-3iatlas-dictionary`. It is a **pure consumer** of the dictionary REST API. It does not contain WordPress code, PHP, or any server-side logic.

---

## Who Consumes This

- **AIWA Browse App** — mounts `<GameShell />` in the Play tab
- **RLC standalone builds** — embeds the game suite in other shell applications
- **WordPad / S2S** — may use individual game components or the API client

---

## Repo Structure

```
src/
  index.jsx                  — public exports (all components, hooks, API client)
  constants.js               — PRODUCTION_GAMES set

  components/
    GameShell.jsx             — top-level game orchestrator (setup → playing → complete)
    AccessoryBar.jsx          — Mandinka special-character insertion bar (floating)
    SessionComplete.jsx       — post-session summary screen

    games/
      ListenWrite.jsx          — Game 4.1 — audio plays, player writes the word
      ArrangeWord.jsx          — Game 4.2 — scrambled tiles, tap to build the word
      MeaningMatch.jsx         — Game 4.3 — headword shown, choose correct meaning
      CompleteSentence.jsx     — Game 4.4 — fill the blank in a real example sentence
      LetterReveal.jsx         — Game 4.5 — blank tiles, tap letters to uncover
      DomainFlash.jsx          — Game 4.6 — flashcards through a semantic domain

  hooks/
    idbUtils.js               — IndexedDB open/get/put/getAll/delete helpers
    useGameSet.js             — fetches /game-set with 3-day IndexedDB cache
    useGameSession.js         — session persistence, result recording, XP tracking
    useProgressSync.js        — progress event outbox (IndexedDB, network sync pending OQ-G1)

  api/
    DictionaryApiClient.js    — ES module REST client factory
    dictionary-api.d.ts       — TypeScript type contract
```

---

## Game Shell Usage

```jsx
import { GameShell } from "sparxstar-rlc-games";

<GameShell
  restUrl="https://example.com/wp-json/sparxstar/v1/dictionary"
  language="en"
  sourceLanguage="mandinka"
  languages={[{ slug: "mandinka", name: "Mandinka" }]}
  onSourceLanguage={(slug) => setSourceLanguage(slug)}
  onBrowse={() => setTab("browse")}
/>;
```

---

## API Client Usage

```js
import { createDictionaryApiClient } from "sparxstar-rlc-games";

// Consumer API key (WordPad, S2S, server-side):
const dict = createDictionaryApiClient({
  baseUrl: "https://example.com/wp-json/sparxstar/v1/dictionary",
  apiKey: "sk_...",
});
const wordlist = await dict.wordlist({ lang_source: "mandinka" });

// Same-origin browser app (page-token flow):
const dict = createDictionaryApiClient({ baseUrl: restUrl });
const tokenRes = await dict.getPageToken();
dict.setPageToken(tokenRes.data.token);
const result = await dict.lookup({ slug: "my-word" });
```

---

## Dictionary API Constraints

The game service is a **strict-mode consumer**:

- Always sends `lang_source` — never uses `mode=ecology` or `mode=cross_language`
- `/game-set` returns only primary-language entries for the requested language
- `/wordlist` requires a consumer API key (API key, not ephemeral page token)
- `mode=strict` is the default and the only mode the game layer uses

---

## Authentication Model (Webster)

| Credential           | Header         | Scope                               |
| -------------------- | -------------- | ----------------------------------- |
| Ephemeral page token | `X-Page-Token` | Browse endpoints, same-origin apps  |
| Consumer API key     | `X-Api-Key`    | All endpoints including `/wordlist` |

- `/wordlist` rejects ephemeral page tokens with 403 — API key only
- `GET /page-token` requires no credentials
- Keys are stored SHA-256 hashed server-side — plaintext is never stored
- Never use `is_user_logged_in()` or WordPress auth on game endpoints

---

## IndexedDB Stores

| Store             | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `game-sets`       | Cached /game-set responses (3-day TTL, keyed by lang+domain+limit+audio) |
| `game-sessions`   | Current session state (persisted on every word result)                   |
| `progress-outbox` | Event queue for Helios sync (pending OQ-G1)                              |
| `learned-words`   | Cumulative set of UUIDs the player has correctly written                 |

---

## Production vs Recognition Games

`PRODUCTION_GAMES` = `{ listen_write, arrange_word, complete_sentence, letter_reveal }`

Only production games contribute to the "words you can write" count shown in `SessionComplete`. `DomainFlash` and `MeaningMatch` are recognition-only — they do not increment `learnedCount`.

---

## Open Questions

| ID    | Description                                                                      |
| ----- | -------------------------------------------------------------------------------- |
| OQ-G1 | Helios token source — `useProgressSync.syncNow()` is a no-op until resolved      |
| OQ-G3 | LetterReveal pottery animation — emoji placeholder, awaiting AIWA-approved asset |
| OQ-G4 | DomainFlash "I knew it" hook confirmation                                        |
| OQ-I3 | Guest device progress merge — blocked on Game Service intake spec                |

---

## Security Rules

- `syncNow()` MUST NOT post to the network until `GAME-SERVICE-INTAKE-SPEC-v1.0` is committed and OQ-G1 is resolved with an approved token-delivery mechanism
- Do not read Helios Bearer tokens from localStorage (XSS exposure)
- Never emit `Access-Control-Allow-Credentials`
- WordPress authentication is prohibited for all game endpoints

---

## Spec References

| Document              | Location (dictionary repo)                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| API contract          | `src/js/api/dictionary-api.d.ts`                                           |
| Role and pipeline     | `.github/instructions/3IATLAS-DICTIONARY-ROLE-AND-PIPELINE-SPEC-v1.0.md`   |
| Multilanguage model   | `.github/instructions/3IATLAS-DICTIONARY-MULTILANGUAGE-MODEL-SPEC-v1.0.md` |
| Enrichment fields     | `.github/instructions/3IATLAS-DICTIONARY-ENRICHMENT-FIELDS-SPEC-v1.0.md`   |
| Approved entry format | `.github/instructions/3IATLAS-DICTIONARY-APPROVED-ENTRY-SPEC-v1.0.md`      |
