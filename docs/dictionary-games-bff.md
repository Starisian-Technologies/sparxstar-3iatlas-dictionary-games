# Dictionary Games BFF

**Status:** implements the locked cross-repository specification _Dictionary
Service Authentication and Games Integration_ (platform owner, 2026-09-04).

This document is the games-side half. The Identity Node half is
`sparxstar-3iatlas-identity-node/docs/SERVICE-CLIENT-AUTH-SPEC-v1.0.md`.

---

## 1. Why this exists

The Dictionary API is private. No browser, anonymous user, or unregistered
application may call it — every endpoint on `sparxstar-3iatlas-dictionary-node`
is authenticated machine-to-machine, there is no open tier, and it treats a
browser-shaped header on a credentialed request as a PRIORITY_1 security event
on the reasoning that a credential which reached a browser has already left the
server it was supposed to stay on.

This repository used to call it from the browser, with an ephemeral page token.
That path is gone in both directions: the token flow is retired here, and the
`/page-token` route does not exist on the Node service at all.

So the request path is now:

```
browser ──same-origin──▶ Nginx ──▶ Games BFF ──private_key_jwt──▶ Identity Node
                                       │                              │
                                       │◀─────── 5-min RS256 token ───┘
                                       │         (aud: dictionary)
                                       └──Bearer──▶ Dictionary API
                                                    (/v1/m2m/gamepack)
```

The RLC engine is **not** in this path. Dictionary Contract A.5 keeps the engine
out of the content plane, and that is unchanged — the BFF is a games-side
component, not an engine route.

## 2. What lives where

| Path                         | Role                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `server/config.js`           | Environment, and the read-only key file. Fails boot on any gap. |
| `server/identityClient.js`   | `private_key_jwt` assertion + the in-memory token cache.        |
| `server/dictionaryClient.js` | The authenticated M2M call, and the one retry.                  |
| `server/rights.js`           | The rights-preserving projection.                               |
| `server/routes.js`           | The browser-facing allowlist.                                   |
| `server/app.js`              | Request handling, rate limiting, error mapping.                 |
| `server/index.js`            | Listener and shutdown.                                          |

The BFF has **zero runtime dependencies** — `node:http` and `node:crypto` only.
That is a security property rather than a boast: this process holds the
deployment's only private key, and every package it carried would be a package
that could reach that key. A JWT library would have been the most obvious
candidate, and RS256 over a `header.payload` string is twenty lines of `crypto`.

## 3. Identity

| Fact                | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Identity subject    | `service:dictionary-games`                                |
| Identity client id  | `sparxstar-dictionary-games`                              |
| Audience requested  | `dictionary`                                              |
| Assertion algorithm | RS256, key ≥ RSA 3072                                     |
| Access-token life   | 300 seconds, renewed at ~240s with jitter                 |
| Refresh token       | None. A new assertion is cheap and needs no stored grant. |

The **subject** is the load-bearing string: it is the `sub` of every token the
Identity Node issues for this client, and it is what the Dictionary Node's own
caller registry keys its `m2m` scope and entry budget off. If the two registries
disagree about it, the Dictionary authenticates the caller and then refuses it as
`subject_unknown`.

The assertion's `aud` is the Identity Node's **token endpoint**, not
`dictionary`. That is the replay defence: an assertion captured in flight cannot
be presented at a different endpoint. The requested audience travels as a form
parameter instead.

## 4. Browser-facing routes

Exact-match paths only. No prefixes, no patterns, no path parameters, no
catch-all — a caller cannot name a URL, a host, or a path fragment, and an
unknown query parameter is dropped rather than forwarded.

| Route                           | Upstream               | Notes                                  |
| ------------------------------- | ---------------------- | -------------------------------------- |
| `GET /api/dictionary/game-set`  | `GET /v1/m2m/gamepack` | The one route with a real upstream.    |
| `GET /api/dictionary/languages` | _none_                 | Served from configuration — see §7.    |
| `GET /api/dictionary/domains`   | _none_                 | Empty list — see §7.                   |
| `GET /healthz`                  | _none_                 | Touches no credential and no upstream. |

`game-set` accepts `language` (required, ISO 639-3), `domain`, `level`, `size`,
`swadesh`, `audio_verified`, `seed`. Each is validated against a bounded
pattern. An over-cap `size` is **refused, not clamped** — clamping would serve
50 words to a client that asked for 500 and believes it got them, and would make
the BFF more permissive than the service it fronts.

## 5. Rights

Authenticated application access does not remove copyright or consent
restrictions. The Dictionary applies its own §2b rights filter when it compiles
a pack: for an entry whose sourced fields are licensed third-party material,
`english_definition` and `french_definition` come back as **empty strings**, and
an entry with no consented recording comes back with `audio_url: null`.

An empty field is therefore a **decision, not a gap**, and `server/rights.js`
exists to keep it one:

- Nothing is ever substituted for a withheld field. Falling back to the native
  `definition` when `english_definition` is empty would ship the withheld clue
  text under a different key, and the entry would read as complete to every
  consumer thereafter.
- No media URL is ever synthesized. `audio_url: null` means no consented
  recording.
- The field set is an **explicit allowlist**, so a field the Dictionary adds
  later cannot reach the browser just because it appeared upstream. Both sides
  narrow; neither widens.
- Nothing is cached. Not at the Nginx hop, not in the BFF, and not in the
  browser — `useGameSet`'s three-day IndexedDB cache was **removed**, because a
  cached copy is a place a withdrawn word outlives its withdrawal on a device
  nobody can reach. A TTL is not a withdrawal mechanism. Caching returns when
  withdrawal behaviour is defined and honoured.

## 6. Failure behaviour

A failure of **our** credential is a `503`, never a `401` or `403`. A 401 tells
the player to sign in again and a 403 tells them they are not allowed; both are
lies when the truth is that this service could not authenticate itself.

| Condition                             | Response                         |
| ------------------------------------- | -------------------------------- |
| Identity Node unreachable or refusing | `503 upstream_unavailable`       |
| Dictionary refuses a fresh token      | `503 upstream_unavailable`       |
| Dictionary entry budget spent (429)   | `429 dictionary_budget_exceeded` |
| Malformed request                     | `400 bad_request`                |
| Per-IP ceiling                        | `429 rate_limited`               |

One retry, one reason: a `401` from the Dictionary buys exactly one forced token
refresh and one replay, because a token can expire between the cache read and
the upstream's clock. A second `401` is the caller's standing, not its clock,
and is reported rather than retried — grinding a revoked credential against an
audit log is how a revocation becomes an incident report about the client.

A still-valid token survives a **failed** renewal. That is what the early
renewal window is for: a transient identity outage inside it does not become a
games outage. Once the token is actually expired, the BFF fails closed.

## 7. Known gap — no `/languages`, no `/domains`

**The Dictionary Node publishes neither route.** The WordPress original had
both; the Node port did not carry them over, and the M2M tier is `gamepack`,
`sparkpack`, `spell-lexicon`, `writing-lookup`, `rhymes`, `meter` and
`spell-check`. There is nothing to ask.

Rather than invent an upstream, the BFF answers both locally and says so in the
payload (`source: "games-bff-configuration"`):

- **Languages** come from `GAMES_DICTIONARY_LANGUAGES` (`code:Label,…`). The
  default is the one language with a compiled corpus in the Dictionary's own
  release documentation. This is deployment configuration, not corpus truth.
- **Domains** are an empty list. The games' domain selector already treats "no
  domains" as "All domains", so the optional filter degrades quietly instead of
  putting an error in front of a player.

**This is the Dictionary repository's decision to close**, not this one's. When
those routes exist, `GAMES_DICTIONARY_LANGUAGES` is deleted and the two handlers
in `server/routes.js` call upstream. Nothing else changes.

## 8. Key handling

- Generated **outside** source control, RSA ≥ 3072.
- Mounted **read-only** into the container, and read from a **path**. Never an
  environment variable: an env var is visible in `docker inspect`, in
  `/proc/<pid>/environ`, and in any crash dump that captures the environment.
- An unreadable path is **fatal at boot**, never a fallback — a deploy that
  believes it loaded a mounted key and did not would fail closed on every
  request with an error that looks like an upstream problem.
- The Identity Node receives only the **public** JWK. Its provisioning CLI
  refuses a JWK carrying private material rather than stripping it.
- A lost private key is not recoverable and the Identity Node cannot help:
  register a replacement and disable the old `kid`.

### Rotation

Overlapping keys, so there is no cutover instant:

1. Register a new public key under a new `kid`.
2. Deploy the new private key and set `GAMES_IDENTITY_KEY_ID` to the new `kid`.
3. Confirm tokens are issuing against it.
4. Disable the old `kid` on the Identity Node.
5. Remove the old private key after the rollback window.

Revoking the client stops **new** tokens immediately. It cannot un-mint an
issued one — nothing can, for five minutes — so an emergency response also
revokes the Dictionary caller row, which is immediate and independent.
