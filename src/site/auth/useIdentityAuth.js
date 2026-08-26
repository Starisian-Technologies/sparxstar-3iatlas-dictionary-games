/**
 * useIdentityAuth — sign-in state for the games site.
 *
 * Holds everything about the session EXCEPT the token, which lives only in
 * `suiteToken.js`. The distinction matters: `screenName` and `tier` end up in
 * React state (and therefore in a component tree a devtools extension or a
 * React error overlay can serialise); the token must never be in anything that
 * can be serialised, so this hook reads it through the store's boolean
 * `hasSuiteToken()` and never copies it into state.
 *
 * There is no session restore on mount, deliberately. The token did not survive
 * the reload — see the note in `suiteToken.js` — so there is nothing to
 * restore, and a hook that tried would be the first step toward persisting one.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import {
    clearSuiteToken,
    getSuiteToken,
    getVersion,
    hasSuiteToken,
    setSuiteToken,
    subscribe,
} from './suiteToken.js';
import { completeMfa, IdentityError, login, logout } from './identityClient.js';

/** 'signed-out' | 'mfa-required' | 'signed-in' */
const SIGNED_OUT = 'signed-out';

/**
 * @param {object} opts
 * @param {string} opts.identityUrl Identity Service origin, no trailing slash.
 * @returns {object} Auth state and actions.
 */
export function useIdentityAuth({ identityUrl }) {
    const [status, setStatus] = useState(SIGNED_OUT);
    const [account, setAccount] = useState(null);
    const [challenge, setChallenge] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    /* Re-render when the token store changes, without reading the token into
     * the component tree. The snapshot is a version counter, never the value. */
    useSyncExternalStore(subscribe, getVersion, getVersion);

    /** Adopt a session envelope: token to the store, the rest to state. */
    const adopt = useCallback((session) => {
        setSuiteToken(session.token);
        setAccount({
            accountId: session.accountId,
            screenName: session.screenName,
            tier: session.tier,
            expiresAt: session.expiresAt,
        });
        setChallenge(null);
        setStatus('signed-in');
    }, []);

    const handleFailure = useCallback((err) => {
        if (err instanceof IdentityError) {
            setError(err.message);
        } else {
            setError('Sign-in failed. Please try again.');
        }
    }, []);

    /** Step 1: screen name + password. */
    const signIn = useCallback(
        async (screenName, password) => {
            setBusy(true);
            setError(null);
            try {
                const result = await login({ identityUrl, screenName, password });
                if (result.mfaRequired) {
                    /* A correct password with a second factor enrolled is not a
                     * session yet. Nothing has failed — the login is half-done. */
                    setChallenge(result.challenge);
                    setStatus('mfa-required');
                    return;
                }
                adopt(result);
            } catch (err) {
                handleFailure(err);
            } finally {
                setBusy(false);
            }
        },
        [identityUrl, adopt, handleFailure]
    );

    /** Step 2, only when the service asked for one. */
    const submitMfaCode = useCallback(
        async (code) => {
            if (!challenge) return;
            setBusy(true);
            setError(null);
            try {
                adopt(await completeMfa({ identityUrl, challenge, code }));
            } catch (err) {
                handleFailure(err);
            } finally {
                setBusy(false);
            }
        },
        [identityUrl, challenge, adopt, handleFailure]
    );

    /** Revoke server-side, then forget locally. */
    const signOut = useCallback(async () => {
        const token = getSuiteToken();
        clearSuiteToken();
        setAccount(null);
        setChallenge(null);
        setStatus(SIGNED_OUT);
        setError(null);
        if (token) await logout({ identityUrl, token });
    }, [identityUrl]);

    /** Abandon a half-finished second-factor step. */
    const cancelMfa = useCallback(() => {
        setChallenge(null);
        setStatus(SIGNED_OUT);
        setError(null);
    }, []);

    return {
        status,
        account,
        error,
        busy,
        signedIn: hasSuiteToken(),
        signIn,
        submitMfaCode,
        cancelMfa,
        signOut,
    };
}
