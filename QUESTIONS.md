# QUESTIONS.md

Questions raised during initial repo setup. Please answer inline or in a follow-up message.

---

## Q1 — Composer / PHP

The problem statement mentioned setting up Composer. This repo contains only React/JS source — no PHP, WordPress plugin files, or server-side code (confirmed by `AGENTS.md`: *"pure consumer of the dictionary REST API. It does not contain WordPress code, PHP, or any server-side logic"*).

**Is a Composer setup needed?**
Options:
- a) No — this repo is JS-only; Composer belongs in the consuming WordPress plugin repo.
- b) Yes — a `composer.json` is needed (e.g. to publish as a Packagist package, or because a `plugin.php` wrapper will be added here).

---

## Q2 — WordPress Plugin Wrapper

Is a `plugin.php` (or similar WordPress plugin bootstrap) expected in this repo, or is the built `dist/` consumed by another plugin repo (e.g. `sparxstar-3iatlas-dictionary`)?

---

## Q3 — CSS Entry Point

No CSS file is imported in `src/index.jsx`. Tailwind and PostCSS are configured in the webpack pipeline.

**Should a CSS entry point be added** (e.g. `src/styles.css` with `@tailwind base/components/utilities`) so the Tailwind utility classes used in the game components are bundled into `dist/css/rlc-games.min.css`?

---

## Q4 — pnpm Workspace

Is this repo intended to be a standalone package, or will it become part of a pnpm monorepo workspace alongside other Starisian packages?

---

## Q5 — Spec Documents

`AGENTS.md` references several spec documents expected in `.github/instructions/` (role/pipeline, multilanguage model, enrichment fields, approved entry format). These were not in the zip.

**Should these be ported in from the parent dictionary repo, or will they be maintained separately?**

---

## Q6 — Test Coverage Target

Are there minimum Jest coverage thresholds to enforce in CI (e.g. 80 % lines)?
