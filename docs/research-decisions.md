# Research-to-requirement decisions

Two papers were supplied as **requirements inputs** for the Dictionary Games
repair. This document records what was taken from each, what was deferred, what
was rejected, and — the part that matters most — **which requirements are ours
rather than theirs.**

1. **Godwin-Jones, R. (2014).** _Games in Language Learning: Opportunities and
   Challenges._ Language Learning & Technology 18(2), 9–19.
2. **Mattiev, J., Salaev, U., & Kavšek, B. (2025).** _Advanced Word Game Design
   Based on Statistics: A Cross-Linguistic Study with Extended Experiments._
   Big Data and Cognitive Computing 9(4), 103.

## What these papers are, and what they are not

Being accurate about this changes how much weight each finding can carry.

**Godwin-Jones (2014) is a survey column, not an experiment.** It reviews the
field and reports what studies had found by 2014. It is explicit about the limit
of its own generalisations, and the sentence is worth quoting because it governs
every row below:

> "These are by no means automatic or universal benefits—they depend on a large
> number of variables, including not only the nature and use of the game itself
> but also the presence or absence of game-related activities."

It also warns that studies in this area "suffer from particularism … or from
overgeneralization". So it can tell us **what shape** a learning game should
have. It cannot tell us that any specific mechanic will work, and it measures
nothing about our corpus.

**Mattiev et al. (2025) is an experiment, and a directly relevant one** — a
cubic matching-letter game for low-resource and morphologically complex
languages, evaluated on 12 datasets. Its method transfers to us. Its **numbers
do not**, and it never claims they do: they are results on its datasets, none of
which is a Mande language.

## Table 1 — Godwin-Jones (2014): pedagogical shape

| #   | Finding, as the paper states it                                                                                                                   | Decision                    | What we built, and where                                                                                                                                                   |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | "Players receive a constant stream of feedback in response to game events"                                                                        | **Adopted**                 | Every answer resolves to visible feedback, and every resolution shows the word with whatever the Dictionary supplies. `src/pedagogy.js`, `src/components/AnswerReveal.jsx` |
| G2  | "Responses to that feedback engage the player in repeating, revising, and/or reformulating"                                                       | **Adopted**                 | A wrong answer gives another attempt rather than ending the question. `recordAnswer`                                                                                       |
| G3  | "repeated actions in different contexts with increasing levels of difficulty"                                                                     | **Adopted in part**         | Repetition in varied contexts is implemented as the review queue plus six games over one word list. _Increasing difficulty within a session is **deferred**_ — see D1.     |
| G4  | "providing reinforcement of earlier introduced vocabulary"                                                                                        | **Adopted**                 | Missed words re-enter a review queue, now including outright-wrong answers, which the old queue dropped. `needsReview`                                                     |
| G5  | "a safe and inviting environment which provides enjoyment and a sense of accomplishment, as progress through the game is recognized and rewarded" | **Adopted**                 | Progress and XP are shown, no answer is punished, and no score can go negative.                                                                                            |
| G6  | "a powerful agent for learner autonomy"                                                                                                           | **Adopted**                 | Skip, reveal, replay, mode choice and exit are all the player's, at any time.                                                                                              |
| G7  | "the pedagogical intent is all too evident, sometimes interrupting the all-important 'game flow'"                                                 | **Adopted as a constraint** | Help is offered, never forced; the Continue gate appears only once a word is resolved, so it never interrupts play in progress.                                            |
| G8  | "user training is mandated if there are likely to be novice users"                                                                                | **Deferred**                | No onboarding built this round. Recorded as D2.                                                                                                                            |
| G9  | Rural-India study: phones loaned, batteries swollen by heat, families with no power negotiating to charge                                         | **Adopted as a constraint** | Reinforces the platform's own Africa-first rule: everything degrades without media, without network, and on a small screen.                                                |
| G10 | "gaming is not everyone's cup of tea and should make allowances for individual preferences", incl. gender differences in game-type preference     | **Adopted in part**         | Six game types remain, and the player picks. No preference modelling.                                                                                                      |
| G11 | Telemetry: xAPI/LTI, "one of the key advantages to using a self-developed game is the ability to track data"                                      | **Adopted, narrowly**       | Privacy-appropriate gameplay events only, local-first. **xAPI and LTI are rejected** — see R1.                                                                             |

### Where a requirement is ours, not the paper's

The brief asked for this to be explicit, and it matters for anyone auditing the
claim later.

| Requirement                                   | Status                                                                                                                                                                                                                                                                           |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Three attempts before the answer is shown** | **Ours.** Neither paper prescribes a retry count. The papers support _another attempt_ and _progressively stronger help_; the number 3 is a UX decision. `LetterReveal` keeps 5 wrong guesses because its mechanic is per-letter, and that divergence is documented in the file. |
| **In-game hints**                             | **Ours, informed by G1/G7.** Godwin-Jones observes players consulting _external_ sites "which give hints or help" — fan wikis, not a hint button. Building hints into the game is our inference from the feedback and flow findings, not a finding.                              |
| **A deliberate Continue action**              | **Ours.** The papers say feedback should be understandable; the requirement that a timer must not steal it is a UX decision. It replaces `setTimeout(advance, 1200)`.                                                                                                            |
| **The XP table (10 / 5 / 0 / 0)**             | **Neither.** It is the platform's own approved decision, already implemented and enforced in the RLC engine (NODE-ADR-009). The client's job is only to report the outcome truthfully and display the same number the ledger will hold.                                          |
| **Learn vs Challenge modes**                  | **Ours.** A reading of G6 (autonomy) and G7 (flow), not a finding.                                                                                                                                                                                                               |

## Table 2 — Mattiev et al. (2025): word-building for low-resource languages

| #   | Finding                                                                                                                                                                             | Decision                                                                                     | What we did                                                                                                                                                |
| :-- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Letter inventories must come from measured letter frequency in the target language, not from another language's alphabet                                                            | **Adopted**                                                                                  | `scripts/analyze-orthography.mjs` measures the real corpus. `src/orthography.js` carries the result. The hardcoded `a`–`z` is gone.                        |
| M2  | Character-level N-grams (unigram + bigram) are the right statistic; trigrams are counter-productive because they co-locate letters that need to be separable                        | **Adopted**                                                                                  | The analysis computes unigram and bigram frequency over **orthographic units**, and stops there for the reason the paper gives.                            |
| M3  | Digraphs and diacritics must be handled as single characters, or letter frequency is computed wrongly — the paper substitutes single characters for Uzbek `g'`/`o'` to achieve this | **Adopted, and it is the central fix**                                                       | `segmentUnits` is longest-match-first over measured units. `njemboo` is `nj·e·m·b·oo`, five units — not the seven characters `split('')` produced.         |
| M4  | Eliminate letters below a frequency threshold (≤0.2%) and give their space to frequent ones                                                                                         | **Adopted**                                                                                  | Applied in the analysis, and it is why `v`, `x`, `z`, `q`, `g` are not offered as keys for Mandinka.                                                       |
| M5  | Every letter of the alphabet should appear at least once so children meet the whole alphabet                                                                                        | **Rejected for these games**                                                                 | See R2.                                                                                                                                                    |
| M6  | Two or three vowels per cube, spread across cubes, because vowels are the most-used letters                                                                                         | **Deferred**                                                                                 | Only applies to a fixed-tile-set game, which we do not currently have. See D3.                                                                             |
| M7  | **8 cubes for 3–5-letter words; 9 cubes for 6–7-letter words** (89.5% and 79.7% average coverage over 12 datasets)                                                                  | **Treated as a comparison point, exactly as the brief requires — and the comparison failed** | See below. This is the most consequential row in the document.                                                                                             |
| M8  | Longer words and richer alphabets reduce coverage; agglutinative languages degrade further at 6–7 letters as affixes multiply                                                       | **Adopted as an expectation, and confirmed**                                                 | Our measured curve degrades the same way, and harder.                                                                                                      |
| M9  | A word is coverable only if each letter comes from a _different_ cube ("only one face of a cube can be used at a time")                                                             | **Adopted**                                                                                  | Coverage is computed by bipartite matching. A letter-presence check would have overstated it — it would call `oo` constructible from one tile bearing `o`. |

### M7 in detail: why we did not adopt 8 or 9

The brief said to treat the paper's cube counts as comparison points and to
determine our own from Mandinka data. We did. Measured on **488 real entries**
from the approved corpus (`scripts/analyze-orthography.mjs`):

| Units in word |   Words |   7 tiles |   8 tiles |   9 tiles |  10 tiles |  12 tiles |
| ------------: | ------: | --------: | --------: | --------: | --------: | --------: |
|             3 |      15 |     46.7% |    100.0% |    100.0% |    100.0% |    100.0% |
|             4 |     100 |     36.0% |     80.0% |     97.0% |     99.0% |     98.0% |
|             5 |      37 |     21.6% |     62.2% |     89.2% |     97.3% |     94.6% |
|             6 |     113 |      3.5% |     31.9% |     79.6% |     78.8% |     89.4% |
|             7 |      44 |      0.0% |     20.5% |     45.5% |     79.5% |     72.7% |
|             8 |      68 |      0.0% |      1.5% |     32.4% |     36.8% |     52.9% |
|            9+ |      87 |      0.0% |      0.0% |       ~6% |      ~14% |      ~28% |
|       **all** | **483** | **15.3%** | **37.9%** | **62.3%** | **68.3%** | **74.5%** |

**Eight tiles covers 37.9% of this corpus.** The paper reports 89.5% average for
the same configuration on its own datasets. Adopting 8 because the paper found
it optimal would have built a game that cannot construct three words in five.

Two reasons, both visible in the data:

1. **This corpus is long.** Only 64.0% of sampled headwords are 3–7 units, the
   range the paper studied at all. Sampled headwords run to 17 units
   (`seneyandirano`, `cuuraayi-dandino`). No fixed tile set builds those.
2. **Long vowels consume two tiles unless they are one unit.** `oo` is in 34.8%
   of headwords and `aa` in 29.6%. Under matching, a word needing `oo` needs two
   tiles bearing `o` — unless `oo` is itself a tile face, which is why it is one.

**Decision.** No fixed tile count is adopted, because **no shipped game uses a
fixed tile set.** `ArrangeWord` builds its pool from the word in play, so its
coverage is 100% by construction and the cube question does not arise. What the
table actually settles is a **length bound**: `SPELLABLE_UNIT_RANGE = 3–8`
units, which keeps 76% of the corpus and excludes both the one-unit headwords
that cannot be a spelling task and the 9-to-17-unit ones that are unplayable on
a phone. If a true cubes game is built later, this table is the input, and its
answer is not 8.

## Rejected

| #   | Rejected                                                      | Why                                                                                                                                                                                                                                                                                                                                                                                                                   |
| :-- | :------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **xAPI / LTI / Learning Record Store** (G11)                  | Designed to ship learner records to a third-party LMS. This platform's data sovereignty is architectural: gameplay telemetry stays local-first and account-scoped, and the engine is the only place a result settles. Adopting an interoperability standard whose purpose is exporting learner data to external systems is a sovereignty decision, not a features decision, and it is not ours to take here.          |
| R2  | **"Every letter of the alphabet appears at least once"** (M5) | Sound for a physical toy whose purpose includes alphabet familiarisation for 3-year-olds. Wrong here: it would restore keys for `v`, `x`, `z` — which never occur in 488 sampled entries — and for the six characters `ŋ ɓ ɗ ñ ɲ ʔ` that were hardcoded and occur zero times. On a phone, every dead key is a tax on every guess. Alphabet coverage is a legitimate goal for a _different_ game, deliberately chosen. |
| R3  | **Copying the paper's 8/9 cube constants** (M7)               | Measured at 37.9% coverage on this corpus against the paper's reported 89.5%. Detailed above.                                                                                                                                                                                                                                                                                                                         |
| R4  | **Difficulty ordering by letter frequency**                   | Tempting from M1/M4 — deal frequent-letter words first. Rejected for now: nothing in either paper establishes that letter frequency predicts _learning_ difficulty, and inventing a difficulty model and calling it research-grounded would misrepresent both papers. Deferred as D1 with an honest basis instead.                                                                                                    |

## Deferred

| #   | Deferred                                                  | Why, and what it needs                                                                                                                                                                                                                                                    |
| :-- | :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Increasing difficulty within a session** (G3)           | The honest basis for ordering words is per-player performance history, which needs the telemetry this PR only starts collecting. Building a difficulty curve now would be guesswork dressed as pedagogy. Revisit once there is data.                                      |
| D2  | **First-run onboarding** (G8)                             | Real requirement, separate piece of work, and it needs the localisation this repo does not have yet.                                                                                                                                                                      |
| D3  | **Vowel distribution across a fixed tile set** (M6)       | Only meaningful once a fixed-tile-set game exists. The analysis script already reports what it would need.                                                                                                                                                                |
| D4  | **Images in answer feedback**                             | The feedback panel has the slot and degrades without it. The Dictionary's game-pack projection supplies no image field today, so there is nothing to render — and fabricating one is forbidden. Needs a Dictionary-side decision first.                                   |
| D5  | **Confirming `nj` and `ny` as single orthographic units** | Both are attested (1.4%, 0.6%) and segmentation already protects them. They are deliberately **not** offered as tappable keys, because showing a learner an `nj` key asserts a claim about Mandinka orthography. That claim is **AIWA's to make**, not this repository's. |

## The one thing this document cannot settle

Everything above concerns whether the games are well built. Whether they are
**well judged for Mandinka learners** — whether these six mechanics suit the
language and the people learning it, whether the words dealt are the right
words, whether `nj` is a letter — is AIWA's authority, not ours. The papers do
not answer it and neither does this repository.

What is offered here is measurement they can act on, and a codebase that no
longer hardcodes a guess about their language.
