# Deploying Dictionary Games (`games.sparxstar.com`)

A static site. There is no application server, no database, and no secret to
manage — the browser talks directly to the dictionary, the Identity Service and
the game engine, all of which are already deployed.

Do these in order. **Step 1 is configuration on two other services, and nothing
works without it**, so do not leave it until after the site is up.

| #   | Piece                     | Where                               |
| :-- | :------------------------ | :---------------------------------- |
| 1   | CORS on Identity + engine | their deployments (env change only) |
| 2   | Build the site            | CI or a workstation                 |
| 3   | Serve it                  | container, or the existing droplet  |
| 4   | Verify                    | `scripts/browser-check.mjs`         |

---

## 1 · CORS — the step that is easy to forget

Both services answer CORS from an **exact-match origin allowlist**. Neither
needs a code change; both need `https://games.sparxstar.com` added to their
deployed configuration.

| Service                 | Repo                                | Variable     |
| :---------------------- | :---------------------------------- | :----------- |
| `id.sparxstar.com`      | `sparxstar-3iatlas-identity-node`   | `UI_ORIGINS` |
| `rlc-api.sparxstar.com` | `sparxstar-3iatlas-rlc-node-engine` | `UI_ORIGINS` |

`UI_ORIGINS` is comma-separated and **additive** to `UI_ORIGIN` — the parser in
both repos unions the two and de-duplicates. So:

```
UI_ORIGIN=https://wordpad.sparxstar.com        # leave exactly as it is
UI_ORIGINS=https://games.sparxstar.com         # add this
```

**Do not move the Games origin into `UI_ORIGIN`.** That would displace WordPad
and break its sign-in. Add, never replace.

Exact match means scheme, host and port, with **no trailing slash** and no
wildcard. Both services must keep `credentials: false` — emitting
`Access-Control-Allow-Credentials` is a platform red line.

**Symptom if you skip this:** sign-in and score settlement fail in the browser
with a CORS error, while every server-side health check and every `curl` passes.
It looks like a client bug and is not one.

---

## 2 · Build

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build:site        # → dist-site/
```

The four endpoints default to production. Override any of them for a staging
build:

| Variable               | Default                                                            |
| :--------------------- | :----------------------------------------------------------------- |
| `GAMES_SITE_URL`       | `https://games.sparxstar.com`                                      |
| `GAMES_IDENTITY_URL`   | `https://id.sparxstar.com`                                         |
| `GAMES_ENGINE_URL`     | `https://rlc-api.sparxstar.com/api/v1`                             |
| `GAMES_DICTIONARY_URL` | `https://dictionary.sparxstar.com/wp-json/sparxstar/v1/dictionary` |

Each must be an `https://` URL with **no trailing slash**; the build fails
otherwise rather than emitting a bundle that would call a bad origin from a
deployed browser.

**Nothing secret goes in here.** These are public addresses. In particular the
dictionary _consumer API key_ must never be built into the bundle — a key in a
static file is a published key. The site uses the ephemeral page-token flow
instead, which is why `/wordlist` is not reachable from it.

### Overriding an endpoint also changes the CSP

The Nginx `connect-src` must name the exact origins the bundle calls, or the
browser blocks every request. Both are generated from the same configuration,
so this happens for you:

```bash
GAMES_DICTIONARY_URL=https://staging-dict.example/wp-json/sparxstar/v1/dictionary \
  pnpm run build:site
GAMES_DICTIONARY_URL=https://staging-dict.example/wp-json/sparxstar/v1/dictionary \
  pnpm run build:headers    # regenerates deploy/nginx/games-security-headers.conf
```

The container does both in its build stage, so `docker build --build-arg …`
needs no extra step. **A droplet deploy does** — run `build:headers` with the
same overrides before copying the snippet, or you will serve a staging bundle
behind the production policy and see nothing but CSP violations.

`deploy/nginx/games-security-headers.conf` is a **generated file**; edit
`scripts/generate-csp-headers.cjs` (or the defaults in `site-endpoints.cjs`) and
regenerate. CI fails if the committed copy is not what the generator produces.

---

## 3 · Serve

### Option A — container

```bash
docker build -f deploy/Dockerfile -t sparxstar/dictionary-games:$(git rev-parse --short HEAD) .
docker run --rm -p 8080:80 sparxstar/dictionary-games:$(git rev-parse --short HEAD)
```

Build from the **repository root** (the Dockerfile path is `deploy/Dockerfile`,
the context is `.`). Two stages: pnpm builds the site, then `nginx:1.27-alpine`
serves it. The runtime image has no Node, no toolchain, no source and no secret.
`nginx -t` runs at build time, so a broken config fails the build rather than
crash-looping the container.

Override endpoints with `--build-arg` — and only endpoints. A `--build-arg` is
visible in `docker history` to anyone who can pull the image.

Health: `GET /healthz` → `200 ok`. Point the orchestrator's probe there.

### Option B — the existing droplet

`id.sparxstar.com` and `rlc-api.sparxstar.com` already run from Nginx on one
droplet; this is a third server block on the same box, and the only one serving
files rather than proxying.

```bash
pnpm run build:headers   # regenerate if you overrode any endpoint above
rsync -a --delete dist-site/ root@<droplet>:/var/www/games.sparxstar.com/
scp deploy/nginx/games-security-headers.conf root@<droplet>:/etc/nginx/conf.d/
scp deploy/nginx/games-site.conf root@<droplet>:/etc/nginx/sites-available/games.sparxstar.com
ssh root@<droplet> 'ln -sf /etc/nginx/sites-available/games.sparxstar.com /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx'
certbot --nginx -d games.sparxstar.com
```

Then apply the two edits the config's trailing comment describes: uncomment the
TLS server block, point `root` at `/var/www/games.sparxstar.com`, and move
`Strict-Transport-Security` **into** `games-security-headers.conf`.

That last one matters: nginx's `add_header` **replaces** the inherited set
rather than merging, and every location here sets its own `Cache-Control`. An
HSTS header left on the server block is silently dropped from every response.
The same rule is why the security headers live in an included snippet — adding a
location without that `include` quietly drops the CSP.

`games-security-headers.conf` must land at exactly
`/etc/nginx/conf.d/games-security-headers.conf`; the include is by absolute
path, because a relative one resolves against nginx's prefix and that differs
between the container image and the distro package.

### What the config does, and why

- **SPA fallback** — unknown paths serve `index.html`.
- **`/assets/` cached one year, `immutable`** — safe because every filename
  carries a content hash.
- **`index.html` never cached** — it maps to the hashed names; a stale copy
  points at assets that no longer exist.
- **A missing hashed asset 404s** instead of falling back to HTML. Returning
  HTML for a `.js` request is how `Unexpected token '<'` reaches production.
- **Source maps 404** (and are deleted from the image).
- **No CORS headers here.** Identity and the engine own their allowlists; a
  second source of truth is how an origin ends up permitted here and rejected
  there.

If you put Cloudflare in front, keep the `Cache-Control` values above — the
`immutable` assets are exactly what a CDN should hold, and `index.html` is
exactly what it should not.

---

## 4 · Verify

```bash
pnpm run build:site && pnpm test        # 51 unit tests
npm i playwright && npx playwright install chromium
# serve dist-site/ on :8080 through deploy/nginx/games-site.conf, then:
node scripts/browser-check.mjs          # 31 browser checks
```

The browser check loads the real bundle through the real Nginx config, plays a
full four-card run, and asserts the wire payload field by field — plus the
token-storage sweep. It exits non-zero on any failure, so it can gate a release
script. It is deliberately **not** in CI: it needs a browser download and a
running server.

Smoke-test by hand:

```bash
curl -sI https://games.sparxstar.com/ | grep -i content-security-policy
curl -s -o /dev/null -w '%{http_code}\n' https://games.sparxstar.com/any/deep/route   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://games.sparxstar.com/assets/js/nope.js # 404
```

---

## Troubleshooting

**Sign-in fails with a CORS error in the console, but `curl` to
`id.sparxstar.com` works.** Step 1 was skipped or the origin does not match
exactly. Check for a trailing slash, and check that `UI_ORIGINS` was _added_
rather than `UI_ORIGIN` overwritten.

**Scores never appear.** Confirm the player is actually signed in — the footer
says so. A guest's results stay on the device by design. If signed in, check
`POST /api/v1/events/batch` in the network tab: `401` means the token was
rejected (sign in again), and a `failed[]` entry names the engine's own reason
(`run_id_required`, `question_id_required`, `unsupported_game_type`).

**Players report being signed out after refreshing.** Expected. The suite token
is held in memory only, so the realm ending ends the session; their game
progress is untouched. This is documented in the sign-in panel and in spec
§12.3–§12.4. **Do not fix it by persisting the token** — that needs an approved
renewal contract which does not exist yet (spec §11).

**`Unexpected token '<'` in the console.** A hashed asset 404'd and something
served HTML in its place. Usually a half-finished deploy: `index.html` was
updated but the new `/assets/` files were not, or the other way round. Re-sync
`dist-site/` in full.

**A blank page and a CSP violation in the console.** If the blocked URL is one
of your own endpoints, the headers snippet was not regenerated after an endpoint
override — re-run `pnpm run build:headers` with the same variables and re-copy
it. Otherwise something was added that the policy does not allow (an external
font, a CDN script, an inline `<script>`): change the code, not the policy.
`connect-src` in particular is what stops an injected script from exfiltrating a
suite token.
