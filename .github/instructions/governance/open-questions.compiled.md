# Open Questions — Auto-synced from registry@22c100a
# DO NOT EDIT

# Open Questions

Questions raised and deliberately not resolved. Each gets resolved by a future
ADR; until then the entry stays question-only. Resolution is recorded here with
date and pointer.

---

## OQ-001 — Contributor-identity keystone [RESOLVED 2026-06-11]

Who mints contributor_id, with what scope and durability, and how minors get
pseudonymous-but-stable identities.
Resolved by [ADR-012](decisions/ADR-012-contributor-identity-keystone.md).
Remaining operational follow-up: OQ-012 (school enrollment SOP).

## OQ-002 — Phase 3.6 visual table column specs [OPEN]

visual_assets, document_pages, page_regions, ocr_runs, ocr_tokens,
glyph_observations, grapheme_inventory, grapheme_variants,
handwriting_attestations. Phase reserved by ADR-007; columns not yet drafted.
Belongs in its own delta.

## OQ-003 — Graph projection engine [OPEN]

Neo4j vs DuckDB vs in-memory vs SQL views. Deferred by ADR-001 until canonical
tables are settled.

## OQ-004 — Null-model implementation spec [OPEN]

Syllable-frequency baselines and permutation testing for the
recurrence-analysis layer. Requirement locked by ADR-006; implementation spec
not yet written.

## OQ-005 — ConfidenceRecord dimensionality reconciliation [OPEN]

How many dimensions must `ConfidenceRecord` carry for platform conformance, and
when does the `language_identification` field become mandatory?

A 2026-06-11 code read informed discussion, but no ratifying ADR currently
records a final resolution.

## OQ-006 — Expressions / proverb layer trigger [OPEN]

Does current fellowship content require proverb/idiom capture now (pulling the
v1.5 tables of ADR-003 forward)? Content decision — routes to AIWA language
authority.

## OQ-007 — Multi-language sound-correspondence sets [OPEN]

Beyond pairwise v1 (ADR-003 spec). Extension would supersede the pairwise spec
via a new ADR.

## OQ-008 — Notation-systems evidence: music, mathematics, code [OPEN]

INV-001 already admits notation systems as sign carriers and ADR-008 confirms
they enter through the standard doors. Open: scope and phase for notation
evidence (likely extending the Phase 3.6 glyph machinery or a Phase 3.7),
alignment of music notation with Yahura's suprasegmental tonal tier
(talking-drum / griot tonal transmission), and the cultural framing of
music-as-language, which routes to AIWA language authority. Code scope is
code-as-communicative-artifact only; platform source is infrastructure, not
evidence.

## OQ-009 — Librarian ratification and naming [OPEN]

ADR-009 is Proposed: ratify the perpendicular topology, settle the name
(shortlist: Sankoré, Seshat), and complete the Patent Family A review before
any public-repo implementation detail.

## OQ-010 — Anansi ratification, entity-table delta, person-entity rules [OPEN]

ADR-010 is Proposed: ratify the proposer-never-decider authority formula,
settle the Librarian/Anansi division of labor in implementation, commission the
entity-table family delta (entities, entity_mentions, entity_relations,
entity_resolution_judgments), complete the Patent Family A review, and obtain
the AIWA cultural read on the Anansi naming.

## OQ-011 — Posthumous and unreachable-contributor requirement resolution [OPEN]

When a data requirement can never be satisfied by the contributor (deceased,
unreachable), who may complete it — kin, community, AIWA under Gambian law and
the Swakopmund community-consent framework — and what states are permanently
reachable without it? Legal and cultural weight; routes to AIWA / Gambian legal
counsel. Until resolved, such evidence remains preserved in its quarantine
state indefinitely (INV-009 guarantees it is never lost).

## OQ-012 — School enrollment SOP (Muhammed / Gambian school practice) [OPEN]

The architecture is decided (ADR-012); the operational classroom flow needs
local confirmation: who practically collects guardian participation consent
(administrator / teacher / AIWA staff / combination); what identifier schools
can reliably use at enrollment without exposing identity downstream (class
list number, cohort ID, names held inside Helios only); how to confirm
same-contributor on school change or program re-entry without exposing
identity to 3iAtlas/ESU/Dictionary; the practical age/grade boundary for
student self-assent alongside guardian consent; the best local
self-ratification channel at majority (WhatsApp/SMS, alumni contact, AIWA
account claim, national ID inside Helios only); and the community-mediated
enrollment practice for out-of-school contributors (who vouches — village
head, VDC, AIWA staff). Routes to Muhammed; classroom capture begins when
this SOP is confirmed.

## OQ-013 — Atomic lexical boundary (morpheme vs root vs tone-bearing syllable) [OPEN]

The exact atomic unit for the root-generative lexical model is owned upstream
(dictionary / 3iAtlas + AIWA language authority), explicitly NOT in the ESU
spec (sky-esu v3.1 §10.4/§19, correctly deferred). Interacts with the Phase
3.5 morpheme tier (morphemes vs roots are already separate tables; the open
call is which is the atomic record for Mandinka and how tone-bearing units
participate). Routes to Muhammed + dictionary repo design session.

## OQ-014 — ESU licensing reconciliation: BUSL 1.1 vs proprietary [OPEN — owner only]

Platform record (April 2026) locked BUSL 1.1; sparxstar-sky-esu LICENSE.md
carries the Starisian proprietary license; v2.0 spec §7.2 references BUSL.
Both are deliberate decisions made at different times. Owner must reconcile
consciously (per repo or platform-wide); flagged by sky-esu v3.1 §4/§19.

## OQ-015 — Place/location reference registry: minting authority and minor-safe granularity [OPEN — filed 2026-06-12, ESU register-conformance pass]

INV-005 requires location_id on the timed-token join path; ADR-005 references
locations.visibility_level at district/settlement precision; ADR-007 repeats
location_id for visual evidence — but no ADR or spec defines the place registry
itself (minting authority, table shape, granularity). Before ESU's
IngestManifest can carry location_ref (INV-005 conformance, sky-esu v3.1 §8.1),
two things need a registered answer: (a) who mints location references and
where they live — note INV-004 forbids location references in the Reference
zone, so the registry is Governed Evidence zone material, with a possible
neutral gazetteer split; (b) permitted granularity on minors' artifacts —
region, never building/coordinates, because location + a pseudonymous minor is
identity-adjacent and can undo ADR-012. Until resolved, ESU carries
location_ref as an opaque pass-through pointer only, applies the
region-not-building floor for minor-sourced artifacts, and invents no location
semantics at the door. Routes to architect + Helios (identity-adjacency) +
AIWA/Gambian counsel (minor granularity).

## OQ-016 — Registration schema, migration mechanism and Games audience [OPEN]

ADR-020 settles the credential classes, their audiences, their claim bindings
and the offline lifetimes. **None of that is reopened here.** What remains is
implementation detail.

**Registration schema.** What shape a resource or client registration takes and
where it lives — service configuration validated at boot, or a table that can
change without a deploy. Which fields are required beyond resource key and
audience: permitted flows, token lifetime, enabled state, an owning product.
What happens at startup when a registration is malformed, duplicated, or claims
an audience another registration already holds.

**Migration mechanism.** How a deployment adds or retires an audience without a
gap in which some consumer holds no usable credential, and whether any period
exists during which two paths issue. Applies to `wordpad-offline` and
`key-vault`, which are governed but not yet built.

**Games.** `sparxstar-3iatlas-dictionary-games` has not been read, so whether it
validates an audience — and therefore whether it needs its own registration —
is an implementation fact to establish, not an open architectural question.

Resolve in the Identity Node implementation and record the chosen schema in
that service's contract, not by amending ADR-020, unless a new audience or
class is added.

## OQ-017 — Award identity vocabulary [OPEN]

There is no server-side award vocabulary. The RLC Node engine's `LedgerKind`
carries `'star'` and `'badge'` explicitly "reserved for later phases", and the
star kinds it does resolve carry XP but no id, no display name, no criteria and
no gold value. A client therefore cannot be in parity with the server: the
catalogue in `sparxstar-3iatlas-dictionary-games` `src/awards.js` is display
metadata transcribed from approved mockups, and correctly declares
`inParity: false` (that one file read directly on 2026-09-05). That reading
does **not** retire OQ-016's note about this repo: OQ-016 asks whether the repo
validates an audience, which is its auth layer, not its award catalogue. That
question is untouched and stays open.

Open: what identifies an award on the wire, who mints the identifier, what the
settlement response carries, and which fields are server-owned versus
client-owned. The chief-architect recommendation on record is that **only
identifiers cross the wire and all display strings stay client-side** — it keeps
localization where INV-008-adjacent i18n rules already put it and avoids a
second editable catalogue (forbidden by INV-016). It is a recommendation, not a
ruling, because the answer depends on OQ-018.

Blocked on OQ-018. Until both are resolved, no repo may declare award support
complete; declaring the schema work blocked is the correct status, not a defect.

## OQ-018 — Does a Dictionary product grant awards at all, and what is Gold for? [RESOLVED 2026-09-05]

Two product/money questions the platform cannot answer for itself.

**Awards in Dictionary Games.** Placement and community awards are structurally
impossible in solo play, and the pedagogy review for this product argued against
competitive surfaces for adults developing literacy (a public leaderboard was
ruled out for this phase on that basis). Whether this product grants awards at
all — and if so, which of the ten mockup awards have a solo equivalent — is a
product decision, not an architectural one.

**Gold.** State it precisely, because "blocked" overstates it: Gold is
*half-defined*. Earning is implemented and running — `grantXp(ctx, xp, 1, tx)`
grants one unit on consensus, discovery and RSC completion, raising
`lifetime_gold` and writing a `kind: 'gold'` ledger row. What does not exist is
the other half: ownership, any spend or redemption path, and whether a balance
is ever displayed to a learner. An earn-only counter with no spend path is not
yet a currency, and shipping a visible balance a player can never use is a
product promise the platform cannot keep.

**Resolved by owner ruling, 2026-09-05, recorded in
[ADR-029](decisions/ADR-029-reward-authority-is-platform-level.md):**

- **Gold is earn-only for Release 1.** No shop, no wallet, no spending, no
  client-side granting. Earning stays as implemented; redemption is out of
  scope for R1 rather than undecided. Ownership beyond R1 is not settled here
  and returns as a new question if a spend path is ever proposed.
- **Awards may be rendered by Dictionary products**, but only as the engine
  settled them — Games and the UI submit results and render what comes back,
  and grant nothing.

What this does **not** resolve, and OQ-017 still carries: *which* awards exist.
No award id vocabulary exists server-side, so a client still cannot be in
parity with the server. The ruling settles authority, not inventory.

## OQ-019 — RLC-Spec-v4.0 has two canonical homes, and they have diverged [RESOLVED 2026-09-05]

`SPARXSTAR-3iAtlas-RLC-Spec-v4.0.md` is declared canonical in two places at
once, in violation of one-home-per-fact:

1. `sparxstar-3iatlas-rlc-node-engine/.github/instructions/sparxstar-3iatlas-rlc-spec-v4.0.md`,
   named canonical by that repo's own `AGENTS.md` §2.
2. `sparxstar-product-specification-registry/specs/3iAtlas/rlc-games/rlc-games-tech-spec.md`,
   whose frontmatter records `canonical_source: "SPARXSTAR-3iAtlas-RLC-Spec-v4.0.md"`
   and whose body is that document verbatim.

A third, a snapshot in `sparxstar-3iatlas-rlc-ui`, also declared itself
canonical until it was relabelled in 2026-09.

They have diverged. Verified against the registry copy on 2026-09-05, it still
carries every defect corrected in the engine copy by
[rlc-node-engine#45](https://github.com/Starisian-Technologies/sparxstar-3iatlas-rlc-node-engine/pull/45):

- **line 136** — "1.6 Rewards — myCred Hooks Only"; **line 141** — "XP, Gold,
  stars, and badges are all myCred entities." Both false against the code and
  corrected by ADR-029.
- **lines 685–687, 698–700** — six "+ Gold badge" rows. Gold is a currency;
  `'badge'` is a reserved `LedgerKind` with no writer.
- **line 154** — "Join rejected with 423 Locked + localized 'Daily limit
  reached'", which the *same document* contradicts at **line 620** (423 =
  `account_locked` + `unlock_path`) and **line 623** (451 =
  `screen_time_exceeded` + `reset_at`). The registry's canonical product spec
  assigns 423 to two different failures and disagrees with itself about which
  status the screen-time gate returns.

This is not a stale-copy nuisance. `fetch-specs.yml` pulls the registry copy
into every consuming repo's `.sparxstar/specs/` at CI time, so the *wrong*
answer is the one that propagates, and a UI built against it would tell a
learner who used up their daily minutes that their account is locked.

**Answered by owner ruling, 2026-09-05: the product-specification registry is
the sole canonical home.** Stated by role, per this registry's rule against
client-specific names in canonical decision text; the repository is identified
in item 2 of the question above.

Two different things, deliberately kept apart:

- **The ruling is made.** Teams act on it now; it is not still under
  discussion, and this question is not awaiting an answer.
- **It becomes platform law when
  [ADR-033](decisions/ADR-033-canonical-home-for-rlc-spec-v4.md) is Accepted.**
  That record is `Proposed`. Until it is ratified, cite the ruling, not a
  binding ADR — and the consequences live in ADR-033 rather than being restated
  here.

Not resolved by this ruling: whether the `rlc-games` registry key and the
engine's `aiwa-rwc-rsc` key describe two products or one. Tracked as OQ-020.

## OQ-020 — Are `rlc-games` and `aiwa-rwc-rsc` two products or one? [OPEN]

Both registry keys are backed by `SPARXSTAR-3iAtlas-RLC-Spec-v4.0.md`:
`rlc-games` names it as `canonical_source`, and the engine's governance
workflow pulls `aiwa-rwc-rsc`. One source document behind two product keys is
either a duplication to collapse or two genuinely distinct products that need
distinct specs. OQ-019's ruling makes the registry canonical but does not say
how many products it should hold. Split out from OQ-019 on 2026-09-05.

## OQ-021 — What are the numeric floors and permitted codecs for each capture profile? [OPEN]

[ADR-035](decisions/ADR-035-capture-profiles-not-a-platform-audio-ceiling.md)
establishes that audio constraints belong to a named capture
profile — `conversation`, `documentation`, `import` — and that no numeric
ceiling applies platform-wide. It deliberately sets no numbers.

Still unanswered, and not an architecture call:

1. The **sample rate, bit depth and channel floor for `documentation`** — the
   quality below which material is not admissible as a source for acoustic
   measurement, sound-to-IPA, or tone work.
2. The **permitted container and codec set per profile**, including whether
   `documentation` requires an uncompressed or lossless container.
3. Whether `conversation` material is ever admissible for measurement, or is
   categorically interaction-only.

A floor set from architecture rather than from what the measurements require is
how the platform-wide 16 kHz cap arose in the first place. Routes to AIWA +
the acoustic-analysis owner. ADR-035's Consequences carry a starting point for
them to react to; no repository may implement a value before it is ruled on.
## OQ-022 — Which repository is the single home for the Starmus↔ESU intake contract? [OPEN]

[ADR-034](decisions/ADR-034-capture-experience-vs-audio-lifecycle-split.md)
filed the Starmus↔ESU seam in this registry as
[`contracts/spoken-audio-asset-to-records.md`](../contracts/spoken-audio-asset-to-records.md).
The 2026-09-10 owner ruling describes the same seam as the **Starmus–ESU Intake
Contract** and raised a separate contracts repository as its home.
[ADR-038](decisions/ADR-038-spoken-audio-node-is-a-node-service.md) records the
ruling's substance and deliberately does **not** settle the home: its text says
the contract is defined once, in one home, with both builders, and routes the
choice of repository here.

A note on the candidate's name, because it has already caused one broken
reference: the session said "platform-contracts", and this registry's
[2026-08-24 repository-reference correction report](../docs/reports/2026-08-24-repository-reference-correction-report.md)
records that `sparxstar-platform-contracts` does not exist while
`sparxstar-contracts-registry` does. So the candidate, if it is chosen, is
`sparxstar-contracts-registry` — or a new repository someone decides to create,
which is a different answer and should be said out loud rather than implied by a
name.

That is two candidate homes for one fact, which is the condition the platform's
one-home rule exists to prevent. Unanswered:

1. Whether seam contracts live in this registry alongside the ADRs that create
   them, or in a separate contracts repository that both builders depend on as a
   versioned package. If a separate one, it is `sparxstar-contracts-registry` or
   a new repository created for the purpose — not the `platform-contracts` name
   the session used, which resolves to nothing, as the paragraph above records.
2. If a separate repository, what happens to
   `contracts/spoken-audio-asset-to-records.md` specifically — moved, or left as
   the record with a package generated from it. This question is about the
   intake seam only. The capture→ingestion and elicitation-pacing contracts are
   separate seams and moving them is not asked here, nor implied by an answer
   to this.
3. Which side's CI runs the shared conformance suite the contract calls for.

This is a governance-home question, not an architecture one: both answers work
technically, and the cost of getting it wrong is a duplicated contract that
drifts. Until it is ruled on, neither builder implements a guessed wire shape
and the contract text stays where ADR-034 put it. Filed 2026-09-10 from the
Starmus repo-split cleanup session.

## OQ-023 — Who owns consent, rights, and the CMS host for the spoken-audio stack? [OPEN]

[ADR-034](decisions/ADR-034-capture-experience-vs-audio-lifecycle-split.md)
demotes the CMS capture product from owner to host and strips CMS-shaped
capabilities from the Spoken Audio Node, and
[ADR-038](decisions/ADR-038-spoken-audio-node-is-a-node-service.md) fixes the
four service owners. Neither names an owner for three capabilities the v1.0
Starmus architecture held, and the Starmus specification stands at
`status: review` with all three unassigned. Whether that status may advance
before they are owned is itself part of this question: stating it here as a
rule would make this entry normative, and this file stays question-only until a
ratifying ADR resolves it. Raised by Max Barrett on 2026-09-14.

The first two carry a proposed owner below, with its grounds; the third has
none, and says so. They are proposals rather than rulings either way — naming
the owner is the platform owner's call, and the point of filing all three
together is that they are the same kind of question, not that they are equally
far along.

1. **Consent capture and verification.** *Proposed owner: Helios
   (`sparxstar-helios-trust`).* [INV-010](invariants.md#inv-010--one-identity-authority-opaque-refs-everywhere)
   makes Helios the sole minting authority for `contributor_id`, and
   [ADR-012](decisions/ADR-012-contributor-identity-keystone.md) already reasons
   about consent authority shifting between guardian, school and adult
   contributor — so the consent lifecycle is already Helios-shaped. What is owed
   is a contract: which party verifies consent scope at the moment of a governed
   action, what the capture UI may assert (today it reports `consentGranted`
   from a browser-local flag, which cannot represent a per-session or hook-based
   grant), and what an asset arriving without verifiable consent becomes. Note
   that ADR-011 binds here: the answer cannot be to refuse the recording.

2. **The rights, credits and agreement *record* — its schema and its capture at
   contribution time.** *Proposed owner for the record: the governed-artifact
   lineage layer (`INV-012`, this repo's `contracts/governed-artifact-lineage.md`).*

   Scoped deliberately, because two neighbouring records already answer parts of
   this and answering it again would contradict them.
   [ADR-039](decisions/ADR-039-archive-never-edits-audio.md) places commissioning
   and rights **for releases** with the rights module, so release-rights
   ownership is not open. And GAL states its own boundary: it "does **not**
   determine legal rights, ownership, or governing law", routing those to a
   Legal & Compliance standard and policy registry that do not yet exist. So GAL
   is proposed as the owner of the *record* — it already owns
   `contributor_ref`, `ArtifactGovernanceDeclaration` and `Release Receipt`,
   which is the vocabulary these fields belong to — and explicitly not as the
   authority that decides what anyone's rights are.

   What remains genuinely unowned is narrower than "rights": which party captures
   an agreement at contribution time, in what shape, and what a contribution
   without one becomes. It is
   `Proposed` and not Accepted, so this question is partly blocked on its
   ratification. What is owed is the mapping from the v1.0 `FIELD_MAP`'s
   rights/credits/agreement fields onto that vocabulary.

3. **The CMS host.** *No owner proposed — this one genuinely has no candidate in
   the registry.* ADR-034 says what the host keeps (its own templates,
   shortcodes, admin screens and product-local persistence) but not which
   repository or team maintains it.

   Two things that read as rules here are recorded where they belong rather
   than stated as rules by this entry, which stays question-only: the Starmus
   specification is what holds its CMS-shaped capabilities as superseded in
   architecture and not abandoned in fact (`REQ-STARMUS-051`), and the
   field-by-field disposition of the v1.0 `FIELD_MAP` against the DVE canonical
   schema is v1.0 action D-01, which was called for and never done. What is open
   *here* is only who owns the host — and, because nobody does, what an owner
   would be taking on.

Tracked in the product specification registry as `OI-STARMUS-001`, whose
resolution points back here.
