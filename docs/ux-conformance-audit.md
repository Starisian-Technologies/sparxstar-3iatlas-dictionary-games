# Dictionary Games — UX and Progression Conformance Audit

> ## Status: core progression implemented; remaining requirements open or blocked
>
> Not "all fixed". The navigation repair, the hint data path, the literacy
> progression engine, the controlled question mix and the per-game help are
> implemented and tested. Stars, badges and mockup conformity are **blocked**;
> reconciliation against the research source is **open** because the book was
> never supplied. The three sections below say which is which, and nothing is
> claimed as done that is not.

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

## The reward-ownership finding — CORRECTED

**An earlier revision of this document was wrong, and the correction matters
more than the original claim.**

It said WordPress/myCred owns points, stars and badges, citing RLC spec v4.0
§1.6 verbatim:

> AIWA fires hooks to myCred. myCred handles all reward logic — points, stars,
> badges, display, redemption… XP, Gold, stars, and badges are all myCred
> entities.

That quotation is accurate — the sentence is really in that file. The
**conclusion drawn from it was not**, because it conflicts with the locked
Node-only product boundary. The owner's ruling:

> The RLC engine is authoritative for XP and its ledger. The games client may
> display reward results but must not invent authoritative awards. **Do not add
> WordPress or myCred to Dictionary Games.**

So the operative architecture is:

| Concern                    | Owner                                                 |
| -------------------------- | ----------------------------------------------------- |
| XP and its ledger          | **RLC engine** (Node), authoritative                  |
| Stars, badges              | To be defined in a server-authoritative Node contract |
| Displaying settled results | Dictionary Games client                               |
| Inventing an award         | Nobody, and never this client                         |

**A spec correction is owed elsewhere.** RLC spec v4.0 §1.6 still names myCred
as the owner of reward logic. Under "one home per fact", that section now
contradicts the Node-only boundary and should be corrected in the engine repo —
this document must not become a second, competing home for the ruling. Flagged
here rather than edited there, because that file is outside this PR.

What is unchanged is the _practical_ conclusion, and it is the reason no star
or badge code appears in this branch: the engine's `dictionaryQuizManifest`
carries `scoring_xp` and **no `stars` / `star_xp`**, while the classroom `rwc`
and `rsc` manifests do carry them. Whoever owns the reward, this client is not
where it is computed. Before stars or badges are implemented:

1. Verify their canonical Node/RLC ownership.
2. Define the star formula and badge inventory in an approved specification.
3. Add them to the server-authoritative contract.
4. Render settled results in the client.

## Status of every finding

Split by state, because an audit that still describes corrected code as "current
implementation" misleads the next reader. **Before** is what shipped; **Now** is
the state on this branch.

### Implemented and verified in this branch

Each has a test that fails when the fix is reverted — checked, not assumed.

| Defect (before)                                       | Now                                                 | Proof                                    |
| ----------------------------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| No exit of any kind once a round started              | `GameNav` in every phase                            | Removing `{nav}` fails 2 tests           |
| Summary's only non-play exit called an empty function | Three real exits; Browse only with a real handler   | `navigation.escape`, `GameShell.escape`  |
| First Hint press was a no-op in Challenge mode        | Requested hints always raise help                   | Old expression fails the Challenge tests |
| DomainFlash had no Skip                               | Skip records `skipped`                              | `games.notrapped`                        |
| Adaptation was invisible                              | Decision shown on the summary                       | `navigation.escape`                      |
| Scoreboard reported 3 of 5 categories                 | Every outcome, plus review and answered             | `navigation.escape`                      |
| No fanfare, nothing to gate on reduced motion         | Bounded, reduced-motion-aware confetti              | `celebration`                            |
| Exit died when IndexedDB deletion failed              | Navigation first, cleanup best-effort               | Reverting the ordering fails 2 tests     |
| Leave/restart could resurrect a deleted session       | Pending write awaited; resume suppressed            | `GameShell.escape`                       |
| Leave during loading raced initialisation             | Run token re-checked after each await               | `GameShell.escape`                       |
| Skipped-only rounds could not be practised            | Gated on `needsReview`                              | `navigation.escape`                      |
| Leave dialog was a keyboard trap                      | Focus in, Escape out, focus restored                | `navigation.escape`                      |
| `LEVEL_PROFILE.maxUnits` declared, read by nothing    | Enforced in `selectForLevel`                        | `difficulty`                             |
| `hintsUsed` never left the games                      | Carried to adaptation and literacy                  | `difficulty`, integration test           |
| No literacy progression at all                        | `src/literacy.js`; band drives selection            | `literacy`                               |
| Window slide, no controlled mix                       | 60/25/15 pools, deterministic fallback              | `difficulty`                             |
| "Applies from the next question" was half false       | Says what actually happens                          | —                                        |
| Hint existed in 1 of 6 games                          | Interactive Hint in both written-spelling games too | `pedagogy`                               |

### Still open

| Item                                                | Why                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Per-game pedagogy records                           | Learning objective, prior knowledge, scaffolding and feedback sequence, mastery requirement, teacher role — one record per game. |
| Pilot instrumentation                               | Events exist; not every pilot question is answerable from them yet.                                                              |
| Research-to-requirement table in the canonical spec | Belongs in `dictionary-games-tech-spec.md`, not here.                                                                            |

### Blocked, pending a decision

| Item            | Blocker                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stars           | No canonical formula. Ownership now ruled Node/RLC; the contract does not yet carry it.                                                                                                                      |
| Badges          | No inventory and no thresholds, in any repo.                                                                                                                                                                 |
| Mockup fidelity | No mockups exist in any reachable repo. Requested from the owner.                                                                                                                                            |
| The book        | _Digital Games and Language Learning_ was not supplied to this repository and has **not** been read here. Every rule implemented comes from the brief's enumeration of it — a specification, not a citation. |

## Open questions requiring a decision

1. **Star formula.** No canonical rule exists. Per the brief I am not inventing
   one. The architectural question comes first: should stars come from the
   engine manifest (consistent with §1.6 and with `rwc`/`rsc`) or be computed
   client-side (faster, but puts reward logic where §1.6 forbids it)?
2. **Badge inventory and thresholds.** None exists. The brief lists candidate
   milestones; they need to become a canonical list with owners before code.
3. **Approved UI mockups.** Not in any repo reachable here. Sections 1 and 8
   cannot be completed without them.
