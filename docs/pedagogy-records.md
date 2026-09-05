# Per-game pedagogy records

> **Source note.** _Digital Games and Language Learning: Theory, Development and
> Implementation_ has **not** been read in this repository — it was never
> supplied here. Every rule below comes from the corrective brief's enumeration
> of it, which is a specification, not a citation. Where a value is a product
> decision rather than a finding, it says so. Reconciling these records against
> the book itself is an open task, listed at the end.

A technically working game is not finished until its teaching sequence is
written down. These are those sequences, one per game, in the order the brief
requires: objective, skill, prior knowledge, fields used, scaffolding, feedback,
mastery, reward, review, teacher role, and surrounding activity.

Two things are common to all six and are stated once here rather than repeated:

- **Freedom to fail.** No negative XP, ever. No level, label or message
  describes a player as weak, failing or a beginner. Retry, help, Skip and
  reveal are available in every game and in every mode.
- **Reward is not progression.** XP is effort and performance; the literacy band
  is demonstrated skill. Accumulated XP never promotes a learner — see
  `src/literacy.js`.

---

## 1. Arrange the Word — `arrange_word`

|                          |                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objective**            | Produce a known word's written form by ordering its orthographic units.                                                                                                                                                                         |
| **Skill**                | Spelling (production).                                                                                                                                                                                                                          |
| **Prior knowledge**      | Recognises the word by meaning; can identify units as wholes.                                                                                                                                                                                   |
| **Dictionary fields**    | `header_word`, `english_lemma`/`french_lemma`, `domain_code`, `difficulty`, `ipa_pronunciation`.                                                                                                                                                |
| **Scaffolding**          | 1. Meaning and domain shown beside the tiles. 2. Wrong arrangement shakes and returns the tiles, not the attempt. 3. Hint fixes leading units in place, one per press, capped one short of the word. 4. Reveal on the final attempt or on Skip. |
| **Feedback**             | Immediate. Correct → points animation and `AnswerReveal`. Wrong → shake, attempt counter decrements, tiles returned.                                                                                                                            |
| **Mastery**              | First attempt, no hints. Anything else is `learning`.                                                                                                                                                                                           |
| **Reward**               | `+10` first-attempt, `+5` after retry or help, `0` wrong or skipped. Once per unique question per run.                                                                                                                                          |
| **Review**               | `learning`, `incorrect` and `skipped` all return via `needsReview`.                                                                                                                                                                             |
| **Teacher role (later)** | Assign a domain; watch which units are transposed — a class-wide pattern is an orthography teaching point, not six individual mistakes.                                                                                                         |
| **Before / after**       | Before: meet the word in `DomainFlash` or `MeaningMatch`. After: write it unaided in `ListenWrite`.                                                                                                                                             |

## 2. Complete the Sentence — `complete_sentence`

|                          |                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objective**            | Produce a word from sentence context, so spelling is practised in use rather than in isolation.                                                                                                                                                                                             |
| **Skill**                | Spelling in context.                                                                                                                                                                                                                                                                        |
| **Prior knowledge**      | Can read the surrounding sentence; knows the word's meaning.                                                                                                                                                                                                                                |
| **Dictionary fields**    | `example.sentence` (**required** — a word with no example is not dealt), `header_word`, `english_lemma`, `difficulty`.                                                                                                                                                                      |
| **Scaffolding**          | 1. Sentence with the word blanked; meaning shown. 2. Wrong attempt reveals the next unit automatically. 3. Hint reveals a further unit on request. 4. Full reveal on the third attempt or Skip. Challenge holds the automatic reveal back one attempt but never withholds a requested hint. |
| **Feedback**             | Immediate, and instructional: the revealed prefix shows the shape of the word, by orthographic unit, never by character.                                                                                                                                                                    |
| **Mastery**              | First attempt with no revealed units and no hints.                                                                                                                                                                                                                                          |
| **Reward**               | As above. A hinted correct answer is `learning`.                                                                                                                                                                                                                                            |
| **Review**               | As above.                                                                                                                                                                                                                                                                                   |
| **Teacher role (later)** | Choose the domain so sentences match the lesson's topic.                                                                                                                                                                                                                                    |
| **Before / after**       | Before: `MeaningMatch` on the same domain. After: use the word in the learner's own sentence.                                                                                                                                                                                               |

## 3. Listen and Write — `listen_write`

|                          |                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objective**            | Map heard speech to written form.                                                                                                                                                                 |
| **Skill**                | Listening → spelling.                                                                                                                                                                             |
| **Prior knowledge**      | None beyond the alphabet; this game suits a fluent speaker beginning to read.                                                                                                                     |
| **Dictionary fields**    | `audio_url` (**required**), `header_word`, `english_lemma`, `ipa_pronunciation`.                                                                                                                  |
| **Scaffolding**          | 1. Audio, replayable without limit and without cost. 2. Meaning shown. 3. Wrong attempt reveals the next unit. 4. Hint reveals a further unit on request. 5. Reveal on the third attempt or Skip. |
| **Feedback**             | Immediate; the answer panel plays the audio again beside the written form, so the pairing is made explicit rather than left to be inferred.                                                       |
| **Mastery**              | First attempt, unaided.                                                                                                                                                                           |
| **Reward**               | As above.                                                                                                                                                                                         |
| **Review**               | As above.                                                                                                                                                                                         |
| **Teacher role (later)** | Read aloud for the class where a recording is missing — see the open issue below.                                                                                                                 |
| **Before / after**       | Before: hear the word in `DomainFlash`. After: use it aloud.                                                                                                                                      |
| **⚠ Blocked**            | Measured: `audio_verified = true` returns **zero** Mandinka words. Until recordings exist this game cannot be dealt any content at all.                                                           |

## 4. Letter Reveal — `letter_reveal`

|                          |                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Objective**            | Recover a word from partial orthographic information.                                                                                                                          |
| **Skill**                | Spelling (recognition-assisted production).                                                                                                                                    |
| **Prior knowledge**      | Knows the word; recognises units in isolation.                                                                                                                                 |
| **Dictionary fields**    | `header_word`, `english_lemma`, `ipa_pronunciation`, `example.sentence`, `letter`.                                                                                             |
| **Scaffolding**          | Revealing letters **is** the mechanic, so help is deliberately elsewhere: pronunciation, then meaning, then an example. A letter hint here would play the game for the player. |
| **Feedback**             | Each guess resolves immediately — the unit appears in place, or the wrong-guess count moves.                                                                                   |
| **Mastery**              | Solved with no hints taken.                                                                                                                                                    |
| **Reward**               | As above.                                                                                                                                                                      |
| **Review**               | As above.                                                                                                                                                                      |
| **Teacher role (later)** | Use as a whole-class warm-up on a shared screen.                                                                                                                               |
| **Before / after**       | Before: `ArrangeWord` on the same set. After: `CompleteSentence`.                                                                                                              |

## 5. Meaning Match — `meaning_match`

|                          |                                                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objective**            | Attach meaning to a written form.                                                                                                                                                                                                            |
| **Skill**                | Meaning recognition. **Never promotes the spelling band.**                                                                                                                                                                                   |
| **Prior knowledge**      | Can read the headword.                                                                                                                                                                                                                       |
| **Dictionary fields**    | `english_lemma`/`french_lemma`, `domain_code` (distractor quality), `concept_id` (synonym detection), `part_of_speech`, `example.sentence`.                                                                                                  |
| **Scaffolding**          | 1. Three options, distractors preferred from the same domain. 2. A wrong pick eliminates that option and the question continues. 3. Hint narrows without answering: domain, then word class, then an example, then one wrong option removed. |
| **Feedback**             | Immediate. Eliminated options are struck through and disabled, so the player sees what was ruled out.                                                                                                                                        |
| **Mastery**              | First pick, no hints.                                                                                                                                                                                                                        |
| **Reward**               | As above.                                                                                                                                                                                                                                    |
| **Review**               | As above.                                                                                                                                                                                                                                    |
| **Teacher role (later)** | Review which domains produce the most confusion.                                                                                                                                                                                             |
| **Before / after**       | Before: `DomainFlash`. After: a spelling game on the same words.                                                                                                                                                                             |

## 6. Domain Flash — `domain_flash`

|                          |                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Objective**            | Meet unfamiliar words and judge honestly what is already known.                                                                           |
| **Skill**                | Recognition. **Never promotes the spelling band.**                                                                                        |
| **Prior knowledge**      | None. This is the entry point.                                                                                                            |
| **Dictionary fields**    | `header_word`, `english_lemma`, `ipa_pronunciation`, `audio_url`, `example.sentence`, `header_word_root`, `domain_code`.                  |
| **Scaffolding**          | Self-graded, so help exists to make the self-judgement honest rather than to earn a mark: pronunciation, meaning, example, then the root. |
| **Feedback**             | Immediate on flip. No judgement language either way.                                                                                      |
| **Mastery**              | Not a mastery game — it feeds the review queue and the word-familiarity signal.                                                           |
| **Reward**               | "I knew it" `+10`; "still learning" `0`; Skip `0`. Skipping records no judgement the player did not make.                                 |
| **Review**               | "Still learning" and skipped cards both return.                                                                                           |
| **Teacher role (later)** | Introduce a domain before the class plays a production game on it.                                                                        |
| **Before / after**       | Before: nothing. After: `MeaningMatch`, then a spelling game.                                                                             |

---

## Open against these records

1. **Teacher role is load-bearing, and provisional.** The reconciliation shows
   the source treats novice–expert interaction as part of the scaffolding
   mechanism, not an optional extra. These roles are a starting sketch and AIWA
   holds the authority over them.
2. **Storytelling is absent.** It is one of the four dynamics the source names
   and no game here has a narrative frame. A product judgement, not an
   oversight — but it should be made deliberately.
3. **`ListenWrite` has no content** for Mandinka until recordings exist.
4. **Teacher roles are provisional** — the classroom version is not built, and
   AIWA holds authority over the pedagogy, not this repository.
