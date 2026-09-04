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

The three endpoints default to production. Override any of them for a staging
build:

| Variable             | Default                                |
| :------------------- | :------------------------------------- |
| `GAMES_SITE_URL`     | `https://games.sparxstar.com`          |
| `GAMES_IDENTITY_URL` | `https://id.sparxstar.com`             |
| `GAMES_ENGINE_URL`   | `https://rlc-api.sparxstar.com/api/v1` |

Each must be an `https://` URL with **no trailing slash**; the build fails
otherwise rather than emitting a bundle that would call a bad origin from a
deployed browser.

**`GAMES_DICTIONARY_URL` is gone.** Not repointed — removed. The browser does
not address the Dictionary API: it is private, and the page now calls this
host's own `/api/dictionary/*`, which Nginx proxies to the BFF container. A CI
job still passing that variable fails the build rather than quietly restoring a
direct browser path to a private API.

**Nothing secret goes in here.** These are public addresses, visible in the
browser's network tab on first load. No dictionary credential of any kind is
built into the bundle, and none can be: the credential lives only in the BFF
container, mounted read-only at runtime. See §2a.

### Overriding an endpoint also changes the CSP

The Nginx `connect-src` must name the exact origins the bundle calls, or the
browser blocks every request. Both are generated from the same configuration,
so this happens for you:

```bash
GAMES_ENGINE_URL=https://staging-rlc.example/api/v1 pnpm run build:site
GAMES_ENGINE_URL=https://staging-rlc.example/api/v1 pnpm run build:headers
```

The container does both in its build stage, so `docker build --build-arg …`
needs no extra step. **A droplet deploy does** — run `build:headers` with the
same overrides before copying the snippet, or you will serve a staging bundle
behind the production policy and see nothing but CSP violations.

`deploy/nginx/games-security-headers.conf` is a **generated file**; edit
`scripts/generate-csp-headers.cjs` (or the defaults in `site-endpoints.cjs`) and
regenerate. CI fails if the committed copy is not what the generator produces.

The dictionary origin is **not** in `connect-src`, and must not be added. That
is the CSP half of the BFF change: even if some future bundle code tried to call
the Dictionary API directly, the browser would refuse the connection. Every
`/api/dictionary/*` call is covered by `'self'`.

---

## 2a · The BFF — provisioning, in this order

The BFF is what makes dictionary content readable at all: the Dictionary API is
private, and this is the only component holding a credential for it. It is a
**separate container** from the static site, so the image everyone pulls
contains no key material.

The steps are ordered because each depends on the last. Doing them out of order
produces 401s that look like bugs.

### Step 1 — generate the key pair, outside source control

RSA 3072 minimum (the Identity Node's CLI refuses smaller):

```bash
sudo mkdir -p /etc/sparxstar
sudo openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
    -out /etc/sparxstar/games-identity.pem

# Owned by the uid the BFF container runs as, readable by nobody else.
sudo chown 1000:1000 /etc/sparxstar/games-identity.pem
sudo chmod 400 /etc/sparxstar/games-identity.pem
```

**The `chown` is not optional, and getting it wrong is the most likely way this
deployment fails.** A bind mount carries the host's numeric ownership straight
through, and the BFF container runs unprivileged as `node` — uid **1000** in
`node:22-alpine`. A root-owned mode-0400 key is therefore unreadable inside the
container, `loadConfig()` treats an unreadable key as fatal, and the BFF never
opens its listener: every `/api/dictionary/*` call becomes a 502 from Nginx that
looks like an upstream outage rather than a permissions mistake.

Confirm the uid on your base image rather than trusting the number here:

```bash
docker run --rm node:22-alpine id -u node    # expect 1000
```

Do **not** reach for `chmod 444` to make it work. That makes the deployment's
only private key readable by every user and every process on the host, which is
a worse problem than the one it solves.

Never commit it, never bake it into an image, never pass it as a `--build-arg`
(visible in `docker history`) or an environment variable (visible in `docker
inspect` and `/proc/<pid>/environ`). It is mounted read-only and read from a
path — that is the only supported channel.

Derive the **public** JWK for the next step:

```bash
sudo openssl rsa -in /etc/sparxstar/games-identity.pem -pubout \
    -out /tmp/games-identity.pub.pem
# Convert the SPKI PEM to a JWK with whatever tool your host has, then add
# "kid", "kty": "RSA", "use": "sig", "alg": "RS256".
```

### Step 2 — register the client with the Identity Node

Run in the identity-node checkout, against its database. The Identity Node
stores **only** the public half; its CLI refuses a JWK carrying private
material rather than stripping it.

```bash
pnpm service-client client:register \
    --id sparxstar-dictionary-games \
    --subject service:dictionary-games \
    --name "Dictionary Games BFF" \
    --audience dictionary

pnpm service-client key:register \
    --id sparxstar-dictionary-games \
    --kid games-2026-09 \
    --jwk ./games-identity.pub.jwk.json
```

`POST /oauth2/token` must also be mounted there: set
`SERVICE_CLIENTS_ENABLED=true`. While it is off the route 404s for every caller.

### Step 3 — register the caller with the Dictionary Node

The **subject must match exactly**. If it does not, the Dictionary
authenticates the caller and then refuses it as `subject_unknown` — an error
that reads like a signing problem and is not one.

```bash
docker run --rm --network sparxstar-dictionary \
    --env-file /etc/sparxstar/dictionary.env \
    sparxstar-dictionary-node:current \
    node dist/cli/main.js caller:register \
      --id sparxstar-dictionary-games \
      --label "Dictionary Games BFF" \
      --subject service:dictionary-games \
      --scope m2m \
      --budget <approved-entry-budget>
```

The budget is the rolling **unique-entry** ceiling per window — it meters corpus
exposure, not request count — and is an explicit approval, not a default. A pack
of 20 words charges 20 distinct entries.

### Step 4 — start the BFF and the site

```bash
export GAMES_IDENTITY_KEY_PATH=/etc/sparxstar/games-identity.pem
export GAMES_IDENTITY_KEY_ID=games-2026-09
docker compose -f deploy/docker-compose.yml up -d --build
```

The BFF publishes **no port**: it is reachable only as `games-bff:8081` on the
compose network, which is what keeps the credential holder unaddressable from
outside the host.

### Rotation

Overlapping keys, so there is no cutover instant:

1. `key:register` a new public key under a new `kid`.
2. Deploy the new private key and set `GAMES_IDENTITY_KEY_ID` to it.
3. Confirm tokens issue against the new `kid`.
4. `key:disable --kid <old>` on the Identity Node.
5. Remove the old private key after the rollback window.

Revoking the client stops **new** tokens immediately but cannot un-mint an
issued one — nothing can, for up to five minutes. An emergency response also
revokes the Dictionary caller row, which is immediate and independent.

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
pnpm run build:site && pnpm test        # 98 unit tests, incl. 49 BFF tests
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

### Verifying the BFF path

Run these in order; each one isolates a different link in the chain.

```bash
# 1. The BFF is up, without touching a credential or an upstream.
docker compose -f deploy/docker-compose.yml exec games-bff \
    node -e "require('http').get('http://127.0.0.1:8081/healthz',r=>console.log(r.statusCode))"

# 2. Token issuance, from INSIDE the container — proves the mounted key, the
#    registered kid, and the client's standing. A 503 here is an identity
#    problem; anything else below is not.
docker compose -f deploy/docker-compose.yml exec games-bff \
    node -e "require('/app/server/identityClient').createIdentityClient({config:require('/app/server/config').loadConfig()}).getToken().then(()=>console.log('token ok')).catch(e=>{console.error(e.message);process.exit(1)})"

# 3. The authenticated M2M path end to end, through the BFF.
docker compose -f deploy/docker-compose.yml exec games-bff \
    node -e "require('http').get('http://127.0.0.1:8081/api/dictionary/game-set?language=mnk&size=5',r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>console.log(r.statusCode,b.slice(0,200)))})"

# 4. The browser path: same-origin, through Nginx.
curl -s -o /dev/null -w '%{http_code}\n' \
    'https://games.sparxstar.com/api/dictionary/game-set?language=mnk&size=5'   # 200

# The alias the browser package exposes as `useGameSet({ limit })`. Same result,
# and the BFF forwards it upstream as `size` — verify both after a deploy.
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' \
    'https://games.sparxstar.com/api/dictionary/game-set?language=mnk&limit=5'  # 200, ~4 KB

# And the two disagreeing is a 400, not a silent choice between them.
curl -s -o /dev/null -w '%{http_code}\n' \
    'https://games.sparxstar.com/api/dictionary/game-set?language=mnk&size=5&limit=50'  # 400

# 5. An anonymous DIRECT call to the Dictionary must fail. This is the
#    invariant the whole design exists for.
curl -s -o /dev/null -w '%{http_code}\n' \
    'https://dictionary-api.sparxstar.com/v1/m2m/gamepack?language=mnk'         # 401

# 6. The public projection stays closed.
curl -s -o /dev/null -w '%{http_code}\n' \
    'https://dictionary-api.sparxstar.com/public/w/any-slug'                    # not 200

# 7. No credential in the logs. Should print nothing.
docker compose -f deploy/docker-compose.yml logs games-bff \
    | grep -Ei 'BEGIN PRIVATE KEY|client_assertion|access_token|Bearer '
```

Also confirm the browser never addresses the Dictionary: load the site with the
network tab open and filter on `dictionary-api` — there should be no request,
and `connect-src` should not permit one.

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

**Every `/api/dictionary/*` call returns 503.** The BFF cannot get a token. In
order of likelihood: `SERVICE_CLIENTS_ENABLED` is not `true` on the Identity
Node (the route 404s, so the BFF sees a refusal); `GAMES_IDENTITY_TOKEN_URL`
does not exactly equal the Identity Node's own `IDENTITY_TOKEN_ENDPOINT` (the
assertion's `aud` is checked against it, so a mismatch is `wrong_audience`);
`GAMES_IDENTITY_KEY_ID` names a `kid` that was disabled or never registered; or
the client is suspended or revoked. The Identity Node's logs name the exact
reason — the BFF is told only `invalid_client`, deliberately.

**`/api/dictionary/game-set` returns 503 but token issuance works.** The
Dictionary is refusing the caller. Its logs will say `subject_unknown` (no
caller row for `service:dictionary-games` — the subjects must match **exactly**
between the two registries), `revoked_credential_presented`, or a scope failure
(the caller row needs `m2m`, not `display`).

**`/api/dictionary/game-set` returns 502 `dictionary_rejected_request`, and the
BFF log says `response_too_large`.** The pack the Dictionary built exceeded its
own 102,400-byte query ceiling. **Do not raise the ceiling.** Check the size
instead:

- Send one. `size=5` (or its accepted alias `limit=5`) is a bounded request;
  omitting it leaves the Dictionary's default of 20, which is also bounded.
  Both are fine — what is not fine is a Dictionary older than 2026-09-04,
  where an omitted size resolved to the MAXIMUM of 200 and 200 gamepack words
  is ~140 KB. That was the original outage, and the fix is on the Dictionary
  side (`GAMEPACK_DEFAULT_SIZE`, `GAMEPACK_MAX_SIZE`).
- If a small pack still exceeds the ceiling, individual records are unusually
  large. The bounded error is the correct answer — a partial payload would
  parse and be wrong — so reduce the size for that language and open an issue
  against the corpus rather than widening the cap.

Canonical numbers: the Dictionary's `docs/dictionary-openapi.yaml`,
`/v1/m2m/gamepack` → `size`.

**A PRIORITY_1 `browser_origin_on_m2m` event for every gamepack request.**
Expected on a Dictionary older than 2026-09-04 and **not** a compromised
credential. Node's `fetch` sets `sec-fetch-mode: cors` on every server-side
request, and that header used to count as browser evidence. A correct caller
sends no `Origin` and no `Referer`; if the event shows `origin: ""` and
`hasReferer: false`, nothing is wrong with the caller. Deploy the Dictionary
fix rather than rotating the key.

**`/api/dictionary/game-set` returns 429 `dictionary_budget_exceeded`.** Not a
rate limit — the Dictionary's rolling **unique-entry** budget for this
deployment is spent for the window. Retrying will not help; the fix is a budget
change on the caller row, which is an approval.

**The language selector shows one language, or the domain filter is empty.**
Expected, and not a bug in this repo. The Dictionary Node publishes no
`/languages` or `/domains` route, so the BFF answers both from its own
configuration (`GAMES_DICTIONARY_LANGUAGES`) and says so in the response
payload. See `docs/dictionary-games-bff.md` §7.

**A blank page and a CSP violation in the console.** If the blocked URL is one
of your own endpoints, the headers snippet was not regenerated after an endpoint
override — re-run `pnpm run build:headers` with the same variables and re-copy
it. Otherwise something was added that the policy does not allow (an external
font, a CDN script, an inline `<script>`): change the code, not the policy.
`connect-src` in particular is what stops an injected script from exfiltrating a
suite token.
