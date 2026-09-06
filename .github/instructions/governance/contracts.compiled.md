# Cross-Repo Contracts — Auto-synced from registry@78a426f
# DO NOT EDIT — this file is overwritten on every registry change


<!-- source: contracts/cross-repo-lineage-node-contract.md -->
# Cross-Repo Lineage-Node Contract

> **Disclosure:** Internal. Adjacent to Patent Family A (community-weighted intelligence / extraction layers) and Family C (provenance + governed-record mechanism). Do not route externally; clear with patent strategy before any public posting. Reference by registry ID only once assigned.

**Status:** Accepted (2026-06-16, platform-standards owner). **Invariant 7 is normative.** Registry ID assignment remains an operational follow-up — not self-minted; assigned by the registry owner.
**Home:** `sparxstar-platform-standards`.
**Concretizes:** GAL clauses 4–5 (the "one shared model, serialization specified elsewhere" that GAL deliberately deferred) and the language-event fields the LRPL-IC will carry.
**Dependency status:** the ADR-012 amendment (ADR-017, identity vocabulary) is **Accepted** as of 2026-06-16. LRPL-IC remains open and continues to apply as a sovereignty decision (Muhammed) — the language-event fields below are reserved by name; their canonicity semantics finalize when LRPL-IC is Accepted.
**Consumers (project into this shape; none mints a local variant):** WordPad, Prosody Reader, DVE, ESU/Yahura, Helios, Dictionary, Mḗh₁n̥s, the Librarian (ADR-009), Anansi (ADR-010), and any future capture, extraction, or governance surface.

---

## Purpose

One serialized node shape that every repo projects into. GAL says "use one shared model"; LRPL-IC adds required language-event fields; this contract is the concrete shape both refer to. Without it, "don't mint a local lineage model" has no target to conform to.

## The node shape

Fields are required on every node unless marked **conditional** (present only on the node kinds noted). `artifact_purpose` (`language-evidence` | `original-authored` | `both` | `administrative` | `removal-event` | `publication-event`) lives on the **artifact aggregate** that `artifact_ref` points to — not on every node; `node_kind` lives on the node.

### Core identity & lineage (GAL clauses 3–4, 7, ADR-012 as amended by ADR-017)

- `node_id`
- `artifact_ref` — binds this node to the governed artifact aggregate it belongs to (GAL clause 7, one aggregate → many projections). `node_id` identifies the node; `source_node_refs` its DAG parents; `artifact_ref` its aggregate.
- `source_node_refs` — DAG parent(s); append-only, never rewritten
- `node_kind` — captured-contribution vs candidate/proposal node (see extraction seam)
- `actor_ref` — resolves through Helios to `contributor_ref` / `tutor_ref` / `reviewer_ref` / `system_ref`; **`contributor_id` never appears in a node**. `contributor_ref` is a **distinct Helios-issued value, not an alias of `contributor_id`** — Helios mints it and holds the `ref → id` map; the durable id's *value* never appears in any ref field (see Invariant 7).
- `actor_role` — the actor's role on this node (`author` | `suggester` | `reviewer` | `promoter` | `system`), per GAL clause 4
- `authority_axis` — `provenance` | `canonicity` | `publication`, carried as **distinct** values; the three never collapse into one field. Additional operational scopes (pedagogy, extraction, transcription, translation, safety) may be carried in policy/review metadata but do **not** replace or extend the three GAL authority axes unless separately ratified.
- `captured_at` — the as-of-capture timestamp; immutable

### Governance (GAL clauses 1, 4, 13)

- `consent_stage` — NOT NULL at capture
- `retention_class`
- `review_state`
- `rights_ref`
- `removal` — **conditional; present only on removal / tombstone / destruction nodes.** Typed (`privacy-erasure` | `takedown` | `illegal-content` | `retention-expiry`); capability, not policy. Producers (e.g. WordPad) purge local copies and emit a deletion intent; the **destruction receipt is Dheghom's**, not the producer's.

### Public projection (GAL clause 8) — conditional

- `release_author_ref` — **present only on public-projection / release records, not on private lineage nodes.** When present, it is the *only* identity reference the projection may carry: no `contributor_id`, no `contributor_ref`, no relationship/SLC, and no indirect identifiers (school, cohort, precise timestamps, dialect).

### Language event (LRPL-IC) — conditional by node kind

*Required on captured-contribution and language-evidence candidate nodes; conditional (omitted, not faked) on administrative, removal, and publication nodes — never `target_language = unknown` on a tombstone or release record.*

- `target_language`
- `relationship_to_target_language` — incl. `unknown / undeclared` (distinct from *none*)
- `relationship_claim_source` — `user-declared` | `institution-declared` | `reviewer-supplied` | `system-inferred` | `unknown`
- `source_language_context` — may be partial
- `slc_claim_source` — same enumeration as above
- `context_profile_ref` — **reserved, not typed.** Points to the future Contributor Context Profile used to derive Confidence / Authority / Experience as-of-capture. Field name reserved here so repos leave room for it; its internal fields wait on the Contributor Context Instrument (Muhammed).
- (all language-event fields recorded **as-of-capture**, never back-resolved from later status)

### Derived references (downstream, non-canonical — GAL clause 11)

- `derived_influence_signal_refs` — references only. The node does **not** compute these; the cross-corpus analysis layer produces them, and they are lowest-authority inferences, never auto-canonical.

### Candidate / extraction seam (Librarian ADR-009, Anansi ADR-010)

- `node_kind` — distinguishes a captured contribution from a **candidate/proposal node** (candidate entity / relation / resolution / influence-signal) produced by an extraction layer.
- Candidate nodes are **non-canonical, reviewable, never auto-accepted**. Person-entity resolution is **always proposal + review** regardless of confidence, and respects pseudonymization, minor-protection, and Helios authority.
- The extraction layers' internal schemas (entity tables, weaving mechanism) are **out of scope here** — Patent Family A; their own future deltas. This contract reserves only the candidate-node *category* at the seam.

## Invariants

1. **One shape, no local variants.** This is the concrete form of GAL clause 5.
2. **Authority axes never collapse** inside the node (GAL clause 3).
3. **As-of-capture is immutable**; never re-resolved from later status (GAL append-only + LRPL-IC clause 1).
4. **Public projection carries `release_author_ref` only** — never `contributor_id`/`contributor_ref`, relationship, SLC, or indirect identifiers (GAL clause 8 + LRPL-IC clause 6).
5. **Candidate and derived nodes are non-canonical** and never auto-promoted; promotion is Mḗh₁n̥s through the policy gate (GAL clauses 11, 13).
6. **Deletion semantics are split** — local purge + intent at the producer; tombstone/destruction receipt at Dheghom.
7. **`contributor_ref` is not an alias for `contributor_id`.** It is a distinct Helios-issued governed-lineage reference. Helios mints `contributor_ref` and holds the `contributor_ref → contributor_id` map internally; the durable `contributor_id` value never leaves Helios under any name. Draft implementations that currently pass `contributor_id` as `contributor_ref` are **bridge implementations only and are not conformant for merge, acceptance, deployment, or Phase-3 lock.**

## Out of scope (named)

- Anansi / Librarian internal extraction schemas (Family A; their own deltas).
- Canonicity **weights** (LRPL-IC defers these to the policy gate / designated language authority).
- Policy-registry **content** (the Legal & Compliance sibling owns it).

## Open ratifications

- Registry ID — operational follow-up; assigned by the registry owner, not self-minted.
- Final field names — confirmed with each consuming repo before lock.
- Candidate-node category — confirm shape with Librarian (ADR-009) and Anansi (ADR-010) owners.
- **LRPL-IC language-relationship invariant** — remains open as a sovereignty decision (Muhammed). The language-event fields above are reserved by name; canonicity semantics finalize when LRPL-IC is Accepted.
- **Contributor Context Profile (`context_profile_ref`)** — the field name is reserved above; its internal field set (Confidence / Authority / Experience inputs, survey anchors) waits on the Contributor Context Instrument, a sovereignty decision (Muhammed). Reserve room; do not type locally.

## Provenance

Drafted in the WordPad ↔ corpus governance session as GAL's deferred sibling (c), after WordPad surfaced that "one shared model" had no concrete home. Ratified 2026-06-16 by the platform-standards owner; ratification consciously scoped — LRPL-IC and tutor identity remain open, and the T&S/CSAM and Legal/Compliance standards are unaffected.


<!-- source: contracts/elicitation-pacing-sync.md -->
# Contract: Elicitation Pacing ↔ Recorder

**Status:** Proposed. Binding when [ADR-036](../standards/decisions/ADR-036-elicitation-pacing-is-not-acoustic-prosody.md) is Accepted.
**Home:** this registry.
**Sides:** the **elicitation pacing package** (emitter) and any **host that records or plays audio** alongside it — today the capture UI package, embedded by a product.
**Concretizes:** ADR-036's rule that the reader synchronizes through injected adapters and typed events, never shared globals.

---

## Why this contract exists

The legacy implementation coupled the paced reader to its recorder through
page globals and a direct CMS write. That made two readers on one page
impossible, made the reader untestable without a CMS, and put the reader's
pace-save on the critical path of a speaker's session. This states the
replacement precisely enough that a host can build against it.

## The line

The reader owns **what the speaker sees and when**. The host owns **the
microphone, the recording, and the upload**. The reader is told nothing about
audio and asks for nothing about audio.

**The reader performs no acoustic analysis and makes no network call of its
own.** Acoustic measurement is the Spoken Audio Node's; interpretation is
ESU's. Nothing the reader emits is a measurement of a speaker's voice — it is a
statement about the script's position and timing.

## Terms fixed by existing code

Read from the package's `src/types.ts`, not proposed.

- **Synchronization is an injected adapter.** The host supplies
  `syncAdapter`, an object with `handleEvent(event)` and an optional
  `destroy()`. The reader calls it; the adapter reaches whatever the host
  needs. The reader imports no product's code.
- **Every event carries the emitting instance's id and a monotonic sequence
  number.** Ordering is by that sequence. **Client wall-clock timestamps are
  never used for ordering** — the platform rule against client-supplied
  timestamps applies here directly.
- **The event set is closed:** `ready`, `started`, `paused`, `resumed`,
  `unit-changed`, `pace-changed`, `seeked`, `completed`, `stopped`, `error`,
  `destroyed`. A host binds to these names. Adding one is a change to this
  contract and a minor version of the package.
- **Instances are independent.** Two readers may exist in one container; each
  has its own id and sequence, and destroying one leaves the other running.
  The reader appends its own DOM subtree and removes only that subtree, so the
  host's markup in the same container survives both mount and destroy.

## Rules

1. **The host correlates, the reader does not.** If a product needs a reader
   event tied to a recording, the host's adapter holds that mapping. The reader
   is never given a recording id, an asset id, or an upload handle.
2. **No shared mutable global across the seam.** Not for the script, not for
   the pace store, not for the recorder handle. A host that needs to reach the
   reader holds the controller the factory returned.
3. **Persistence is an injected storage adapter**, and it carries **only**
   reader preferences and a resumable position. Never audio, transcripts,
   speaker identity, or consent records.
4. **The reader's pace is not a linguistic claim.** A speaker's chosen or
   calibrated pace describes how they wanted the script presented. It is not
   evidence about their speech, and no consumer may read it as one.
5. **The host may ignore every event.** The reader must function with no
   adapter supplied at all — synchronization is optional, and a product that
   only wants a paced script gets one.

## Forbidden on this seam

- The reader writing to any endpoint, CMS or otherwise. The legacy
  `starmus_save_pace` POST to a CMS admin endpoint is removed, not relocated.
- The host driving the reader by mutating its DOM. Transport is the returned
  controller's methods.
- Any symbol, event, field or emitted record inside the reader naming or
  implying a measured prosodic value.

## Owed before this contract is Accepted

1. **Whether the host needs an event the closed set does not carry** —
   specifically for tap calibration, which is specified but not implemented.
   Owed by the capture UI package's builder, before calibration ships, so the
   event is added once rather than bolted on per product.
2. **Whether a reader session position should survive a device change**, which
   would make it a platform record rather than a local preference. Owed by the
   owner; until then rule 3 stands and it stays local.

## Enforcement

The elicitation pacing package's own contract test suite — `tests/contract/`
**in that package's repository**, not in this registry — pins the public API
and the event names. A host binding to a name not in that suite is binding to
something this contract does not promise.


<!-- source: contracts/governed-artifact-lineage.md -->
# Platform Invariant — Governed Artifact Lineage (GAL)

> **Publication control:** this draft may contain disclosure-sensitive material adjacent to patent strategy. Do NOT publish externally — including into a public standards repo — until patent counsel approves.

**Status:** Proposed — **approved for internal standards routing**; do NOT publish externally; legal, sovereignty, retention, and patent-publication clauses pending ratification. **Not Accepted.**
**Home:** `sparxstar-platform-standards` (cross-repo source of truth, this repo). Repos reference this invariant by ID; they do not copy it.
**Invariant ID:** `INV-012` (stable working reference — append-only registry; this number does not change).
**Ratifying ADR:** assigned on acceptance — *not* self-minted (collision discipline).
**Applies to:** every repo that creates, edits, suggests on, reviews, promotes, publishes, stores, exports, or **trains on** a governed artifact — WordPad, DVE, ESU, Helios, Mḗh₁n̥s, Dictionary, model-training pipelines, and any future authoring surface.
**Scope boundary:** GAL is an architecture/governance standard. It does **not** determine legal rights, ownership, or governing law. Legal, sovereignty, and safety *policy* lives in the referenced siblings and the policy registry, ratified by their owners.
**Referenced siblings:**

- **Trust & Safety / legal-pipeline standard** *(to be created + ratified)* — illegal-content operations.
- **Legal & Compliance standard + versioned policy registry** *(to be created + ratified)* — jurisdiction, rights instruments, consent/capacity, folklore, retention schedule, cross-border transfer, controller/processor roles.
- **Cross-Repo Lineage-Node Contract** — the shared, serialized node shape every repo projects into (the concrete form of clauses 4–5). [Accepted 2026-06-16](./cross-repo-lineage-node-contract.md). WordPad, DVE, ESU, and Helios consume it and mint no local variant.

## Why this exists

WordPad is a writing-and-suggestion surface where minor students — and, later, adult authors — produce language evidence and original works. The same artifact then travels downstream into DVE for review, promotion, publication, and potentially model training. Without one shared lineage model spanning those repos, a later edit, a reviewer, an AI process, or a training pipeline can silently overwrite or absorb the original author's work — collapsing authorship, copyright, linguistic sovereignty, minor protection, and the audit trail in a single step. This invariant fixes the *shape* of a governed artifact so that cannot happen on either side of any boundary.

## Definitions (structural only)

*Governed artifact* — the logical aggregate (whole lineage) for one work. *Node* — one immutable governance event in that lineage. *Provenance root* — the original contributor-authored node. *Tombstone / destruction-receipt* — a node recording a lawful removal, holding only non-personal audit metadata. *Public projection* — an export intended for audiences outside the governed boundary. *Private provenance packet* — the governed-internal full record. *Policy gate* — a decision point that resolves a pending policy by reading the policy registry at runtime. *Policy registry* — versioned, counsel/owner-ratified policy records referenced by ID. *Identity references* — `contributor_id` (Helios-internal durable identity), `contributor_ref` (the Helios-issued reference used for governed-lineage attribution), and `release_author_ref` (the non-correlating per-release public reference); the scheme is owned by the Helios identity contract / ADR-012 (as amended by ADR-017), and GAL uses it per that scheme. (Legal terms — *minor contributor*, *lawful representative*, *consent basis*, *expression of folklore* — are defined in the Legal & Compliance standard, not here.)

## The invariant (normative)

1. **Append-only as to audit; policy-controlled as to content.** A governed artifact's lineage of *lawful governance events* is append-only — no node is ever silently mutated or overwritten. *Content availability* is policy-controlled: where privacy law, child-protection law, copyright takedown, retention expiry, court/regulator order, or safety process requires it, content/identifiers/decryptability/access may be redacted, cryptographically erased, quarantined, or destroyed, while a **non-personal** governance event (removal type, removed-node reference, when, under what authority) remains. **Destruction removes content or decryptability, not the existence of a lawful audit event.** *[The architecture MUST support erasure, redaction, tombstone, destruction-receipt, and cryptographic-erasure paths. Whether any delete is legally required — and its scope, deadline, exemptions, and artifact categories — is PENDING counsel; GAL does not settle the legal interpretation. This capability amends the prior "no deletion anywhere" invariant platform-wide.]*

2. **Provenance is inviolable — and is not ownership.** The provenance root records the contributor-authored *source* and must never be overwritten by any tutor, reviewer, AI process, or DVE step. Provenance answers "whose work is this." Legal ownership, licensing, moral rights, folklore interests, and canonicity are **separate determinations recorded on separate axes** — provenance does not by itself establish any of them.

3. **Three distinct authorities — never collapsed.** A node carrying one authority never confers another. Canonical ≠ publishable; publishable ≠ owned; owned ≠ re-authored.
   - **Provenance authority** — whose work this is. Held by the contributor, resolved through a Helios-minted `contributor_ref`; the underlying durable `contributor_id` remains inside Helios unless a ratified private-identity contract permits otherwise. Within GAL, `contributor_ref` always means governed attribution resolved through Helios — downstream and public projections receive only the references the Helios identity-field scheme (ADR-012 as amended by ADR-017) allows. Inviolable.
   - **Canonicity authority** — whether content is accepted community language evidence (e.g. accepted Mandinka). Held by the designated sovereignty/linguistic authority. *[holders/process PENDING ratification by the designated sovereignty authority]*
   - **Publication / release authority** — whether AIWA permits release through its platform. This is an **internal governance gate; it does not by itself create copyright ownership or the legal right to publish.** Legal release additionally requires a valid rights basis (contributor license/assignment, guardian/lawful-representative consent where required, institutional authorization, folklore authorization or exception) under counsel-ratified policy. *[rights basis, minor capacity, folklore/state-trust interaction PENDING counsel + sovereignty authority]*

4. **Every node carries its own governance; minimum data only.** Each governed (private) node MUST carry, at minimum: `actor_ref` (a Helios-resolved reference that may map internally to `contributor_id`, `tutor_ref`, `reviewer_ref`, or a system-process ref), the actor's role, the authority axis asserted, timestamp, source-node reference, change type, consent state at creation, retention class, and review state. Each node stores the **minimum personal data necessary** for governance, safety, consent, and legal defensibility; durable identity stays inside the identity boundary unless a ratified policy permits otherwise. *(Exact field names/serialization are a cross-repo contract / repo-interior, not fixed here — see the [Cross-Repo Lineage-Node Contract](./cross-repo-lineage-node-contract.md).)*

5. **One model AND one governance state across the seam.** Every authoring, review, publication, export, or training surface uses ONE shared lineage model and ONE vocabulary. A repo MUST NOT mint a local model that another re-interprets. **No downstream system may consume, review, publish, export, or train on a node unless it evaluates the same governance state and policy gates as the source** — so material blocked from publication cannot leak into review or training.

6. **The published version is itself append-only.** "Which node is the published/current version at time T" is recorded as its own append-only history (preserving release audience, license code, takedown status, supersession state, and external-anchor proof) — so the system can answer "what was the official version on date X" in a dispute.

7. **One aggregate, many projections.** There is ONE governed artifact aggregate per artifact. All exports — human-readable (PDF/DOCX/HTML), public JSON, private provenance packet, Release Receipt, ArtifactGovernanceDeclaration — are **projections** of it, never independent sources of truth. A projection is *public* only after a re-identification-risk review; removing names or identity references is not sufficient on its own.

8. **Identity split (safeguarding + privacy).** Public projections MUST NOT expose real-world identity, the durable `contributor_id`, or the stable governed `contributor_ref` (any durable or stable handle is a cross-release tracking vector — for a minor, a safety failure). They carry only a non-correlating per-release `release_author_ref` plus artifact id, release id, version hash, and rights code. Public projections MUST also exclude **indirect identifiers** that could reasonably re-identify a minor — school, classroom, cohort, precise location/timestamps, rare dialect/community metadata, reviewer identity, stable cross-release handles — unless safeguarding + counsel approve the field. Both `contributor_id` and `contributor_ref` must be treated as **personal data wherever linkable** to a contributor, directly or indirectly, and stay inside the Helios identity+consent boundary.

9. **Adult-helper access is a safeguarding boundary.** Only known, vetted, AIWA-approved adults may touch a minor's work, resolved through Helios; no anonymous adult-to-minor artifact interaction. Enforceable access control (identity verification, RBAC, least-privilege, vetting status, access logs, safeguarding escalation, abuse-report/lockout) is specified in the Trust & Safety standard, which GAL references.

10. **Release Receipts are externally anchored.** A Release Receipt (and any publication/release node) MUST anchor the artifact hash to an external, independent source (RFC 3161 timestamp authority or equivalent immutable anchor), proof stored in the private provenance packet. External anchoring proves a hash **existed at a time** — not that the content is lawful, licensed, consented, canonical, non-infringing, or publishable. On anchor failure, the gate MUST block publication or hold an unreleased pending-anchor state. Ordinary draft nodes need not be anchored individually; they MAY be batched into periodically anchored checkpoints (Merkle root).

11. **Suggestion layers, no merged-edit ambiguity.** Original text, suggestions, accepted revisions, reviews, and published outputs are preserved as **distinct nodes**; collaboration MUST NOT collapse edits into one document with unclear authority. **AI-generated suggestions are non-provenance nodes unless and until accepted by a human actor**; acceptance creates a new human-action node referencing the AI suggestion (recording accepting actor, authority axis, consent state, review state). AI suggestions never alter authorship or provenance, and AI-assisted output is labeled as such.

12. **Canonical vocabulary (locked).** `GovernanceToken`, `Release Receipt`, `ArtifactGovernanceDeclaration`, `contributor_ref`, `consent_stage`. Specs and code MUST use these; loose terms ("DVE token", "evidence receipt", "public certificate") are conversational only. `contributor_ref` is the governed-lineage attribution reference; the durable `contributor_id` is **Helios-internal** (per ADR-012 as amended by ADR-017) and MUST NOT propagate into lineage nodes or specs except where that contract explicitly requires it; public projections carry only a non-correlating per-release `release_author_ref` and MUST NOT carry `contributor_id` or `contributor_ref`. Canonical vocabulary is an internal platform contract — these terms do not replace statutory registration, government authorization, court records, consent instruments, or legally required notices.

13. **Policy gates consume the registry — not hardcoded law.** Unresolved legal or sovereignty choices resolve through **versioned policy records referenced by ID**. Code depends on policy IDs and gate outcomes, never on hardcoded legal assumptions. (Build the seam, not the policy.)

14. **Conflict-of-law default.** Where multiple legal regimes may apply, the release/retention gate applies the **most restrictive applicable rule** until counsel ratifies a jurisdiction-specific policy.

## Artifact type determines which authorities attach

Each artifact MUST declare its purpose so the correct authorities attach; an artifact may be more than one. *Language-evidence* (e.g. a spelling attempt, contributed Mandinka) — canonicity applies; the Gambian folklore/state-trust regime *may* apply. *Original-authored work* (e.g. an adult poet's poem) — the author's copyright governs; canonicity may not apply unless contributed to the corpus. *Both at once* (e.g. an adult's original retelling of folklore) — author copyright *and* the folklore regime can attach. Folklore classification (non-folklore / language-evidence / identifiable expression of folklore / adaptation / mixed / needs-review) and its release constraints live in the Legal & Compliance standard.

## What team WordPad can plan against NOW vs. what is PENDING

**Plan now — approved structural direction:** append-only audit lineage with policy-controlled content; provenance inviolability; three separate authority axes; per-node governance with data minimization; one shared model + governance state at every seam (incl. training); published-head history; one-aggregate-many-projections with re-ID review; identity split incl. indirect identifiers; safeguarding gate; externally-anchored Release Receipts; AI-suggestions-are-non-provenance; policy-registry gates; conflict-of-law default; canonical vocabulary.

**Do NOT hardcode — resolve at the gate via the policy registry:** canonicity holders/process; rights basis, minor capacity, guardian consent, folklore/state-trust; retention schedule; erasure/takedown scope; jurisdiction (Gambian + California/US) applicability; cross-border transfer; controller/processor roles; AI-training eligibility.

## Open ratifications (route — do not assume)

- **Designated sovereignty authority:** who holds canonicity and by what process; rights defaults; how community-ownership intent sits against the Gambian Copyright Act 2004 folklore provision (expression-of-folklore vested in the Secretary of State, in trust for the people, in perpetuity).
- **Gambian counsel:** minor capacity for the Rights Agreement and guardian-consent mechanics; whether NCAC registration/deposit is required before publication (treat as evidentiary/administrative unless counsel says otherwise — registration does not create the copyright); folklore classification and exceptions.
- **Potential right-to-erasure obligations under Gambian data-protection law — urgent counsel review:** the Personal Data Protection and Privacy Act 2025 (Act No. 11 of 2025, assented 7 Nov 2025) *may* require erasure/restricted-processing for the students AIWA processes. Architecture must support it; exact scope, deadline, exemptions, and artifact categories are PENDING counsel. Sub-issues: corpus/weights tail (de-identification is a *mitigation, not a legal conclusion* — counsel confirms whether inputs/embeddings/weights remain linkable); statute conflict with folklore-in-perpetuity; exemption mapping.
- **California / US entity overlay (operator is a California corporation):** counsel determines whether CCPA/CPRA, COPPA (avoid US under-13 access without controls), California children's-privacy/design rules, FTC rules, education-privacy rules, nonprofit exemptions, service-provider/vendor contracts, and cross-border transfer apply — separately from Gambian obligations. Do not hardcode "CCPA applies."
- **Copyright notice-and-takedown — counsel-routed:** DMCA is US law and *may* become relevant because the operator is a California corporation that hosts/serves user content with a US nexus — not merely because something "touches the US." Maintain a notice/takedown/counter-notice/repeat-infringer workflow if seeking US safe harbor; map non-US regimes separately. (Responding to a notice is not legally mandatory; it preserves safe-harbor benefits where US law applies.)
- **Illegal content / CSAM — specially routed:** detected/reported illegal material bypasses the normal canonicity/rights gate, is quarantined and inaccessible to tutors/reviewers (vetted T&S/legal role only), and "removal" means removed-from-access with a restricted copy preserved for the legally required window, destroyed only on legal clearance — never immediate erasure. Operations (detection, mandatory reporting, preservation windows, destruction) live in the Trust & Safety standard; that pipeline MUST be in place before user image upload is enabled. Repos MUST NOT home-roll it.
- **Identity-field scheme — Accepted 2026-06-16:** the three-layer scheme — `contributor_id` (Helios-internal durable) → `contributor_ref` (governed-lineage attribution) → `release_author_ref` (non-correlating public) — is ratified as [ADR-017](../standards/decisions/ADR-017-three-layer-identity-reference-scheme.md), amending ADR-012. Helios still solely mints the durable identity; the change only stops the raw primitive propagating downstream, which strengthens the single-source-of-truth intent. GAL adopts this vocabulary; the identity vocabulary is locked.
- **Cross-repo lineage-node contract — Accepted 2026-06-16:** the concrete shape for clauses 4–5 lives at [contracts/cross-repo-lineage-node-contract.md](./cross-repo-lineage-node-contract.md). Consuming repos project into it; none mints a local variant.
- **Patent strategy:** see the Publication-control banner at the top. Disclosure-sensitive; clear external posting with patent strategy first.

## Provenance

Developed across the WordPad ↔ DVE governance review session and hardened against California, US, and Gambian legal-accuracy reviews. On acceptance, a ratifying ADR records the decision and the *structure* moves to **Accepted**; the legal, sovereignty, retention, and patent clauses remain individually pending until their owners ratify.


<!-- source: contracts/language-relationship-and-influence-context.md -->
# Platform Invariant — Language Relationship & Influence Context (LRPL-IC)

**Status:** Proposed — approved for internal standards routing. **Not Accepted.** Registry ID assigned on acceptance — *not* self-minted.
**Home:** `sparxstar-platform-standards` (this repo).
**Extends:** [Governed Artifact Lineage (GAL)](./governed-artifact-lineage.md) — adds required fields to the governed node (clause 4 capture floor) and conditions the canonicity axis (clause 3). Subject to GAL's identity split (clause 8), suggestion-layer rule (clause 11), and policy gate (clause 13).
**Applies to:** every repo that captures, stores, analyzes, governs, or projects a language event — WordPad, Prosody Reader, RLC, Dictionary, ESU/Yahura, Helios, Mḗh₁n̥s, and any future authoring or capture surface.

## Principle

The corpus captures the language people actually speak and write — not dictionary-correct forms. Every language event is descriptive evidence. Dictionary and spellcheck outputs are *curated projections* produced later, through review and governed promotion under the designated language authority. The system must not collapse "what was written" into "right / wrong" at the moment of capture.

## Clauses

1. **Relationship is per-contributor, per-language, per-event.** A contributor's relationship to a language is not a global identity label. It is captured for each language event, *as of that event*: native/community speaker, family-language speaker, oral-fluent emerging writer, second-language learner, teacher, reviewer, or system. A contributor may hold different relationships to different languages, and a relationship may change over time. The relationship recorded on a node is the one true at capture; it is **never** back-resolved from the contributor's later status. (Helios may hold the contributor's current per-language profile; the node carries the as-of-capture snapshot.) **Unknown / undeclared is a valid state, distinct from *none*** — the system records uncertainty rather than forcing a false label at capture.

2. **Source-Language Context (SLC) travels with the event where known.** Beyond the target-language relationship, each event SHOULD preserve the contributor's relevant other languages — native, family, schooling, community/market — that may shape the event. This is *captured context*, not inference. The **source of each relationship and SLC claim** MUST be recorded — user-declared, institution-declared, reviewer-supplied, system-inferred, or unknown — so the metadata's own provenance is never mistaken for established fact. (Carried on the node as `relationship_to_target_language` with `relationship_claim_source`, and `source_language_context` with `slc_claim_source`.)

3. **Descriptive capture — influenced forms are evidence, not errors.** The capture layer MUST NOT classify variation as error. Influenced spellings, code-switching, loanwords, translated structures, pronunciation-shaped spelling, and learner attempts are typed evidence. The raw contribution records what the contributor actually wrote, said, read, spelled, translated, or attempted.

4. **Influence Signal is derived, downstream, and non-canonical.** "This event shows Wolof phonology" is an inference, not a captured fact. The linguistic/analysis engine (ESU / Yahura, or the designated linguistic-analysis service) derives Influence Signals from the contribution + `relationship_to_target_language` + `source_language_context`; the capture layer does not. A derived Influence Signal is a system inference — lowest authority, never automatically canonical (GAL clause 11). It may support guided help, teaching diagnostics, corpus analysis, and sovereignty dashboards; it does not by itself decide canonicity.

5. **Canonicity weighting is policy-gated and sovereign.** How a relationship-type or influence pattern affects canonical weight is set by the designated language authority (Muhammed / AIWA) and resolved through the policy gate (GAL clause 13). The architecture carries the metadata and enforces whatever policy is set; it does **not** hardcode weights. The system *distinguishes* — native/community language evolution, learner interference, multilingual code-switching, borrowed/regional usage, school- and family-language influence — but does not *adjudicate* them at capture.

6. **Relationship and SLC are internal governed metadata.** `relationship_to_target_language` and `source_language_context` are personal and potentially identifying — especially for minors, where a detailed language profile (native + family + school language + cohort) can re-identify. They are internal evidence metadata, subject to GAL's identity split (clause 8): excluded from public projections, data-minimized, never a public handle.

## Separation of concerns

- **Capture layer (editor / Helios identity):** records the contribution + `relationship_to_target_language` + `source_language_context`, as-of-capture. Asserts nothing about correctness.
- **Linguistic / analysis engine (ESU / Yahura, or the designated analysis service):** derives Influence Signals and patterns — interference, code-switching, evolution. Inference, non-canonical. *(This is a linguistic function. It is **not** Mḗh₁n̥s, which is governance/enforcement — see the next bullet.)*
- **Sovereignty / governance (Muhammed sets policy; Mḗh₁n̥s + policy registry enforce):** sets and enforces how relationships and signals affect canonicity.
- **Dictionary:** the curated, prescriptive projection — produced later from the descriptive mass through sifting, review, and governed promotion.

## Consequence

- The corpus is fully **descriptive**; the Dictionary export is **prescriptive**. The same repo serves both without contradiction — the descriptive-capture / curated-projection split resolves the prescriptive-vs-descriptive tension that kills most language projects.
- Source-language context not captured *at the event* is lost forever. Capture is the only chance — which is why this is an invariant, not a later feature.
- Adds required fields — `relationship_to_target_language`, `relationship_claim_source`, `source_language_context`, `slc_claim_source` — to the [Cross-Repo Lineage-Node Contract](./cross-repo-lineage-node-contract.md) (already reserved by name; canonicity semantics finalize on LRPL-IC acceptance) and to the **ESU capture floor** (now `contributor_ref` + rights + `consent_stage` + `relationship_to_target_language` + `relationship_claim_source` + `source_language_context`-where-known + `slc_claim_source`-where-known).

## Referenced siblings / dependencies

- **[GAL](./governed-artifact-lineage.md)** — extends.
- **[Cross-Repo Lineage-Node Contract](./cross-repo-lineage-node-contract.md)** — carries the `relationship_to_target_language` + `relationship_claim_source` + `source_language_context` + `slc_claim_source` fields fixed here. Accepted 2026-06-16; language-event fields reserved by name, canonicity semantics finalize on LRPL-IC acceptance.
- **Canonicity weighting policy** (designated authority, via the policy registry) — the weights themselves, ratified *later*, after real data exists. NOT part of this invariant.

## Open ratifications

- Registry ID — on acceptance.
- **Analysis-engine repo confirmation** — this invariant assigns Influence-Signal derivation to the linguistic engine (ESU/Yahura) and explicitly *not* to Mḗh₁n̥s (governance). Confirm the exact owning repo if a dedicated linguistic-analysis service exists.
- **Canonicity weighting policy** — Muhammed / AIWA, later, data-informed. This invariant deliberately sets no weights.

## Provenance

Developed in the WordPad ↔ corpus governance session from the multilingual-user reality: the same classroom holds native writers, first-time-mother-tongue writers, and L2 learners; users move across Mandinka, Wolof, Fula, and family languages over time. Ratifying authority: platform-standards owner. Canonicity weighting reserved to the designated language authority.


<!-- source: contracts/spoken-audio-asset-to-records.md -->
# Contract: Asset → Records

**Status:** Proposed. Binding when [ADR-034](../standards/decisions/ADR-034-capture-experience-vs-audio-lifecycle-split.md) and [ADR-036](../standards/decisions/ADR-036-elicitation-pacing-is-not-acoustic-prosody.md) are Accepted.
**Home:** this registry.
**Sides:** the **Spoken Audio Node** (producer of assets and measurements) and **ESU** (holder of the reviewed linguistic record).
**Concretizes:** ADR-034's assignment of transcript and translation records to ESU, and ADR-036's separation of measurement from interpretation.

---

## Why this contract exists

The Node and ESU both hold things that look like "what was said". Without a
stated boundary the reviewed transcript ends up in two places, and the copy
that propagates is whichever one a consumer happened to query. One home per
fact needs a stated home.

## The line

| Thing | Owner |
| --- | --- |
| The stored audio asset and its immutable received bytes | Spoken Audio Node |
| Derivatives, waveforms, and other generated objects | Spoken Audio Node |
| **Acoustic measurements** — pitch, formant, intensity, duration | Spoken Audio Node |
| A machine transcript, as a processing artifact of an asset | Spoken Audio Node |
| **The reviewed transcript of record** | ESU |
| Translation | ESU |
| **Linguistic interpretation** of a measurement — tone, phrasing, what a contour means | ESU |
| Human correction and review state | ESU |

**The Node measures. ESU interprets.** A number is the Node's; what the number
means is ESU's. Neither statement is a courtesy: a measurement re-derived by
ESU, or a meaning asserted by the Node, is a defect in this seam.

## Rules

1. **The Node never holds the transcript of record.** It may carry a machine
   transcript as an artifact *of an asset*, clearly marked as unreviewed. A
   consumer that wants the transcript reads ESU, never the Node.
2. **ESU never stores audio.** It references the asset by the Node's
   identifier. Two copies of a recording is the drift ADR-034 exists to end,
   and duplicating a contributor's voice across services widens the
   sovereignty surface for no gain.
3. **A measurement carries the capture profile of the asset it came from**
   (per the sibling capture contract and ADR-035), so ESU can tell whether the
   material was admissible for the claim being made from it. A measurement
   taken from an asset with no recorded profile is not admissible evidence for
   an interpretation.
4. **Attribution travels.** Author attribution accompanies every token that
   reaches ESU; the Node strips nothing that ESU needs to attribute a
   contribution, and adds no identity ESU should not hold. Existing identity
   invariants govern which reference form is carried — this contract does not
   restate them and does not create a new one.
5. **Interpretation never flows backwards into the asset.** ESU's review state
   does not mutate the Node's stored object or its measurements. The asset is
   immutable; a correction is a new ESU record, not an edit to the recording.

## Forbidden on this seam

- The Node exposing a "transcript" endpoint that a consumer could mistake for
  the reviewed record.
- ESU re-running acoustic analysis rather than reading the Node's measurement.
- Either side minting an identifier for the other's object.
- A third service reading the machine transcript and publishing it as though
  it were reviewed.

## Owed before this contract is Accepted

1. **The asset identifier's shape and where it is minted.** The capture
   contract has the client minting a UUID at capture; whether that value is the
   durable asset id, or the Node mints its own and maps to it, is not decided.
   Owed by the Spoken Audio Node's builder — and it must be decided before ESU
   stores a reference, or ESU will store the wrong one.
2. **The measurement record's shape** — which measurements exist, their units,
   and their precision. Owed by the acoustic-analysis owner. This is the same
   gap OQ-021 names on the capture side; a measurement's admissibility floor
   and its serialization are one decision, not two.
3. **The delivery direction** — whether ESU pulls measurements or the Node
   emits them, and the ordering guarantee either way. Owed jointly. Existing
   platform rules on terminal outcomes before delivery apply to whichever shape
   is chosen; this contract does not restate them.

**No repository implements a guess at items 1–3.**

## Enforcement

A shared conformance suite binding both sides to the same cases, as with the
capture seam. It does not exist yet; neither does the Node.


<!-- source: contracts/spoken-audio-capture-to-ingestion.md -->
# Contract: Capture → Ingestion

**Status:** Proposed. Binding when [ADR-034](../standards/decisions/ADR-034-capture-experience-vs-audio-lifecycle-split.md) and [ADR-035](../standards/decisions/ADR-035-capture-profiles-not-a-platform-audio-ceiling.md) are Accepted.
**Home:** this registry.
**Sides:** the **capture UI package** (producer) and the **Spoken Audio Node** (consumer).
**Concretizes:** ADR-034's role split at the point where a recording leaves the browser, and ADR-035's requirement that a capture profile travel with the asset.

---

## Why this contract exists

ADR-034 divides the stack but does not say what crosses the seam. Without that,
each side invents its own answer and the split reproduces the drift it was
filed to end. This states what the producer must send and what the consumer
must accept, in the terms both sides can verify in their own code.

## Division of responsibility

| Step | Owner |
| --- | --- |
| Microphone access, recording, local/offline handling, capture UX | capture UI package |
| Chunked upload client (retry, resume, backoff) | capture UI package |
| Receiving, validating, and acknowledging chunks | Spoken Audio Node |
| Integrity verification, immutable object storage, derivatives, quality measurement, processing jobs | Spoken Audio Node |

**The producer never writes to object storage directly, and the consumer never
opens a microphone.** Neither side re-implements the other's step.

## Terms fixed by existing code

These are read from the producer's working tree, not proposed. Both sides build
to them; either side changing one is a change to this contract.

- **Resumable chunked upload.** The producer uses TUS (`tus-js-client`). The
  consumer exposes a TUS-compatible endpoint.
- **Chunk size is capped at 512 KB** and clamped by the producer. A larger
  chunk is a producer defect.
- **Per-chunk checksums are mandatory**, `sha256` as the producer currently
  sends. A chunk whose checksum is missing or does not verify is **not
  discarded**: the consumer persists what it received, marks the asset's
  integrity as failed, and does not treat it as a clean source. Refusing intake
  would contradict ADR-011's unconditional-capture rule, which this contract
  applies to integrity exactly as it applies to a missing profile below — the
  speaker does not lose their recording because a byte range disagreed.
- **Every asset carries a client-minted UUID** (`crypto.randomUUID()`),
  transmitted as upload metadata. The producer refuses to run in a context
  where secure UUID generation is unavailable rather than falling back.
- **There is no full-file upload endpoint.** Adding one is forbidden on both
  sides: it defeats resumability on the networks this platform is built for.

## Terms fixed by ADR-035

- **A capture profile travels with the asset** — `conversation`,
  `documentation`, or `import` — recorded on the asset by the consumer so a
  later reader can tell whether a measurement taken from it is admissible.
- **An asset that arrives with no profile is stored, and is not admissible as
  a source for acoustic measurement.** It is not rejected: ADR-011's
  unconditional-capture rule holds, so the material is kept and the limitation
  is recorded, never used as grounds to discard a contributor's recording.
- **The consumer performs no transcode on the ingestion path.** `import` means
  the artifact is preserved as received. Derivatives are additional objects;
  the received bytes are immutable.
- **The consumer never applies a platform-wide sample-rate, bitrate, channel
  or codec ceiling.** Constraints belong to the profile the product chose.

## Forbidden on this seam

- The producer reaching a CMS. The endpoint is currently CMS-shaped
  (`/wp-json/…/tus` in the producer's tree); under ADR-034 the endpoint becomes
  configuration supplied by the host, and the producer keeps no CMS path,
  nonce, or page global.
- The consumer rendering anything, or holding the reviewed transcript — that is
  ESU's, per the sibling contract.
- Either side keeping a second editable copy of the other's source files.

## Owed before this contract is Accepted

Neither side may invent the other's shape. Each item is owed by the named side,
from its own code, and this document is corrected from those answers:

1. **The consumer's endpoint path and auth model.** Owed by the Spoken Audio
   Node once it exists. Until then the producer treats the endpoint as injected
   configuration with no default.
2. **The upload metadata key set.** The producer sends `upload_uuid` plus
   product-supplied keys today; the agreed minimum set, and the profile's key
   name, are owed jointly and belong here once both sides can name them.
3. **The acknowledgement and error envelope**, including which failures the
   producer must retry and which are terminal. Owed by the consumer.
4. **Whether `sha256` remains the checksum algorithm.** It is what the
   producer sends today, having been raised from `sha1` in the producer's
   hardening work. The consumer must confirm it verifies the same algorithm.
   Owed by the consumer, and a change here is a producer change too.

Routes to the Spoken Audio Node's builder and the capture UI package's builder
jointly. **No repository implements a guess at items 1–4**; that is how phantom
identifiers ship.

## Enforcement

One shared conformance suite, run by **both** sides against the same cases — an
upload the producer generates and the consumer accepts. Two suites that agree
today is the failure mode this replaces. The suite does not exist yet; it is
part of standing up the consumer.


<!-- source: contracts/the-locket-no-provider-held-key.md -->
# Platform Invariant — The Locket: No Provider-Held Key to User Content

**Status:** Draft — for Chief Architect / maintainer ratification. **Not Accepted.** Until Accepted, `WPAD-ADR-005` remains `Proposed — blocked`.
**Home:** this registry (`sparxstar-architecture-governance-registry`, `standards/invariants.md`) is the cross-repo source of truth for this invariant. Repos reference it by ID; they do not restate it.
**Invariant ID:** `INV-0NN` — placeholder. The platform registry owner assigns the real number on merge. Do not let any repo cite a fabricated number before then — cite "the pending Locket invariant" until this is Accepted and numbered.
**Ratifying ADR:** assigned on acceptance — not self-minted (collision discipline).
**Applies to:** Helios (identity/key authority — must never emit raw user-content key material; a key manager that returns `rawKey` violates this), ESU / Sky (intake — receives disclosed content via explicit wrap only), Dheghom (vault — stores ciphertext), and every client that holds user content, of which WordPad is the first concrete Locket implementation.
**Cross-references:** `WPAD-ADR-005` (WordPad-scoped record citing this invariant); `WPAD-THREAT-MODEL-v0.5` (the analysis that surfaced the ruling, including the client-integrity and key-distribution boundaries below).

## Statement

Sparxstar holds no key material capable of decrypting a user's individual content, and operates no mechanism that can produce such material — except a per-item wrap that the user's own client creates as an explicit, recorded act of disclosure.

This is the cryptographic form of Layer 0 — The Locket in `SPARXSTAR_AIWA_Platform_Vision_v3`: "Zero-knowledge posture. The platform cannot read Locket contents. Data is encrypted client-side; the decryption key never leaves the device secure hardware enclave (FIDO2/WebAuthn)," with movement out of the Locket defined there as "an affirmative sovereignty event — a specific, cryptographically provable act of disclosure." This invariant does not introduce new policy; it formalizes that committed principle as an enforceable platform rule and names the point at which the sole exception applies.

## What this requires of every component

1. **Encryption and key derivation happen on the user's device.** The key that decrypts a user's Locket content is derived and held client-side. No server receives it, derives it, escrows it, or can reconstruct it.
2. **Backend services see only ciphertext, wrapped keys, or hashes.** Storage (object stores, key stores), sync, and transport carry opaque material. A total breach of any backend surface yields no readable user content, except for the narrow set of items a user has already disclosed under requirement 3 — a breach cannot newly decrypt anything the user has not affirmatively disclosed.
3. **The only decryption Sparxstar may perform is on content the user has explicitly disclosed to it**, by that user's client creating a wrap to a named Sparxstar processing key, for a named purpose. Absent that per-item wrap, Sparxstar cannot decrypt — not "does not," cannot. Any statement of the form "Sparxstar can never read your content" is therefore false for disclosed items and true for everything else, and must be worded that way wherever it is made.
4. **No provider-held recovery or escrow key.** Recovery redundancy for a user's own access runs through user-held material only (a user recovery key, the user's other devices, future user/device identity keys). No Sparxstar-held backup key, and no standing institutional escrow key, may wrap a user's content. An institution (e.g. a school) that participates in a user's world does so as an ordinary recipient of items the user explicitly shares — never as a silent holder of standing decryption capability over the user's account.
5. **Disclosure is recorded and irreversible in the honest sense.** The affirmative act that creates a disclosure wrap is logged as an event. Note plainly, in any product surface, that disclosure cannot be cryptographically retracted after the fact: rotating or removing a wrap protects future items, not what a recipient has already received.

## Rationale

- **Sovereignty is a property, not a promise.** A capability that exists can be compelled — by legal process, by a compromised insider, by a future operator. The Vision's founding claim ("a promise is worthless; a cryptographic guarantee is not") holds only if the guarantee is structural. Custody of a key converts the guarantee back into a promise. This invariant forbids that custody.
- **It relocates rather than removes legal pressure, and honesty about that is part of the invariant.** Removing provider keys means compelled disclosure of stored content yields ciphertext. It does not make the platform warrant-proof: the code Sparxstar serves (client-integrity) and the identity keys it publishes (key-distribution) remain pressure points. No component or claim may assert warrant-proofness. See Boundaries.

## Boundaries — what this invariant does NOT claim

- **It does not claim client-integrity.** The guarantee holds only while the client code the user runs is honest. A compromised or compelled build defeats it regardless of what the client would otherwise refuse to send. Components delivered as web/browser code must treat verifiable delivery (signed/pinned builds, transparency) as a separate, tracked obligation — it is not granted by this invariant.
- **It does not claim key-distribution integrity.** When one user wraps content to another user's or a service's public key, that public key is asserted by Sparxstar's identity layer. A dishonest directory can substitute keys at share time. Mitigations (key transparency, first-use pinning) are a separate obligation.
- **It does not govern metadata.** Titles, sizes, timestamps, and the share graph are outside "content" unless a component explicitly encrypts them. Components handling user content should minimize and, where feasible, encrypt metadata; this invariant does not by itself require it.
- **It does not govern collective/community layers.** This invariant is Layer 0 (individual sovereignty). The Vision's outer layers (Community / Briefcase and beyond) have their own governance; content that a user has moved out of the Locket via an affirmative sovereignty event is governed by the layer it moved into, not by this invariant.

## Consequence — what is now forbidden

- Any server-side path that derives, receives, escrows, or reconstructs a user's content-decryption key.
- Any provider-held or institution-held standing key that can decrypt a user's content without that user's per-item disclosure wrap.
- Any product or marketing statement asserting Sparxstar "can never read" user content without the disclosed-items exception, or asserting warrant-proofness.
- (Named for Helios specifically, per Applies to above:) returning raw user-content key material from a key-management call. Helios may hand back only material the client unwraps locally.

## Open / to confirm at ratification

- Assign the real invariant number.
- Confirm the exact Vision passage and section id to cite (Layer 0 / The Locket) so the citation is stable, not a page reference.
- Confirm whether any existing component (notably Helios's `rawKey` path, flagged in WordPad's D7) is currently in violation and needs a remediation item opened against it in the same ratification.

## Provenance

Maintainer ruling, session of 2026-08-10 (recorded in `WPAD-THREAT-MODEL-v0.5` §0.1). Grounded in `SPARXSTAR_AIWA_Platform_Vision_v3`, Layer 0 ("The Locket"), which marks the Locket's form as `[OPEN]` while its principle is locked — this invariant formalizes the locked principle.

