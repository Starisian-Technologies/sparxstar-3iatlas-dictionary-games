/**
 * Dictionary Games BFF — process entry point.
 *
 *   node server/index.js
 *
 * Wires the four pieces and opens the listener. Everything interesting is in
 * the modules; this file's only jobs are boot-time failure and clean shutdown.
 *
 * BOOT FAILS LOUDLY. A missing endpoint, an unreadable key file, a malformed
 * language list — each throws here, before the listener opens, so the container
 * never reaches a state where it accepts requests it cannot serve. A BFF that
 * boots and 503s everything looks like an upstream outage for as long as it
 * takes someone to read the configuration.
 */

'use strict';

const http = require('http');
const { loadConfig } = require('./config');
const { createIdentityClient } = require('./identityClient');
const { createDictionaryClient } = require('./dictionaryClient');
const { createRoutes } = require('./routes');
const { createApp } = require('./app');

function main() {
    const config = loadConfig();

    const identity = createIdentityClient({ config });
    const dictionary = createDictionaryClient({ config, identity });
    const routes = createRoutes({ config, dictionary });
    const app = createApp({ config, routes });

    const server = http.createServer((req, res) => {
        // The handler never rejects — it maps every failure to a response — but
        // an unexpected throw must still not take the process down with an
        // unhandled rejection.
        Promise.resolve(app(req, res)).catch((err) => {
            console.error(
                JSON.stringify({
                    level: 'error',
                    msg: 'unhandled request failure',
                    reason: err.message,
                })
            );
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end('{"error":"internal_error"}');
            }
        });
    });

    /*
     * Bounded so a slow or malicious client cannot hold a connection open
     * indefinitely. Node's defaults are generous for a public-facing process
     * that fronts a credentialed upstream.
     */
    server.headersTimeout = 10_000;
    server.requestTimeout = 20_000;
    server.keepAliveTimeout = 5_000;

    server.listen(config.port, config.host, () => {
        console.log(
            JSON.stringify({
                level: 'info',
                msg: 'dictionary-games BFF listening',
                host: config.host,
                port: config.port,
                // The configuration, minus anything sensitive. The key PATH is
                // useful in a log; the key is not, and is not read here.
                dictionary: config.dictionary.baseUrl,
                identity_token_url: config.identity.tokenUrl,
                client_id: config.identity.clientId,
                kid: config.identity.keyId,
                audience: config.identity.audience,
                languages: config.languages.map((language) => language.code),
            })
        );
    });

    /** Stop accepting, let in-flight requests finish, then exit. */
    const shutdown = (signal) => {
        console.log(JSON.stringify({ level: 'info', msg: 'shutting down', signal }));
        server.close(() => process.exit(0));
        // A stuck connection must not hold the container past its grace period.
        setTimeout(() => process.exit(0), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

try {
    main();
} catch (err) {
    // No stack trace: a config error's message names the variable, and a trace
    // through a config module helps nobody deploying this.
    console.error(
        JSON.stringify({ level: 'error', msg: 'BFF failed to start', reason: err.message })
    );
    process.exit(1);
}
