# Dictionary API field-usage matrix

Every field the Dictionary's `GET /v1/m2m/gamepack` returns, against what each
of the six games actually requests and uses.

Built by reading three things rather than assuming any of them:

1. **What the API returns** — 488 real Mandinka entries pulled from the
   deployed games BFF, giving a measured fill rate per field. "Available" and
   "populated" are different claims and the table keeps them apart.
2. **What the BFF forwards** — the literal allowlist in `server/rights.js`.
3. **What the games read** — `grep -ohE "word\.[a-z_]+"` over each component,
   not recollection.

## Status key

| Status      | Meaning                                                                    |
| :---------- | :------------------------------------------------------------------------- |
| **used**    | Reaches a game and changes what a player sees or does                      |
| **ignored** | Arrives at the browser and nothing reads it                                |
| **dropped** | The BFF forwards it, the adapter discarded it before any game could see it |
| **empty**   | Forwarded and mapped, but 0% populated in the sampled corpus               |
| **n/a**     | Correctly not used — internal, or no pedagogical role                      |

## The matrix

Fill rates are of 488 sampled entries. "Before" is `origin/main` at `285c999`;
"after" is this PR.

| Dictionary field                                                            | Fill rate | BFF forwards | Adapter name           | Before      | After       | Where it is used now                                                |
| :-------------------------------------------------------------------------- | --------: | :----------: | :--------------------- | :---------- | :---------- | :------------------------------------------------------------------ |
| `entry_id`                                                                  |      100% |      ✓       | `uuid`                 | **used**    | **used**    | Settlement id for `game.result`; every game                         |
| `header_word`                                                               |      100% |      ✓       | `headword`             | **used**    | **used**    | The prompt; all six games                                           |
| `difficulty`                                                                |     73.6% |      ✓       | `difficulty`           | **dropped** | **used**    | **The primary difficulty signal** — `src/difficulty.js`             |
| `english_definition`                                                        |     62.3% |      ✓       | `english_definition`   | **dropped** | **used**    | Answer panel; difficulty scoring                                    |
| `french_definition`                                                         |     53.3% |      ✓       | `french_definition`    | **dropped** | **ignored** | Carried, awaiting a French UI                                       |
| `english_lemma`                                                             |     97.7% |      ✓       | `translation_en`       | **used**    | **used**    | Prompt and answer panel; five games                                 |
| `french_lemma`                                                              |     64.5% |      ✓       | `translation_fr`       | **used**    | **used**    | Same, when the UI is French                                         |
| `ipa_pronunciation`                                                         |     98.2% |      ✓       | `ipa`                  | **used**    | **used**    | Answer panel; `ListenWrite`, `MeaningMatch`, `DomainFlash`          |
| `phonetic_pronunciation`                                                    |     98.2% |      ✓       | `phonetic`             | **ignored** | **ignored** | Mapped, unread — a plainer pronunciation cue than IPA               |
| `domain_code`                                                               |     62.1% |      ✓       | `domain`               | **used**    | **used**    | Semantic-domain badge; `ArrangeWord`, `MeaningMatch`, `DomainFlash` |
| `example`                                                                   |     53.1% |      ✓       | `example_sentences`    | **used**    | **used**    | `CompleteSentence` needs it; answer panel shows it                  |
| `part_of_speech`                                                            |      100% |      ✓       | `part_of_speech`       | **ignored** | **ignored** | Mapped, unread — word class                                         |
| `letter`                                                                    |      100% |      ✓       | `letter`               | **dropped** | **ignored** | Now carried; the obvious first-letter hint                          |
| `concept_id`                                                                |     97.7% |      ✓       | `concept_id`           | **dropped** | **ignored** | Now carried; 12 sampled concepts have >1 entry — real synonyms      |
| `normalized_headword`                                                       |      100% |      ✓       | `normalized_headword`  | **dropped** | **ignored** | Now carried; the NFC form to compare against                        |
| `audio_url`                                                                 |    **0%** |      ✓       | `audio_url`            | **empty**   | **empty**   | `ListenWrite` REQUIRES it — see the blocker below                   |
| `definition`                                                                |    **0%** |      ✓       | `definition`           | **empty**   | **empty**   | AIWA-elicited; the only definition the adapter used to map          |
| `alternative_spelling`                                                      |    **0%** |      ✓       | `alternative_spelling` | **dropped** | **ignored** | Now carried; a spelling game must accept these if populated         |
| `ajami_form`                                                                |    **0%** |      ✓       | `ajami_form`           | **dropped** | **ignored** | Now carried; Arabic-script Mandinka                                 |
| `header_word_root`                                                          |      0.2% |      ✓       | `header_word_root`     | **dropped** | **ignored** | Now carried; morphological root                                     |
| `pack.level`                                                                |         — |      ✓       | —                      | **ignored** | **ignored** | Pack-level; the `level=` request filter, not per-word               |
| `pack.corpus_version`, `release_id`, `signature`, `generated_at`, `pack_id` |         — |      ✓       | —                      | **n/a**     | **n/a**     | Provenance, correctly not gameplay data                             |

**Nothing is "missing from response".** Every field in `GamePackWord` arrives.
The problem was never the API.

## Per-game usage

Read from source, after this PR.

| Field                               |    Arrange    | LetterReveal  | CompleteSentence |  ListenWrite  | MeaningMatch  |  DomainFlash  | Answer panel |
| :---------------------------------- | :-----------: | :-----------: | :--------------: | :-----------: | :-----------: | :-----------: | :----------: |
| `headword`                          |       ✓       |       ✓       |        ✓         |       ✓       |       ✓       |       ✓       |      ✓       |
| `uuid`                              |       ✓       |       ✓       |        ✓         |       ✓       |       ✓       |       ✓       |      —       |
| `translation_en/fr`                 |       ✓       |       ✓       |        —         |       —       |       ✓       |       ✓       |      ✓       |
| `domain`                            |       ✓       |       —       |        —         |       —       |       ✓       |       ✓       |      —       |
| `ipa`                               |       —       |       —       |        —         |       ✓       |       ✓       |       ✓       |      ✓       |
| `audio_url`                         |       —       |       —       |        —         | **required**  |       —       |       ✓       |      ✓       |
| `example_sentences`                 |       —       |       —       |   **required**   |       —       |       —       |       —       |      ✓       |
| `definition` / `english_definition` |       —       |       —       |        —         |       —       |       —       |       —       |      ✓       |
| `difficulty`                        | via selection | via selection |  via selection   | via selection | via selection | via selection |      —       |

`difficulty` is consumed once, in `selectForLevel`, rather than in six places —
which is why it appears as "via selection" rather than per-game.

## Two findings that need a decision outside this repository

### 1 · `ListenWrite` has no data at all in production

Zero of 488 sampled entries carry a recording. `ListenWrite` filters its deck to
words with audio, so its deck is empty and the game shows its "no recordings"
state — every time, for every player.

This was worth resolving rather than reporting as ambiguous, so it was tested.
The BFF passes `audio_verified` through to the Dictionary, and `GameShell` sets
it only for `listen_write`, so the samples above (taken without it) could in
principle have been hiding recordings behind that filter. They were not:

```
GET /api/dictionary/game-set?language=mnk&limit=50&audio_verified=true
  → 0 words returned

GET /api/dictionary/game-set?language=mnk&limit=50
  → 50 words returned, 0 with audio
```

**There are no consented Mandinka recordings in the corpus.** So:

- `ListenWrite` is currently **unplayable** — not broken, but empty. It is
  offered on the setup screen and cannot start.
- `DomainFlash` and the answer panel lose their pronunciation audio, and
  degrade to text as designed.
- The `audio_verified` request filter works correctly and has nothing to select.

**This is a content question, not a code one**, and it is AIWA's and the
Dictionary owners'. Two things follow that are worth deciding deliberately:
whether `ListenWrite` should be hidden from the setup screen until recordings
exist (it currently offers a game that cannot run), and whether Mandinka
recording collection is scheduled. Neither is decided here.

Recording collection is also exactly what RLC's writing/speech surface exists
to do — and that surface is unmounted in release 1. So the two halves of this
platform's plan are visible in one measurement.

### 2 · `definition` is empty and `english_definition` is not

The AIWA-elicited `definition` is 0% populated; the source-derived
`english_definition` is 62.3%. The adapter mapped only the former. That is now
fixed on the client side, but the underlying question — whether AIWA intends to
populate `definition`, and whether an English source definition is the right
thing to show a Mandinka learner at all — is **AIWA's**, not ours.

## Fields available but still ignored, and why

Recorded rather than quietly left, so the next piece of work starts from a list:

| Field                    | What it could do                                                                                                         | Why not now                                                                           |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| `phonetic_pronunciation` | A plainer pronunciation cue than IPA (`m-o-ohs-o-ohk-eh-ehb-ah-ah`) — arguably more use to a learner than `/musukeːbaː/` | Which to show is a pedagogical choice, and AIWA's                                     |
| `part_of_speech`         | Better `MeaningMatch` distractors (match a noun with nouns); a grammar-aware game                                        | Distractor quality is a design change, not a repair                                   |
| `concept_id`             | Real synonyms rather than random distractors — 12 sampled concepts carry more than one entry                             | Same                                                                                  |
| `letter`                 | A first-letter hint, and alphabet navigation                                                                             | The hint ladder already escalates by unit; adding a second axis needs design          |
| `normalized_headword`    | The canonical comparison form                                                                                            | The client already normalises with NFC itself; using this would be belt-and-braces    |
| `alternative_spelling`   | A spelling game must ACCEPT these as correct, or it marks right answers wrong                                            | 0% populated, so nothing to accept yet. **Wire it before it is populated**, not after |
| `ajami_form`             | Arabic-script Mandinka — a whole second orthography                                                                      | 0% populated. A real product decision, not a field to switch on                       |
| `header_word_root`       | Morphology-aware difficulty and word families                                                                            | 0.2% populated                                                                        |
| `french_definition`      | The French UI                                                                                                            | Carried; the French surface is not built                                              |

`alternative_spelling` is the one worth flagging as a latent bug: the moment it
is populated, every spelling game will mark a valid alternative spelling wrong,
because nothing consults it. It is carried now so that fix is a small one.
