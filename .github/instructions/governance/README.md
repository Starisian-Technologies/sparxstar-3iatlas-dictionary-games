# Governance snapshot (auto-synced — do not edit)

This folder is populated by the `governance-sync` workflow in the ADR registry
repo (`Starisian-Technologies/sparxstar-architecture-decision-record`). When a
decision, invariant, or open question changes on that repo's `main` branch, the
workflow compiles the snapshot and pushes it here via the
`sparxstar-contract-sync` GitHub App.

Expected files once the sync has run:

```
adr-reference.compiled.md
invariants.compiled.md
open-questions.compiled.md
governance-snapshot.json
```

**Do not edit these files and do not commit local changes to them — they are
overwritten on every sync.** If they are missing, the sync has not run yet;
ask the owner to trigger `governance-sync` from the ADR registry's Actions tab.

This placeholder README is the only hand-maintained file in this folder.
