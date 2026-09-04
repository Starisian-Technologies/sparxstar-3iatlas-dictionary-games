# Gameplay telemetry

What the games record, where it goes, and — the part that needed deciding —
what stays separate from what.

## Three separate concepts, deliberately not merged

| Concept                          | What it is                                                     | Where it lives                                                                 | Who settles it                                                            |
| :------------------------------- | :------------------------------------------------------------- | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **XP / rewards**                 | What a question paid                                           | The RLC engine's `reward_ledger`, via `game.result`                            | The **engine**, from `game_type` + `outcome`. The client cannot grant XP. |
| **Gameplay analytics**           | How the game was played — hints, retries, skips, missing media | The device's IndexedDB outbox, local-only                                      | Nobody. It is evidence for future design decisions.                       |
| **Linguistic-confidence voting** | Whether a word, spelling or recording is _right_               | RLC's collection surface (`token.vote`), which is **not mounted** in release 1 | AIWA and speaker communities                                              |

Keeping these apart is not tidiness. A player skipping a word is not a
statement that the word is wrong, and a wrong answer is not a vote against the
dictionary entry. Collapsing analytics into confidence voting would let
gameplay quietly edit the corpus, which is precisely what the platform's
separation of the content path exists to prevent.

## What is recorded

All of these are written to the local outbox by `useProgressSync.addEvent`.
Only `game_result` is ever sent anywhere.

| Event                        | When                                    | Carries                                                 | Sent to the engine? |
| :--------------------------- | :-------------------------------------- | :------------------------------------------------------ | :-----------------: |
| `game_session_started`       | A round begins                          | game, domain, word count                                |          ✗          |
| `game_question_shown`        | A word is presented                     | `word_uuid`, unit count                                 |          ✗          |
| `game_result`                | A question resolves                     | `run_id`, `word_uuid`, `outcome`, `attempts`, `time_ms` |        **✓**        |
| `game_retry_used`            | A wrong answer, round continues         | `word_uuid`                                             |          ✗          |
| `game_hint_used`             | The player asked for help               | `word_uuid`                                             |          ✗          |
| `game_skip_used`             | The player chose Skip                   | `word_uuid`                                             |          ✗          |
| `game_self_rated`            | A flashcard was self-rated              | `word_uuid`, `knew`                                     |          ✗          |
| `game_words_unplayable`      | The corpus offered words a game refused | count, reasons (no headwords)                           |          ✗          |
| `aiwa_game_session_complete` | A round ends                            | domain                                                  |          ✗          |
| `aiwa_game_*` (existing)     | Streaks, first practice, return visits  | `word_uuid`, game                                       |          ✗          |

`game_result` carries first-attempt-correct implicitly: `outcome: 'correct'`
means first attempt unaided, `'learning'` means a retry or a hint was involved.
The engine already stores `attempts` and `time_ms` per question alongside the
award and never as an input to it.

## Why these are privacy-appropriate

- **No free text.** No answer a player typed is recorded — not in
  `ListenWrite`, not in `CompleteSentence`. A wrong spelling can carry a name,
  a place, or anything else somebody typed into a box.
- **No identity.** Local events carry no account id. The account is established
  by the Identity token on the request, and only `game_result` makes a request.
- **No headwords in aggregate events.** `game_words_unplayable` reports counts
  and reasons, never the words — a list of what a corpus got wrong is a
  statement about the corpus, and that is not this client's to publish.
- **Local by default.** A signed-out player syncs nothing at all. Guest play and
  authenticated play are the same code path with and without a token.
- **Bounded.** The local log is a ring of the most recent 500 local-only
  events. It was previously unbounded — nothing drained events that are never
  sent — which on a small phone eventually fails the IndexedDB write that a
  reward needs. `trimLocalEvents` never drops a `game_result`.

## What would need a shared service to change, and does not happen here

The brief asked for any true contract blocker to be named rather than worked
around. There is one, and it is not blocking:

**Analytics have no destination.** Nothing outside the device can read
`game_hint_used`. Giving them one means either a new engine route or a new
service, and the engine's release-1 surface is deliberately three routes wide
(`account/:id/xp`, `account/:id/ledger`, `events/batch`) with the collection
surface unmounted. Adding an analytics intake is an engine decision with a
sovereignty dimension — where gameplay data lives, who can read it, how long it
is kept — and **it is not taken here.**

So this PR instruments the client and stops. The events exist, they are bounded,
they are recorded correctly, and when there is somewhere for them to go the data
will already be there. That is the sequence that does not require guessing.

**What is explicitly NOT adopted** is xAPI / LTI / a Learning Record Store,
which Godwin-Jones (2014) surveys and which exist to ship learner records to a
third-party LMS. See `docs/research-decisions.md` R1.
