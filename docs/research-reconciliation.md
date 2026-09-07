# Reconciling the implementation against the source

**Source read:** _Digital Games and Language Learning: Theory, Development and
Implementation_, ed. Mark Peterson, Kasumi Yamazaki & Michael Thomas
(Bloomsbury, Advances in Digital Language Learning and Teaching). Supplied as a
converted Markdown text, ~90,000 words, read 2026-09-05.

Every previous document in this repository said the book **had not been read**
and that the rules came from the brief's enumeration of it. That caveat is now
discharged: this document reports what the source actually says, where the
implementation matches it, and — more usefully — **where it does not**.

## What the source directly supports

Each row cites the passage. The book attributes most of these to its own
sources; those attributions are kept, because "the book says X" and "the book
reports that Smith says X" are different claims.

| Principle                                      | What the source says                                                                                                                                                                                                                                                                                                                                                     | Our implementation                                                                                                                                                                                                                      |
| :--------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Freedom to fail**                            | Lee & Hammer (2011), Stott & Neustaedter (2013), Dicheva et al. (2015) identify it as one of four game dynamics "proven to be successful in an educational context". Klopfer, Osterweil & Salen (2009) and Kapp (2012): the freedom "to fail without the fear of penalty when learning".                                                                                 | No negative XP; retry, help, Skip and reveal in every game. `src/pedagogy.js`.                                                                                                                                                          |
| **Rapid feedback**                             | Named in the same set of four dynamics. Kapp (2016): games are "extremely useful for providing instant feedback", and the frequent, immediate mechanisms in game design support "a more personalized learning approach" where a classroom teacher cannot reach one student at a time.                                                                                    | Every answer resolves synchronously; `AnswerReveal` follows immediately.                                                                                                                                                                |
| **Feedback that teaches rather than punishes** | Reinhardt & Thorne (2016: 425), quoted in the book: in game contexts feedback is "**instructional rather than punitive, and is formative rather than summative**", timely enough that players "understand the action that caused it", "may be personalized, as it takes into account the feedback already provided", and its "quality and quantity … are also adjusted". | The shared answer panel shows meaning, IPA and example rather than a mark; hint level escalates with what the learner has already taken. This is the closest match in the whole reconciliation — the brief's §4 is nearly this passage. |
| **Mastery before advancement**                 | Kyriakova & Angelova (2014), reported in the book: games "may provide difficulty progression on an individual basis, **keeping players at a particular level until they have demonstrated that they are able to pass that level and progress to the next one**".                                                                                                         | `src/literacy.js` — a learner stays in a unit band until ten unique words are mastered first-attempt and unaided. Points never promote.                                                                                                 |
| **Challenge within reach**                     | On progression designs: "at a particular level, players are only given challenges they have a good chance of meeting. In effect, this **scaffolds players and provides shelter for mastery learning**."                                                                                                                                                                  | The 60 / 25 / 15 pool mix — mostly current band, some review, a deliberately small stretch share.                                                                                                                                       |
| **Support that fades**                         | Bruner's scaffolding via Beed, Hawkins & Roller (1991) and Wood & Wood (1996): the essential features include an "**adjustable level of support** … taking the learner's zone of proximal development into account" and "temporal support and guidance that **dwindle away to nothing** depending on the learner's progress towards self-reliance".                      | `src/hints.js` ladders and the unit-reveal ladder; help is requested, escalates, and is not given unasked in Challenge.                                                                                                                 |
| **Do not teach that learning needs a prize**   | Lee & Hammer (2011: 4), quoted directly: a gamified curriculum "might absorb resources, or **teach students that they should learn only when provided with external rewards**".                                                                                                                                                                                          | XP marks real outcomes only; celebration is bounded and never blocks; no rank or reward is ever computed in the browser (see §5, superseded).                                                                                           |

## Where the implementation DIVERGES from the source

This is the part worth reading. None of these are errors to fix silently —
they are decisions someone should agree with knowingly.

### 1. The book is mostly about a different kind of game

Its centre of gravity is **massively multiplayer online games, 3D virtual
environments, simulation and role-play** — social, narrative, many-player
settings. Dictionary Games are single-player vocabulary and spelling exercises.
Much of the book's strongest material (situated learning, intersubjectivity,
communities of practice, avatar-mediated intercultural competence) **does not
transfer** to what we built, and no claim in this repository should imply that
it does.

### 2. Scaffolding in the source is SOCIAL; ours is algorithmic

Bruner's three essential features begin with "**collaborative interaction
between a novice and an expert**". The book's whole treatment of scaffolding is
about a learner being helped by a more proficient person — in MMOGs, by other
players.

Our hint ladders provide the second and third features (adjustable support that
fades) and **not the first**. There is no expert in the loop. That is a real
gap, not a nitpick: on the source's account, the human is part of the mechanism
rather than an optional extra.

**Consequence:** the classroom version's teacher role is not a nice-to-have
bolted on later — it is the missing half of the scaffolding this literature
describes. `docs/pedagogy-records.md` lists a teacher role per game; those
should be treated as the beginning of that work.

### 3. "Storytelling" was dropped, and it is one of the four

The four dynamics are "freedom to fail, rapid feedback, progression **and
storytelling**". The brief carried the first three and omitted the fourth, so
nothing in the implementation addresses it. The games have no narrative frame at
all: a round is a list of words.

Whether that matters for an adult literacy tool is a product judgement, but it
should be a _judgement_, not an oversight. Flagging it rather than quietly
inheriting the omission.

### 4. The source is more permissive about extrinsic reward than the brief

The brief says do not overuse external rewards. The book, via Ryan & Deci's
self-determination theory, says something more balanced: where "learners may
lack intrinsic motivation for non-game applications, **extrinsic motivation … may
be necessary** to make them engage", and Cerasoli, Nicklin & Ford (2014) is cited
for **both** extrinsic and intrinsic motivation promoting performance gains.

Our conservative implementation is defensible and I am not proposing to loosen
it. But the caution is ours, sharpened beyond the source.

### 5. The no-leaderboard rule was a product decision — and the owner has since reversed it

The book treats leaderboards neutrally to positively — they "encourage
competition and participation as well as offering a visual representation of
progress" (Hamari 2017). The reason this repository omitted one was that
competition may discourage adults developing literacy, which is a judgement
about **our** learners, not something the source says.

**SUPERSEDED, 2026-09.** The owner has ruled that the RLC node-engine owns
scores and leaderboards across 3iAtlas games, and that this client shows them.
The section is kept rather than deleted because the reasoning above was sound
and is worth reading beside the decision that overrode it: the caution was
ours, it was never a finding, and a product decision is exactly the kind of
thing an owner may reverse. What the ruling does **not** touch is the
separation this repository was careful about — progression is still mastery,
never points (`src/literacy.js`), and no rank promotes anyone.

Where the leaderboard lives now: `src/api/statsClient.js` and
`src/components/StatsScreen.jsx` in this repository, and the engine's
`NODE-ADR-011` for the ranking rules themselves. Nothing here computes a rank.

### 6. Numbers the source does not supply

The book gives **no** basis for: three attempts, `+10`/`+5`/`0` XP, ten mastered
words, the 60/25/15 mix, or the `3 → 4 → 5+` unit ladder. It supports the
_shapes_ — hold at a level until mastery is demonstrated, keep challenge
reachable, let support fade — and supplies none of the values.

Every one of those numbers is therefore a **product decision awaiting pilot
data**, which is exactly why `progressionPolicy()` makes them configurable. No
comment in this repository may cite the book for a threshold.

## Net effect on the code

Nothing in the reconciliation requires a behaviour change. The implemented
shapes match the source's; the divergences are scope (social scaffolding,
storytelling) and calibration (values the source does not provide). The
correction is to the **claims**, which have been updated in
`docs/dictionary-games-tech-spec.md`, `docs/pedagogy-records.md`,
`src/literacy.js` and `src/hints.js` so that none of them attributes a product
decision to the research.
