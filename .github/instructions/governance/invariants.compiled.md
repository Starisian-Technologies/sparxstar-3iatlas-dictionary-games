# Invariants — Auto-synced from registry@ea4e3d4
# DO NOT EDIT

# Platform Invariants

Rules that must hold across all repos or the data stops being trustworthy.
Each is falsifiable, attributed, and permanent unless superseded by an ADR.
Numbering is sequential and append-only.

Long-form structural contracts (e.g. GAL, LRPL-IC) live as their own
documents under `contracts/`. This file holds the short, falsifiable
rules; long-form contracts are referenced by ID and path, not copied.

---

## INV-001 — Communication is sign evidence, not carrier type

AIWA treats sound, mark, handwriting, image, drawing, gesture, rhythm, color,
movement, place, and other observable forms as possible sign carriers. A
carrier becomes communication evidence only when linked to context, perception,
response, recurrence, or reviewed interpretation. The system stores signs as
evidence, not automatic truth. The evidence-first pipeline (attestation →
review → acceptance) is this rule's enforcement; no new carrier type bypasses
it.

*Source: Session decision 2026-06-11 · Related: ADR-007.*

## INV-002 — Communication sustains shared reality

AIWA treats language, image, sound, writing, gesture, proverb, story, map,
book, archive, and other signs as ways communities construct, preserve,
contest, and transmit shared reality. Human communication is not the only
meaningful communication, but human cultures externalize and archive shared
reality at unusual density and scale. This is the apex principle above the
lexical, morpheme, and visual evidence specs; INV-001 is its operational
companion.

*Source: Max Barrett, session 2026-06-11 ("to preserve a social construction
of a shared reality").*

## INV-003 — No graph store is ever the system of record for contributor evidence

Graph engines, views, and caches are derived projections rebuilt from canonical
relational tables. Nothing is writable in a projection that is not first
written canonically.

*Source: ADR-001.*

## INV-004 — Reference-zone isolation

Reference/Comparative-zone tables never contain contributor_ref, speaker_ref,
consent_ref, location references, or media refs. They may reference canonical
linguistic identifiers only (entry_id, variant_form_id, morpheme_id,
concept_id, sense_id, language refs) plus source_ref citations. The Governed
Evidence zone may hold read-only pointers into the Reference zone (e.g.
root_id); the reverse direction toward contributor-linked records is forbidden.

*Source: ADR-002.*

## INV-005 — No orphan timed tokens

Every timed_tokens row must resolve, through a guaranteed join path, to all of:
speaker_ref, location_id, observed_at, language_bcp47, and a source
artifact/attestation. Ingestion that cannot satisfy the path is rejected, not
stored.

*Proposed amendment filed 2026-06-11:* *Reconciliation with ADR-011:*
"rejected" means **not admitted to the governed store** — it does not mean
denied or destroyed. Ingestion that cannot satisfy the join path is
**quarantined pending enrichment** (Machine Door save-first semantics, ADR-008, ADR-011). The contribution is preserved; admission waits on the missing
join-path fields. Carrier handling inside quarantine remains
RetentionClass-governed per ADR-013 — quarantine extends no retention rights.

*Source: ADR-005. Proposed reconciliation clause filed 2026-06-11; cites
ADR-008, ADR-011, ADR-013.*

## INV-006 — Recurrence promotion

origin_status may move to `inherited` only with a populated evidence link
(sound_correspondence_id, comparative source_ref, or expert review record).
Recurrence frequency alone never changes origin_status. Automated pipelines may
propose; only reviewed judgments promote.

*Source: ADR-006.*

## INV-007 — Connection types are distinct and never collapse into one edge type

concept_id connects words by meaning. cognate_set_id connects forms by
inheritance/historical relatedness. borrowing_events connect forms by contact
and loan history. language_attestations connect forms to real usage by speaker,
place, time, and context. Any graph projection must preserve these as typed,
separate edge classes.

*Source: Session decision 2026-06-11 · Related: ADR-001, ADR-002.*

## INV-008 — Cognate judgment target exclusivity

Each cognate_judgments row references exactly one of entry_id or
variant_form_id (XOR, enforced by check constraint).

*Source: Session decision 2026-06-11 · Related: ADR-003.*

## INV-009 — Deny nothing; quarantine instead (amended by ADR-013)

No authorized capture path may refuse a contribution, and no policy may delete
a CONTRIBUTION (transcript, translation, alignment, blueprint, revision DAG,
confidence, receipts — the sign evidence). Capture always results in a vault
write; incomplete governance produces quarantine states and data-requirement
signals, never refusal. The governance outcome vocabulary is exactly
quarantine ↔ promote. Removal paths are exactly two: contributor-initiated
consent revocation (destruction receipts, tombstone per ADR-012), and the
lawful-destruction carve-out for illegal content (ADR-013 §4). Raw biometric
CARRIERS are separately governed by RetentionClass: retention requires
positive consent; absence of consent resolves to ephemeral and the densest
lawful derivative becomes canonical (ADR-013).

*Source: ADR-011, amended by ADR-013 (2026-06-11).*

## INV-011 — A signal routes the concern; a record carries the measurement

A ReviewSignal is a typed observation that routes attention; a
ConfidenceRecord (or equivalent measurement structure) carries the underlying
measurement. No measurement may live only inside routing language: every
emitted signal that is threshold-derived must travel with the measured value
in its record. Applies platform-wide, beyond ESU.

*Source: Owner ruling, ESU conformance session 2026-06-11 (sky-esu v3.1
"platform law"); recorded here as its one home.*

## INV-010 — One identity authority; opaque refs everywhere

Helios is the sole minting authority for contributor_id. contributor_id is
suite-wide and durable for life. account_id never appears in evidence records
or on any wire beyond the auth layer. All systems other than Helios see only
opaque contributor/speaker/writer references; the real-identity linkage table
exists in Helios alone. Computed scores attach only to sessions and artifacts,
never to persons.

*Source: ADR-012 (founder decision, captured 2026-06-11).*

## INV-012 — Governed Artifact Lineage (GAL)

> **Publication control:** this draft may contain disclosure-sensitive material adjacent to patent strategy. Do NOT publish externally — including into a public standards repo — until patent counsel approves.

**Status:** Proposed — approved for internal standards routing. **Not Accepted.** Legal, sovereignty, retention, and patent-publication clauses pending ratification.
**Long-form contract:** [contracts/governed-artifact-lineage.md](../contracts/governed-artifact-lineage.md) — the full 14-clause normative invariant, definitions, applicability, and open ratifications live there.
**Applies to:** every repo that creates, edits, suggests on, reviews, promotes, publishes, stores, exports, or trains on a governed artifact.

In one line: a governed artifact has one append-only audit lineage with policy-controlled content; three never-collapsing authority axes (provenance / canonicity / publication); one shared node shape across every seam (the [Cross-Repo Lineage-Node Contract](../contracts/cross-repo-lineage-node-contract.md)); identity is split with `release_author_ref` on public projections (per ADR-012 as amended by ADR-017); legal/sovereignty choices resolve through a versioned policy registry, never hardcoded law.

*Source: WordPad ↔ DVE governance review session, 2026-06-16. Relates to ADR-012 (as amended by ADR-017).*

## INV-013 — Sovereignty and identity schemas are validated by a complete JSON Schema implementation, never hand-rolled

**Status:** Proposed — filed 2026-06-21.

Any schema that governs identity boundaries, sovereignty rules, or public-projection exclusions (including `governed-lineage-node.schema.json` and any successor) must be validated by a complete JSON Schema implementation (e.g. AJV draft-2020-12) that correctly enforces `additionalProperties`, `if/then/else`, `unevaluatedProperties`, and all other constraint keywords. Hand-rolled validators on sovereignty boundaries are prohibited: a partial implementation silently passes what it does not check, which is the worst failure mode on an identity or sovereignty gate. The enforcement workflow must install the validator as a declared dependency, not inline it.

*Source: Governance session 2026-06-21. Precipitated by the discovery that an inline validator on the public-projection exclusion rule was not enforcing `additionalProperties: false` or the `if/then/else` conditional, leaving unknown identity-linked fields undetected on public-projection nodes.*

## INV-014 — The Locket: No Provider-Held Key to User Content

**Status:** Draft — for Chief Architect / maintainer ratification. **Not Accepted.** Until Accepted, `WPAD-ADR-005` remains `Proposed — blocked`.
**Long-form contract:** [contracts/the-locket-no-provider-held-key.md](../contracts/the-locket-no-provider-held-key.md) — full statement, per-component requirements, rationale, boundaries, consequences, and open ratification items live there.
**Applies to:** Helios, ESU / Sky, Dheghom, and every client that touches individual user content, of which WordPad is the first concrete Locket implementation.

In one line: Sparxstar holds no key material capable of decrypting a user's individual content, and operates no mechanism that can produce such material, except a per-item wrap that the user's own client creates as an explicit, recorded act of disclosure — the cryptographic form of Layer 0 / The Locket in `SPARXSTAR_AIWA_Platform_Vision_v3`. It does not claim client-integrity or key-distribution integrity, and no component may assert warrant-proofness (see long-form contract, "Boundaries").

*Source: Maintainer ruling, session of 2026-08-10 (recorded in `WPAD-THREAT-MODEL-v0.5` §0.1). Grounded in `SPARXSTAR_AIWA_Platform_Vision_v3`, Layer 0 ("The Locket").*

## INV-015 — A credential is valid for exactly one resource, in exactly one class

Every protected resource validates its own exact expected audience and accepts
nothing else. Five failures, all closed:

- **Missing** — a token with no `aud` claim is refused.
- **Array-valued** — a token whose `aud` is a list is refused, *including* when
  the list contains this resource's own audience. A library check satisfied by
  membership is not sufficient: the claim must be a scalar, and it must match.
- **Wrong resource** — an audience that is not this resource's expected
  audience is refused, whether or not it is valid elsewhere.
- **Wrong class** — a credential of one class is refused where another class is
  expected, **even if every other claim appears valid**. A human session is not
  an offline authorization, an offline authorization is not a vault grant, and
  a machine token is none of them.
- **Server presentation of an offline authorization** — a `wordpad-offline`
  credential presented to Identity, Key Vault, the Dictionary, the RLC node or
  any synchronization endpoint is refused. It is valid only for local WordPad
  unlock.

The four classes are issued by different policies and are never substitutable:
the human session audience is a fixed scalar (`atlas-api`); machine and service
audiences are selected by Identity from a server-controlled per-client
`allowed_audiences` list; `wordpad-offline` and `key-vault` are separately
issued classes with their own claim bindings. In no class may a caller name an
audience and receive a token minted with it.

Falsifiable per service: present a credential minted for another resource, or
for another class, and it must be refused on class and audience alone, before
any other check succeeds.

Governed identifiers, claim bindings and offline lifetimes:
[ADR-020](decisions/ADR-020-token-class-audiences.md). Repositories consume
these identifiers; they never define them.

## INV-016 — A client renders settled awards; it never infers one

**Status:** Accepted 2026-09-05, on ratification of ADR-029. Binding
platform-wide.

No client may originate, compute, or infer earned value. A points total, a
star, a badge, a gold amount or a placement appears in a client only because an
authoritative settlement response from the RLC Node engine returned it, carrying
an identifier. *What* that identifier is, and who mints it, is OQ-017 and is
deliberately not decided here; this invariant requires only that one be present
in the response, whatever shape OQ-017 settles on. A client may hold display metadata for an
identifier — a name, an icon, a description, a localization key — and may
decline to render an identifier it does not recognize. It may never derive the
award itself from round performance, elapsed time, placement, answer counts,
dictionary content, or any other local signal.

Two further rules follow, and they are distinct:

1. **Render an award surface only when the settlement response carries at least
   one recognized identifier.** An empty awards panel is not a neutral
   container — to a learner it reads as a verdict on the round they just
   finished. Show nothing rather than an empty something.
2. **Absence of a settlement response is not evidence of zero awards.** A
   request that failed, timed out, or has not returned yet means the client
   does not know what was earned. It may say that; it may not present "you
   earned nothing", which is a claim about the ledger the client is in no
   position to make.

The reason is not cosmetic. An inferred award is an unbacked claim: it has no
ledger row, it cannot be reconciled, it disagrees with the same player's totals
on a second device, and it teaches a learner that the reward is theatre. Two
independently editable award catalogues — one client-side, one server-side —
are the same defect one step earlier, and are equally forbidden; a client
catalogue is a rendering of the server's vocabulary, never a second opinion
about it.

*Source: ADR-029 (chief-architect draft, 2026-09-05), raised during the
Dictionary Games UX and progression review.*

## INV-017 — A Key Vault operation proceeds only against a grant issued for that exact operation

**Applies to:** the Key Vault as sole verifier, the Identity Node as sole
issuer, and every client that reaches the Key Vault.

Every Key Vault request **fails closed** unless it carries an Identity-issued
token satisfying all of:

- **Scalar `aud` of `key-vault`.** Not an array, not absent, not another class.
- **Exact subject and path match.** The grant names what it acts on; a grant for
  one subject or path is refused for any other.
- **Exact operation match.** The grant names one operation. A grant is never a
  general capability, and an operation not named in it is refused.
- **Valid `iat`, `nbf` and `exp`.**

**No other credential substitutes.** Session, offline, provisioning, machine and
array-audience tokens are each refused, whatever else about them is valid. This
is INV-015's cross-class rule applied at the Vault's door, stated separately
because the Vault is where substitution would be most costly.

Every **destructive** operation additionally requires:

- **The expected manifest version**, bound in the grant, so a captured grant
  cannot be replayed against a manifest that has moved.
- **A transaction ID**, bound in the grant.
- **A grant lifetime of at most five minutes.**
- **A single-use `jti`, consumed atomically before any mutation.** Consumed
  before, not after: a consume-after ordering makes the mutation the thing that
  races.

**On any failure — replay, mismatch, expiry, or a missing claim — stored key
material is unchanged.** No partial mutation, no best-effort completion. A
refused request must be indistinguishable from one that never arrived, as far
as stored key material is concerned.

**Enforced by one shared contract test suite**, run against **both** Identity's
grant issuance and the Key Vault's verification. Two suites that agree today are
the failure mode this replaces: the contract is only real where a single set of
cases binds issuer and verifier to the same answers. A repository that
implements either side without running that suite has not satisfied this
invariant.

*Source: Owner ruling, 2026-09-05, following the removal of an invented
`key-vault` grant before it shipped. Wire contract:
`sparxstar-contracts-registry`,
`Contracts/sparxstar-3iatlas-identity-node/`. Shared conformance vectors:
`Contracts/sparxstar-3iatlas-identity-node/conformance/vectors.json` in that
registry — the same path the assertion rationale cites.*
