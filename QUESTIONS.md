# QUESTIONS.md

Questions raised during initial repo setup. Please answer inline or in a
follow-up message.

> **Status, 2026-08-25.** The deployment work answered Q1, Q2 and Q3 in code;
> their answers are recorded under each. Q4, Q5 and Q6 are still open.

---

## Q1 — Composer / PHP

The problem statement mentioned setting up Composer. This repo contains only React/JS source — no PHP, WordPress plugin files, or server-side code (confirmed by `AGENTS.md`: _"pure consumer of the dictionary REST API. It does not contain WordPress code, PHP, or any server-side logic"_).

**Is a Composer setup needed?**
Options:

- a) No — this repo is JS-only; Composer belongs in the consuming WordPress plugin repo.
- b) Yes — a `composer.json` is needed (e.g. to publish as a Packagist package, or because a `plugin.php` wrapper will be added here).

**ANSWERED (a) — 2026-08-25.** No Composer. The two `backend/*.php` files that
made this look ambiguous were historical drafts of an endpoint the dictionary
repo already implements, and were removed (spec §12.8). There is now no PHP in
the repo at all.

---

## Q2 — WordPress Plugin Wrapper

Is a `plugin.php` (or similar WordPress plugin bootstrap) expected in this repo, or is the built `dist/` consumed by another plugin repo (e.g. `sparxstar-3iatlas-dictionary`)?

**ANSWERED — 2026-08-25.** No plugin bootstrap. `dist/` stays a UMD bundle other
hosts mount. The repo now _also_ ships its own first-party host — the
`games.sparxstar.com` website (`src/site/`, `dist-site/`) — but it is a static
site behind Nginx, not a WordPress plugin. See spec §12.

---

## Q3 — CSS Entry Point

No CSS file is imported in `src/index.jsx`. Tailwind and PostCSS are configured in the webpack pipeline.

**Should a CSS entry point be added** (e.g. `src/styles.css` with `@tailwind base/components/utilities`) so the Tailwind utility classes used in the game components are bundled into `dist/css/rlc-games.min.css`?

**ANSWERED — 2026-08-25, and the answer is "it depends which build".** The
_package_ still ships no CSS entry: a host that mounts `<GameShell />` supplies
the Tailwind runtime, and bundling a second copy into the UMD artifact would
collide with the host's. The _website_ is such a host, so it owns one —
`src/site/styles.css`, compiled by the site build only. `tailwind.config.cjs`
already scans `./src/**`, so the same content glob covers both the site chrome
and the game components. See spec §4 and §12.1.

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
