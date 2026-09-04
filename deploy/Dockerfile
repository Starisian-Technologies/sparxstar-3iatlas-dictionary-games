# Dictionary Games — production static host for games.sparxstar.com.
#
# Two stages: build the site with pnpm, then serve the built directory with
# Nginx. The runtime stage carries no Node, no toolchain, no source, and no
# secret — only static files and a config.
#
# Build from the REPOSITORY ROOT so the build stage can see the sources:
#
#   docker build -f deploy/Dockerfile -t sparxstar/dictionary-games:<tag> .
#   docker run --rm -p 8080:80 sparxstar/dictionary-games:<tag>
#
# The three endpoints are compiled in at build time. The defaults are
# production, so a plain build needs no arguments; override for a staging
# host:
#
#   docker build -f deploy/Dockerfile \
#     --build-arg GAMES_ENGINE_URL=https://staging-rlc.example/api/v1 \
#     -t sparxstar/dictionary-games:staging .
#
# THERE IS NO DICTIONARY ENDPOINT HERE ANY MORE. The browser does not address
# the Dictionary API: the page calls this host's own `/api/dictionary/*`, which
# Nginx proxies to the BFF container (deploy/Dockerfile.bff), and the BFF holds
# the credential. `GAMES_DICTIONARY_URL` was removed rather than repointed, so
# a CI job still passing it fails the build instead of quietly restoring a
# direct browser path to a private API.
#
# NOTHING SECRET MAY BE PASSED HERE. A --build-arg is visible in `docker
# history` for anyone who can pull the image, so it is the correct channel for
# a public URL and the wrong one for a credential. This image needs no
# credential at all: the dictionary key lives only in the BFF container, and
# the suite token is minted per-player at sign-in and held only in memory.

# ---------------------------------------------------------------------------
# Stage 1 — build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

# Match the version pinned in package.json's packageManager field.
RUN corepack enable

WORKDIR /app

# Manifest and lockfile first: this layer is cached until dependencies
# actually change, so an ordinary source edit does not reinstall the tree.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Only what the site build reads. Copying the whole context would invalidate
# this layer on any unrelated file (a doc, a workflow) and would pull local
# build output into the image.
COPY babel.config.cjs postcss.config.cjs tailwind.config.cjs webpack.site.config.js ./
COPY site-endpoints.cjs ./
COPY scripts ./scripts
COPY src ./src

ARG GAMES_ENGINE_URL
ARG GAMES_IDENTITY_URL
ARG GAMES_SITE_URL
ENV GAMES_ENGINE_URL=${GAMES_ENGINE_URL} \
    GAMES_IDENTITY_URL=${GAMES_IDENTITY_URL} \
    GAMES_SITE_URL=${GAMES_SITE_URL}

RUN pnpm run build:site

# Generate the Nginx security headers from the SAME endpoint configuration the
# bundle was just built with. This is why the runtime stage copies the snippet
# from here rather than from the build context: a --build-arg override reaches
# the bundle and the CSP together, so a staging image cannot ship a policy that
# blocks its own requests.
RUN pnpm run build:headers

# Source maps are emitted (hidden-source-map) for symbolicating crash reports,
# but they must not ship inside the served directory. Nginx 404s them as a
# second line of defence; removing them here means they are not in the image
# at all. Keep them from the CI build artifact instead if you need them.
RUN find dist-site -name '*.map' -delete

# ---------------------------------------------------------------------------
# Stage 2 — serve
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# The stock default site would otherwise shadow ours on port 80.
RUN rm -f /etc/nginx/conf.d/default.conf
# Both files must land at exactly the absolute path games-site.conf includes
# the snippet from. The server block is static and comes from the context; the
# headers snippet is GENERATED, so it comes from the build stage — copying the
# committed one here would silently reinstate the production CSP over a staging
# build's own.
COPY deploy/nginx/games-site.conf /etc/nginx/conf.d/games-site.conf
COPY --from=build /app/deploy/nginx/games-security-headers.conf /etc/nginx/conf.d/games-security-headers.conf

# NOTE: an earlier revision rewrote connect-src here with `sed` against the
# committed snippet. That is no longer needed and was removed: the snippet the
# line above copies was generated in the build stage from the same endpoint
# configuration the bundle was compiled with, so it already names the right
# origins. Keeping both would mean a third copy of the endpoint defaults living
# in shell, and a `sed -i` that silently no-ops when its pattern stops matching
# — which is precisely how a staging image would quietly regain the production
# policy.

COPY --from=build /app/dist-site /usr/share/nginx/html

# Run unprivileged. The stock nginx image starts as root to bind port 80 and
# drops to the `nginx` user for workers; the -alpine-slim "unprivileged"
# variants differ. Here we keep the stock entrypoint (it templates nothing we
# rely on) and simply ensure the served files are not writable by the worker:
# a static host has no reason to be able to modify what it serves.
RUN chown -R root:root /usr/share/nginx/html && \
    chmod -R a-w /usr/share/nginx/html

# Fail the BUILD on a bad config rather than discovering it when the container
# crash-loops. This catches the include path, which is the part most likely to
# be wrong after a file is moved.
# `nginx -t` resolves `upstream games_bff { server games-bff:8081; }`, and that
# name does not exist at build time. Buildkit has no compose network, so DNS
# fails and the config test would fail with it — which would be a build broken
# by correct config. The include path (the part most likely to be wrong after a
# file move) is still validated, by pointing the upstream at a literal address
# for the duration of the check only.
RUN sed 's/server games-bff:8081;/server 127.0.0.1:8081;/' \
        /etc/nginx/conf.d/games-site.conf > /tmp/games-site.check.conf && \
    mv /etc/nginx/conf.d/games-site.conf /tmp/games-site.real.conf && \
    mv /tmp/games-site.check.conf /etc/nginx/conf.d/games-site.conf && \
    nginx -t && \
    mv /tmp/games-site.real.conf /etc/nginx/conf.d/games-site.conf

EXPOSE 80

# Matches the /healthz location in games-site.conf. wget is present in the
# alpine base; curl is not, and adding it just for a probe grows the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
