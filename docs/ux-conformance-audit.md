# Dictionary Games — UX and Progression Conformance Audit

> Step 1 of the corrective brief. Every row was verified by reading the code at
> `d26a7e5` (`main`) or the cited spec file. Nothing here is recalled: each
> claim names the file and line that supports it, so a reviewer can disagree
> with the evidence rather than with me.

## What this audit could NOT compare against

The brief asks for comparison against **approved UI mockups** and a **canonical
star/badge specification**. Both were searched for and neither exists in any
repository this session can reach:

| Source the brief names    | Search performed                                                                            | Result                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Approved UI mockups       | `find` for `*mockup*`, `*mock*`, `*design*`, `*figma*`, `*wireframe*` across the games repo | Only `__mocks__/styleMock.cjs`, a Jest stub. **No mockups.**                                              |
| Canonical star formula    | `grep -i star` across games docs, RLC engine, RLC UI                                        | Stars are defined for `rwc`/`rsc` classroom modes only — see below. **Nothing for the dictionary games.** |
| Canonical badge inventory | `grep -i badge` across all five repos                                                       | Named in RLC spec §1.6/§2.1 as myCred's. **No inventory, no thresholds.**                                 |

Sections 8 (mockup fidelity) and the star/badge half of section 5 are therefore
**blocked pending input**, per the brief's own instruction to report the gap
rather than invent. Everything else proceeds.

## The reward-ownership finding

This is the most consequential result of the audit, because it says the brief's
section 5 cannot be implemented as written without a contract change.

`sparxstar-3iatlas-rlc-node-engine/.github/instructions/sparxstar-3iatlas-rlc-spec-v4.0.md`
§1.6, verbatim:

> AIWA fires hooks to myCred. myCred handles all reward logic — points, stars,
> badges, display, redemption, adult vs student rules, school configuration.
> AIWA does not implement reward logic, tiers, or redemption. That is myCred's
> job.
>
> XP, Gold, stars, and badges are all myCred entities. The backend fires the
> hook. Done.

And the engine's own manifests agree. `src/games/manifests.ts` gives the
classroom modes a star table:

```ts
stars: [ …, { kind: 'teacher', rule: 'teachers_star' } ],
star_xp: STAR_XP,
```

while the manifest the dictionary games actually settle against carries scoring
only — **no `stars`, no `star_xp`**:

```ts
export const dictionaryQuizManifest: GameResultManifest = {
    game_type: 'dictionary_quiz',
    scoring_xp: { correct: 10, learning: 5, incorrect: 0, skipped: 0 },
    question_scoped: true,
};
```

So stars are a real platform concept, defined **server-side per game manifest**,
and the dictionary quiz has none. Computing stars or badges inside this React
client would put reward logic in exactly the place §1.6 forbids, and would
compete with myCred rather than display it.

**Recommendation, for approval — not implemented:** add a `stars` array and
`star_xp` to `dictionaryQuizManifest` in the engine, and have the games _render_
what the engine returns. That keeps one home for the fact. The star rule itself
and the badge inventory are product decisions and are listed as open questions
at the end of this document.

## What the accompanying PR closes

Rows 1, 2, 3b, 4, 5 (visibility), 8, 11 and 12 are corrected in the same PR as
this document. Rows 9, 10 and 13 are blocked as described above and are
untouched — no star, badge, or mockup-derived behaviour was invented to make a
checklist look complete.

## Discrepancy table

| #   | Requirement                                | Specification source | Current implementation                                                                                                                                                                                                                                 | Production behaviour                                                                                                                                                                                                                        | Required correction                                                                       |
| --- | ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Player can leave a game at any point       | Brief §2             | `GameShell.jsx:716-751` — the in-play header renders Level buttons and an `Adaptive:` toggle and nothing else                                                                                                                                          | Trapped once a round starts                                                                                                                                                                                                                 | Persistent nav bar with `Games Home` + `Restart` in every state                           |
| 2   | Completion offers a real navigation choice | Brief §2             | `SessionComplete.jsx:77-110` — three actions: Practice missed, **Browse dictionary**, Play again                                                                                                                                                       | Trapped. The only non-play action calls `onBrowse` → `App.jsx:74-78` `handleBrowse`, **an empty function**. Its comment says "rather than render a dead control" — but the control renders unconditionally                                  | Replace with `Play Again` / `Choose Another Game` / `Games Home`; delete the dead control |
| 3   | Hint works in all six games                | Brief §3             | Only `ArrangeWord.jsx:207` calls `takeHint()`. `CompleteSentence`/`ListenWrite` render a passive "starts with…" line with no control; `DomainFlash`, `MeaningMatch`, `LetterReveal` have no hint                                                       | 1 of 6 games has a working Hint                                                                                                                                                                                                             | Shared Hint control; per-game hint content from real dictionary fields                    |
| 3b  | Hint responds on first press               | Brief §3             | `pedagogy.js:126-129` `hintLevelFor = max(0, attemptsUsed - offset)`, Challenge sets `offset = 1`; `currentHintLevel` adds `hintsUsed`                                                                                                                 | **In Challenge mode the first Hint press is a no-op**: `max(0, 0+0-1) = 0` and `max(0, 0+1-1) = 0`. Exactly the reported defect                                                                                                             | Make the first press always increase help                                                 |
| 4   | Skip works in all six games                | Brief §3             | `skip(attempt)` called only in `ArrangeWord` and `MeaningMatch`. `CompleteSentence`/`ListenWrite`/`LetterReveal` render Skip but bypass the shared transition, calling `xpFor(OUTCOME.SKIPPED)` directly. **`DomainFlash` has no Skip control at all** | Skip semantics differ per game; one game cannot skip                                                                                                                                                                                        | Route every Skip through `pedagogy.skip()`; add Skip to DomainFlash                       |
| 5   | Adaptation is observable                   | Brief §4             | Implemented and genuinely wired: `GameShell.jsx:599` `decideAdjustment` → `setOffsets` → `:403-407` `selectForLevel(..., offset)`                                                                                                                      | Invisible. `adjustNotice` renders **only in the playing phase** (`:752`) but is set immediately before `setPhase('complete')` (`:618`), so it is never on screen at the moment it is decided. No persistent level/offset indicator anywhere | Show the decision on the completion screen; add a diagnostics panel for test builds       |
| 6   | Dictionary level drives selection          | Brief §4             | `difficulty.js` `questionDifficulty` — CEFR band × 10 dominates                                                                                                                                                                                        | Correct — no competing classification                                                                                                                                                                                                       | None. Verified conformant                                                                 |
| 7   | XP is single-sourced                       | Brief §6             | All six games call `xpFor(outcome)`; `useGameSession.js:191` accumulates                                                                                                                                                                               | Correct                                                                                                                                                                                                                                     | None for XP itself                                                                        |
| 8   | Scoreboard reconciles all categories       | Brief §6             | `SessionComplete.jsx:24-27` reports only `correct`, `learning`, `xpEarned`                                                                                                                                                                             | Missing: incorrect, skipped, words sent to review, star and badge progress                                                                                                                                                                  | Full reconciliation + invariant tests                                                     |
| 9   | Stars                                      | Brief §5             | None                                                                                                                                                                                                                                                   | Absent                                                                                                                                                                                                                                      | **BLOCKED** — see reward-ownership finding                                                |
| 10  | Badges                                     | Brief §5             | None                                                                                                                                                                                                                                                   | Absent                                                                                                                                                                                                                                      | **BLOCKED** — no canonical inventory exists                                               |
| 11  | Global navigation in header                | Brief §8             | `App.jsx:82-107` — title, screen name, sign-in/out                                                                                                                                                                                                     | No global nav                                                                                                                                                                                                                               | Add nav                                                                                   |
| 12  | Completion fanfare                         | Brief §7             | `SessionComplete.jsx:32-39` — a static 🏆 emoji                                                                                                                                                                                                        | No animation at all, so nothing to gate on `prefers-reduced-motion`                                                                                                                                                                         | Add celebration honouring reduced motion                                                  |
| 13  | Mockup fidelity                            | Brief §8             | —                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                           | **BLOCKED** — no mockups exist to compare against                                         |

## Open questions requiring a decision

1. **Star formula.** No canonical rule exists. Per the brief I am not inventing
   one. The architectural question comes first: should stars come from the
   engine manifest (consistent with §1.6 and with `rwc`/`rsc`) or be computed
   client-side (faster, but puts reward logic where §1.6 forbids it)?
2. **Badge inventory and thresholds.** None exists. The brief lists candidate
   milestones; they need to become a canonical list with owners before code.
3. **Approved UI mockups.** Not in any repo reachable here. Sections 1 and 8
   cannot be completed without them.
