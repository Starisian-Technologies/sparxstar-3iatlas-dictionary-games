# Six-game functional and pedagogical audit

Audited **2026-09-04** against `origin/main` at `285c999`, before any change in
this PR. Every finding was read out of the code and, where it concerns the
corpus, measured with `scripts/analyze-orthography.mjs` against 488 real
Mandinka entries pulled from the deployed games BFF.

## The headline

**The games tested whether a player already knew a word. They did not teach an
unfamiliar one.** Six games gave six different answers to "what happens when I
get it wrong", three of those answers were wrong, and one game had no answer at
all.

## Functional audit

| Game                 | Attempts before resolving       |      Hint      | Skip | Answer shown | Continue gate | XP sent                              | Outcome on failure |
| :------------------- | :------------------------------ | :------------: | :--: | :----------: | :-----------: | :----------------------------------- | :----------------- |
| **ArrangeWord**      | **unbounded — no failure path** |  static only   |  ✗   |      ✗       |  ✗ (1200ms)   | `5` always, `attempts` hardcoded `1` | **never reported** |
| **CompleteSentence** | 3                               | partial reveal |  ✗   |      ✓       |  ✗ (2000ms)   | `8` / `0`                            | `learning`         |
| **ListenWrite**      | 3                               | partial reveal |  ✗   |      ✓       |  ✗ (2000ms)   | `10` / `0`                           | `learning`         |
| **LetterReveal**     | 5 wrong letters                 |       ✗        |  ✗   |      ✓       |  ✗ (1800ms)   | `5` / `0`, `attempts` hardcoded `1`  | `learning`         |
| **MeaningMatch**     | 1                               |       ✗        |  ✗   |      ✓       |  ✗ (1500ms)   | `5` / `0`                            | `learning`         |
| **DomainFlash**      | 1 (self-rated)                  |      n/a       |  ✗   |      ✓       | ✗ (immediate) | `5` / `0`                            | `learning`         |

### F1 — `ArrangeWord` could trap a player permanently · severity: highest

A wrong arrangement shook the tiles, returned them to the pool, and waited.
There was no attempt counter, no hint escalation, no Skip, no reveal, and — the
part that made it unrecoverable — **no `onResult` call for anything but
success.** So:

- the round could not advance past a word the player could not spell;
- the word was never recorded, so it never entered the review queue;
- the session could never reach its summary.

The only escape was to leave the game entirely and lose the session.

### F2 — every game paid for failure, and hid it · severity: high

All six reported the outcome `learning` when the player failed. The RLC engine's
`dictionaryQuizManifest` (NODE-ADR-009) scores `learning` at **+5 XP** and
ignores any client-supplied number. Each game passed a local `xp` of `0`
alongside.

So a player who never got the word right was **paid five points in the reward
ledger while the screen showed zero.** The local display and the server ledger
disagreed on every failed word, and the ledger was the generous one. Nothing
caught it because the client's `xp` argument is what the UI shows and the
`outcome` is what the engine settles, and no test compared them.

### F3 — XP was inconsistent between games and wrong everywhere · severity: high

`5`, `8`, `10` for a correct answer depending on which game you played, none of
them derived from the approved table, and all displayed to the player as the
score. `CompleteSentence` and `ListenWrite` paid full credit however many
attempts it took, so a player who needed all three got the same as one who knew
it outright.

### F4 — `attempts` was hardcoded in three games · severity: medium

`ArrangeWord` and `LetterReveal` sent `1` regardless; `CompleteSentence` and
`ListenWrite` sent a literal `3` on failure. The engine stores `attempts`
per question for analysis, so the analysis was reading fiction.

### F5 — nothing waited for the player · severity: medium

Every game auto-advanced on a timer between 1200ms and 2000ms. The answer,
translation and audio appeared and were taken away before they could be read —
which is the opposite of what feedback is for.

### F6 — the review queue dropped the words that most needed reviewing · severity: high

`GameShell.handlePracticeMissed` filtered `outcome === 'learning'` only. A word
answered outright wrong never came back, and neither did a skipped one.

### F7 — no escape at the question level · severity: high

No game had a Skip. `LetterReveal`'s only exit was five wrong guesses, and
`ArrangeWord` had none at all.

## Pedagogical audit

Against the six properties the brief asks each game to provide.

| Game             | Repetition in varied contexts | Increasing difficulty | Recognition before production | Sense of progress | Player control | Verdict                    |
| :--------------- | :---------------------------: | :-------------------: | :---------------------------: | :---------------: | :------------: | :------------------------- |
| ArrangeWord      |          queue only           |           ✗           |               ✗               |     bar + XP      |    **none**    | trapped players            |
| CompleteSentence |          queue only           |      within word      |               ✗               |     bar + XP      |      none      | closest to right           |
| ListenWrite      |          queue only           |      within word      |               ✗               |     bar + XP      |      none      | closest to right           |
| LetterReveal     |          queue only           |           ✗           |               ✗               |     bar + XP      |      none      | dead keyboard row          |
| MeaningMatch     |          queue only           |           ✗           |             **✓**             |     bar + XP      |      none      | single shot                |
| DomainFlash      |          queue only           |           ✗           |             **✓**             |     bar + XP      |   self-paced   | sound shape, wrong scoring |

**Recognition before production** was the one property already partly present:
`MeaningMatch` and `DomainFlash` ask the player to recognise a word, the other
four ask them to produce it. Nothing sequenced them, though — a player could
start with production on words they had never met.

**Increasing difficulty** existed nowhere. It remains deferred rather than
invented; see `docs/research-decisions.md` D1 for why guessing at a difficulty
curve and calling it research-grounded would misrepresent both papers.

## Low-resource-language audit

This is where the most consequential findings are, because every one of them was
an assumption about Mandinka that the approved data contradicts.

### L1 — a fabricated character inventory · severity: high

`LetterReveal` shipped:

```js
const MANDINKA_CHARS = ['ŋ', 'ɓ', 'ɗ', 'ñ', 'ɲ', 'ʔ'];
```

Measured over 488 real entries: **every one of those six characters occurs zero
times.** The row was six permanent buttons that could never be a correct answer,
taking space on a phone screen from a keyboard the player does need.

The same file hardcoded `'abcdefghijklmnopqrstuvwxyz'`. Measured, `v`, `x` and
`z` never occur either; `q` is 0.10% and `g` is 0.03%, at or below the ≤0.2%
elimination threshold Mattiev et al. apply.

Nobody had checked. That is the governance failure underneath the technical one:
a claim about someone's writing system was compiled into a product.

### L2 — orthographic units split apart · severity: high

`ArrangeWord` built its tile pool with `headword.split('')` and `LetterReveal`
segmented with the same call. Measured frequency of the units this breaks:

| Unit | Occurrences | Headwords containing it |
| :--- | ----------: | ----------------------: |
| `oo` |         179 |               **34.8%** |
| `aa` |         168 |               **29.6%** |
| `ee` |          53 |                   10.8% |
| `uu` |          30 |                    6.0% |
| `ii` |          28 |                    5.8% |
| `nj` |           7 |                    1.4% |
| `ny` |           3 |                    0.6% |

So `njemboo` was dealt as seven tiles — `n j e m b o o` — when the word is five
units, `nj e m b oo`. A third of the corpus was being taught with the wrong
shape. `split('')` also divides by UTF-16 code unit, which would cut a surrogate
pair in half.

### L3 — unplayable headwords reached the games · severity: high

1.0% of sampled headwords cannot be spelled at all, and every example below is
real data from the live corpus:

| Headword         | Problem                     |
| :--------------- | :-------------------------- |
| `0`              | one character, and a digit  |
| `00jo0`          | digits                      |
| `toolee. - 126-` | digits, punctuation, spaces |
| `suno tey`       | a phrase, not a word        |

Dealt to `ArrangeWord`, `0` is a single tile the player cannot get wrong;
`toolee. - 126-` is fourteen tiles including digits and a full stop. Combined
with F1, an unplayable word in `ArrangeWord` **ended the session** — unwinnable
and inescapable at once.

Sampled headwords also run to **17 units** (`seneyandirano`,
`cuuraayi-dandino`). A 17-tile scramble on a phone is not a game.

### L4 — the paper's cube counts do not transfer · severity: informational, but decisive

Asked of this corpus, the paper's own question: eight tiles covers **37.9%** of
sampled words against the **89.5%** average it reports for its twelve datasets.
Only 64.0% of headwords fall in the 3–7 range it studied at all. Full table and
reasoning in `docs/research-decisions.md` M7.

## Mobile audit

| Finding                                        | Detail                                                                                                                                                                                 |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tap targets below the comfortable minimum      | `ArrangeWord` tiles and `LetterReveal` keys were `w-10 h-10` / `w-9 h-10` — 36–40px against a 44px minimum. And a tile now holds a _unit_, so `oo` and `nj` need the width regardless. |
| `uppercase` on letter tiles                    | Changes the glyph the player is being asked to match, and not every orthography has a case pair.                                                                                       |
| Long feedback could push the action off-screen | No scroll containment around the answer area.                                                                                                                                          |
| No focus management                            | Nothing moved focus to the next action, so a keyboard or screen-reader player had to hunt for it.                                                                                      |

## What this PR changes, and what it does not

**Fixed:** F1–F7, L1–L3, and the mobile findings above.

**Not fixed, deliberately, with the reason recorded rather than left implicit:**

- **Increasing difficulty within a session** (D1) — needs the telemetry this PR
  only begins collecting. Inventing a curve now would be guesswork presented as
  pedagogy.
- **Images in feedback** (D4) — the projection publishes no image field, and
  fabricating one is forbidden. Needs a Dictionary-side decision.
- **Recognition-before-production sequencing** — the games are independent
  choices today. Ordering them is a product decision, not a repair.
- **Whether `nj` and `ny` are single letters** (D5) — attested in the data,
  protected in segmentation, deliberately not offered as keys. **AIWA's
  decision**, and the one finding in this document that this repository should
  not settle on its own.
- **Localisation** — the games are English-only. Separate work.
- **Whether these six mechanics suit Mandinka learners at all** — the deepest
  question here, and not a code question.
