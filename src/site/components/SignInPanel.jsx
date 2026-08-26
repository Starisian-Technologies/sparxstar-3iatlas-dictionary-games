import React, { useState } from 'react';

/**
 * Adult sign-in for the games site.
 *
 * Sign-in only — no account creation. Registration needs a captcha widget and,
 * in this platform, the wrapped-key store that WordPad's create-account flow
 * writes to; neither belongs in a games client. A player without an account is
 * pointed at the suite rather than half-served here.
 *
 * Signing in is entirely OPTIONAL. Guest play is the default and is complete:
 * every game works, and progress is saved on the device. Signing in adds one
 * thing — results settle for XP against the player's account — so this panel
 * says that plainly rather than blocking the games behind it.
 */
export default function SignInPanel({ auth, onDismiss }) {
    const [screenName, setScreenName] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');

    const mfa = auth.status === 'mfa-required';

    const submit = (event) => {
        event.preventDefault();
        if (mfa) {
            auth.submitMfaCode(code.trim());
        } else {
            auth.signIn(screenName.trim(), password);
        }
    };

    return (
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-800">
            <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-50">
                {mfa ? 'Enter your code' : 'Sign in'}
            </h2>
            <p className="mb-5 text-sm text-slate-600 dark:text-slate-300">
                {mfa
                    ? 'Your account has two-factor authentication enabled.'
                    : 'Signing in lets your results earn XP. You can play without it — your progress is saved on this device either way.'}
            </p>

            <form onSubmit={submit} className="space-y-4">
                {mfa ? (
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Authentication code
                        </span>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            required
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                        />
                    </label>
                ) : (
                    <>
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                                Screen name
                            </span>
                            <input
                                type="text"
                                autoComplete="username"
                                value={screenName}
                                onChange={(e) => setScreenName(e.target.value)}
                                required
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                                Password
                            </span>
                            <input
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                            />
                        </label>
                    </>
                )}

                {auth.error && (
                    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                        {auth.error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={auth.busy}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                    {auth.busy ? 'Please wait…' : mfa ? 'Verify' : 'Sign in'}
                </button>
            </form>

            <button
                type="button"
                onClick={mfa ? auth.cancelMfa : onDismiss}
                className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-slate-600 hover:underline dark:text-slate-300"
            >
                {mfa ? 'Cancel' : 'Continue as guest'}
            </button>

            {/* Stated up front rather than discovered after a lost session. */}
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                For your security this sign-in is not stored in your browser, so refreshing the page
                will ask you to sign in again. Your game progress is saved on this device and is not
                lost.
            </p>
        </div>
    );
}
