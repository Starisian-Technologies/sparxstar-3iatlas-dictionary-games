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
# The four endpoints are compiled in at build time. The defaults are
# production, so a plain build needs no arguments; override for a staging
# host:
#
#   docker build -f deploy/Dockerfile \
#     --build-arg GAMES_DICTIONARY_URL=https://staging.example/wp-json/sparxstar/v1/dictionary \
#     -t sparxstar/dictionary-games:staging .
#
# NOTHING SECRET MAY BE PASSED HERE. A --build-arg is visible in `docker
# history` for anyone who can pull the image, so it is the correct channel for
# a public URL and the wrong one for a credential. This app needs no
# credential: the dictionary consumer API key is deliberately not used by the
# browser (page tokens instead), and the suite token is minted per-player at
# sign-in and held only in memory.

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
COPY src ./src

ARG GAMES_ENGINE_URL
ARG GAMES_IDENTITY_URL
ARG GAMES_SITE_URL
ARG GAMES_DICTIONARY_URL
ENV GAMES_ENGINE_URL=${GAMES_ENGINE_URL} \
    GAMES_IDENTITY_URL=${GAMES_IDENTITY_URL} \
    GAMES_SITE_URL=${GAMES_SITE_URL} \
    GAMES_DICTIONARY_URL=${GAMES_DICTIONARY_URL}

RUN pnpm run build:site

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
# Both files, and the snippet must land at exactly the absolute path
# games-site.conf includes it from.
COPY deploy/nginx/games-site.conf /etc/nginx/conf.d/games-site.conf
COPY deploy/nginx/games-security-headers.conf /etc/nginx/conf.d/games-security-headers.conf

ARG GAMES_ENGINE_URL
ARG GAMES_IDENTITY_URL
ARG GAMES_DICTIONARY_URL
# Keep CSP connect-src in sync with any endpoint override build args.
RUN set -eu; \
    csp_origin_from_url() { \
        origin="$(printf '%s' "$1" | sed -E -n 's#^(https?://[^/]+)(/.*)?$#\1#p')"; \
        if [ -z "$origin" ]; then \
            echo "Invalid URL passed for CSP origin extraction: $1" >&2; \
            exit 1; \
        fi; \
        printf '%s' "$origin"; \
    }; \
    dictionary_origin="$(csp_origin_from_url "${GAMES_DICTIONARY_URL:-https://dictionary.sparxstar.com/wp-json/sparxstar/v1/dictionary}")"; \
    identity_origin="$(csp_origin_from_url "${GAMES_IDENTITY_URL:-https://id.sparxstar.com/auth/v1}")"; \
    engine_origin="$(csp_origin_from_url "${GAMES_ENGINE_URL:-https://rlc-api.sparxstar.com/api/v1}")"; \
    sed -i "s#connect-src 'self' https://dictionary.sparxstar.com https://id.sparxstar.com https://rlc-api.sparxstar.com;#connect-src 'self' ${dictionary_origin} ${identity_origin} ${engine_origin};#" /etc/nginx/conf.d/games-security-headers.conf

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
RUN nginx -t

EXPOSE 80

# Matches the /healthz location in games-site.conf. wget is present in the
# alpine base; curl is not, and adding it just for a probe grows the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
