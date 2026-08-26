/**
 * 3iAtlas Identity Service client — the browser-facing `/auth/v1` surface.
 *
 * Contract: `sparxstar-3iatlas-identity-node`, `src/routes/auth.ts`
 * (Identity Service Spec v1.0 §6). camelCase in and out, which is that
 * surface's browser vocabulary — the snake_case `POST /login` alongside it is
 * the suite-internal spelling and is not what a browser client should call.
 *
 * This module performs authentication only. It never decides what the holder
 * may do, and it deliberately does not touch storage: the token it returns is
 * handed to `suiteToken.js`, which keeps it in memory. Nothing here writes a
 * cookie either — the service sets `credentials: false` on its CORS policy, so
 * a credentialed request would be refused by the browser before it arrived.
 */

/** The service's own error vocabulary, surfaced with a status for the caller. */
export class IdentityError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {number} status
     */
    constructor(code, message, status) {
        super(message);
        this.name = 'IdentityError';
        this.code = code;
        this.status = status;
    }
}

/** Messages a player can act on, for the codes this flow can actually hit. */
const FRIENDLY = {
    invalid_credentials: 'That screen name and password did not match. Please try again.',
    rate_limited: 'Too many attempts. Please wait a moment and try again.',
    account_locked: 'This account is temporarily locked after too many failed attempts.',
    missing_token: 'Your session has ended. Please sign in again.',
};

async function readJson(res) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * POST a JSON body to an Identity route and normalise failures.
 *
 * @param {string} identityUrl Identity Service origin, no trailing slash.
 * @param {string} path        e.g. '/auth/v1/login'
 * @param {object} body
 * @param {string} [bearer]    Token to present, for routes that take one.
 * @returns {Promise<object>}
 */
async function post(identityUrl, path, body, bearer) {
    const headers = { 'Content-Type': 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    let res;
    try {
        res = await fetch(`${identityUrl}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            /*
             * Explicitly no credentials. The service answers CORS with
             * `credentials: false` and the platform forbids ever emitting
             * `Access-Control-Allow-Credentials`, so sending cookies would make
             * the browser reject the response — and would imply a cookie
             * session this platform does not have.
             */
            credentials: 'omit',
        });
    } catch {
        /* Network-level failure. Not an auth failure — saying "wrong password"
         * here would be a lie the player cannot debug. */
        throw new IdentityError(
            'network_error',
            'Could not reach the sign-in service. Check your connection and try again.',
            0
        );
    }

    const json = await readJson(res);
    if (!res.ok) {
        const code = json?.error ?? json?.code ?? 'auth_failed';
        throw new IdentityError(
            code,
            FRIENDLY[code] ?? 'Sign-in failed. Please try again.',
            res.status
        );
    }
    return json ?? {};
}

/**
 * Sign in an adult account.
 *
 * Adult tier only: this site has no `schoolId`, so it sends `password` rather
 * than the class-code or PIN paths, which are school-scoped and need a school
 * deployment setting the games site does not have.
 *
 * Two possible successes, and they are not the same thing — a second-factor
 * challenge is NOT a session:
 *   - `{ mfaRequired: true, challenge, expiresAt }` → call `completeMfa()`.
 *   - a session envelope with `token` → signed in.
 *
 * @param {object} opts
 * @param {string} opts.identityUrl
 * @param {string} opts.screenName
 * @param {string} opts.password
 * @returns {Promise<{mfaRequired: true, challenge: string, expiresAt: number}
 *   | {token: string, accountId: string, screenName: string, tier: string, expiresAt: number}>}
 */
export async function login({ identityUrl, screenName, password }) {
    return post(identityUrl, '/auth/v1/login', { screenName, password });
}

/**
 * Complete a second-factor challenge and receive the session.
 *
 * @param {object} opts
 * @param {string} opts.identityUrl
 * @param {string} opts.challenge  Opaque value from the login response.
 * @param {string} opts.code       The player's TOTP or backup code.
 */
export async function completeMfa({ identityUrl, challenge, code }) {
    return post(identityUrl, '/auth/v1/login/mfa', { challenge, code });
}

/**
 * Re-check a held token against live state (revocation, lockout, current tier).
 *
 * The token's own claims are enough to know who the holder is; this is the
 * authoritative answer for whether the session is still good. A 401 means
 * "sign in again", never a transport error.
 *
 * @returns {Promise<object|null>} The session, or null if it no longer validates.
 */
export async function validate({ identityUrl, token }) {
    try {
        return await post(identityUrl, '/auth/v1/validate', {}, token);
    } catch (error) {
        if (error instanceof IdentityError && error.status === 401) return null;
        throw error;
    }
}

/**
 * Revoke the token server-side.
 *
 * Dropping our in-memory copy is not enough on a shared device: whoever holds
 * a copy of the string still holds a valid credential until its own expiry.
 * The route always answers 204, so a failure here is not worth surfacing —
 * the local copy is cleared regardless by the caller.
 */
export async function logout({ identityUrl, token }) {
    try {
        await post(identityUrl, '/auth/v1/logout', {}, token);
    } catch {
        /* Best effort: an unreachable service must not trap the player in a
         * signed-in UI. The caller clears the in-memory token either way. */
    }
}
