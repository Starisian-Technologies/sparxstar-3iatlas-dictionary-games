import React, { useCallback, useEffect, useState } from 'react';
import GameShell from '../components/GameShell.jsx';
import { DICTIONARY_BFF_PATH, ENGINE_URL, IDENTITY_URL, UI_LANGUAGE } from './config.js';
import { useIdentityAuth } from './auth/useIdentityAuth.js';
import { getSuiteToken } from './auth/suiteToken.js';
import SignInPanel from './components/SignInPanel.jsx';

/**
 * The games.sparxstar.com application shell.
 *
 * This is the "host app" the package has always been written against — it
 * supplies React, Tailwind, navigation, the source-language state, and now the
 * two progress-sync props (`engineUrl`, `getSuiteToken`). `GameShell` itself is
 * imported unchanged from the package sources; nothing in `src/components` or
 * `src/hooks` knows this website exists, which is what keeps the UMD package
 * boundary intact.
 *
 * `getSuiteToken` is passed unconditionally and always returns the current
 * in-memory token — null while signed out. That is the whole guest/authenticated
 * distinction: `useProgressSync` makes no network call while it returns null, so
 * a guest's results accumulate locally, and the first sync after sign-in flushes
 * whatever the guest already earned.
 */
export default function App() {
    const [languages, setLanguages] = useState([]);
    const [sourceLanguage, setSourceLanguage] = useState(null);
    const [languagesError, setLanguagesError] = useState(null);
    const [showSignIn, setShowSignIn] = useState(false);

    const auth = useIdentityAuth({ identityUrl: IDENTITY_URL });

    /* Close the sign-in panel once a session exists. */
    useEffect(() => {
        if (auth.signedIn) setShowSignIn(false);
    }, [auth.signedIn]);

    /*
     * Load the language list from the games BFF, same-origin.
     *
     * No page token and no credential: the Dictionary API is private and the
     * browser does not address it. The BFF answers this one from its own
     * configuration, because the Dictionary Node publishes no `/languages`
     * route — see the note in its response and `docs/dictionary-games-bff.md`.
     */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        fetch(`${DICTIONARY_BFF_PATH}/languages`, {
            credentials: 'omit',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (cancelled) return;
                const list = Array.isArray(json?.data?.languages) ? json.data.languages : [];
                setLanguages(list);
                /* Pre-select when there is only one — a chooser with a single
                 * option is a step, not a choice. */
                if (list.length === 1) setSourceLanguage(list[0].slug);
            })
            .catch((error) => {
                if (cancelled || error?.name === 'AbortError') return;
                setLanguagesError('Could not load the available languages.');
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, []);

    const handleBrowse = useCallback(() => {
        /* The Browse tab is the AIWA app's surface, not this site's. Rather
         * than render a dead control, GameShell's onBrowse is wired to nothing
         * here; a future release can point it at the dictionary front end. */
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
            <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
                    <h1 className="text-lg font-semibold">Dictionary Games</h1>
                    {auth.signedIn ? (
                        <div className="flex items-center gap-3 text-sm">
                            <span className="text-slate-600 dark:text-slate-300">
                                {auth.account?.screenName}
                            </span>
                            <button
                                type="button"
                                onClick={auth.signOut}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600"
                            >
                                Sign out
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowSignIn(true)}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
                        >
                            Sign in
                        </button>
                    )}
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-6">
                {showSignIn && !auth.signedIn ? (
                    <SignInPanel auth={auth} onDismiss={() => setShowSignIn(false)} />
                ) : (
                    <>
                        {languagesError && (
                            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
                                {languagesError}
                            </p>
                        )}
                        <GameShell
                            bffPath={DICTIONARY_BFF_PATH}
                            language={UI_LANGUAGE}
                            sourceLanguage={sourceLanguage}
                            languages={languages}
                            onSourceLanguage={setSourceLanguage}
                            onBrowse={handleBrowse}
                            engineUrl={ENGINE_URL}
                            /* Always supplied. It returns null until an adult
                             * signs in, which is exactly what keeps guest play
                             * local without a second code path. */
                            getSuiteToken={getSuiteToken}
                        />
                    </>
                )}
            </main>

            <footer className="mx-auto max-w-4xl px-4 pb-8 text-xs text-slate-500 dark:text-slate-400">
                {auth.signedIn
                    ? 'Signed in — finished results earn XP on your account.'
                    : 'Playing as a guest — progress is saved on this device only.'}
            </footer>
        </div>
    );
}
