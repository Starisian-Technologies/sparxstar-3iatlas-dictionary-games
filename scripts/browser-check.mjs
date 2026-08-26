/**
 * Browser-integration check for the built games site.
 *
 * Loads the REAL production bundle through the REAL Nginx config in Chromium
 * and drives a complete run: load, deep route, guest play, sign in, play four
 * cards, and confirm what actually goes on the wire. Only the three external
 * origins are stubbed (dictionary, identity, engine) — nothing about the app,
 * the bundle, or the host config is mocked.
 *
 * This is NOT part of `pnpm test` and is not wired into CI, deliberately: it
 * needs a Chromium download and a running web server, which would slow every
 * CI run for a check that belongs to a release, not to a commit. Run it by
 * hand before a deploy.
 *
 * Prerequisites:
 *   pnpm run build:site
 *   npm i playwright && npx playwright install chromium
 *   # serve dist-site/ on :8080 through deploy/nginx/games-site.conf
 *
 * Then:
 *   PW_CHROMIUM=$(npx playwright print-executable-path chromium 2>/dev/null) \
 *     node scripts/browser-check.mjs
 *
 * Exits non-zero if any check fails, so it can gate a release script.
 */
import { chromium } from 'playwright';

const BASE = process.env.SITE_BASE ?? 'http://127.0.0.1:8080';
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.SUITE-TOKEN-CANARY.sig';

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const WORDS = Array.from({ length: 4 }, (_, i) => ({
    uuid: `word-${i}`,
    headword: `kuma${i}`,
    slug: `kuma${i}`,
    definition: `definition ${i}`,
    translation_en: `english ${i}`,
    translation_fr: `french ${i}`,
    ipa: '',
    phonetic: '',
    part_of_speech: 'noun',
    language: 'mandinka',
    domain: 'general',
    origin: '',
    synonyms: [],
    antonyms: [],
    example_sentences: [
        {
            sentence: `kuma${i} example sentence here`,
            ipa: '',
            phonetic: '',
            translation_en: 'example',
            translation_fr: 'exemple',
        },
    ],
}));

const json = (body) => ({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
});

const engineCalls = [];
const consoleLines = [];

const browser = await chromium.launch({
    /* PW_CHROMIUM lets a sandboxed CI image point at a preinstalled browser;
     * unset, Playwright resolves its own download. */
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: process.env.PW_NO_SANDBOX ? ['--no-sandbox'] : [],
});
const context = await browser.newContext();
const page = await context.newPage();

page.on('console', (msg) => consoleLines.push(msg.text()));
page.on('pageerror', (err) => consoleLines.push(`PAGEERROR: ${err.message}`));

// ---- stub the three external origins -------------------------------------
await context.route('**://dictionary.sparxstar.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/page-token')) {
        return route.fulfill(
            json({ success: true, data: { token: 'pt', expires_at: 0 }, meta: {} })
        );
    }
    if (url.includes('/languages')) {
        return route.fulfill(
            json({
                success: true,
                data: { languages: [{ slug: 'mandinka', name: 'Mandinka', count: 4 }] },
                meta: {},
            })
        );
    }
    if (url.includes('/domains')) {
        return route.fulfill(json({ success: true, data: { domains: [] }, meta: {} }));
    }
    if (url.includes('/game-set')) {
        return route.fulfill(json({ success: true, data: { words: WORDS }, meta: { total: 4 } }));
    }
    return route.fulfill(json({ success: true, data: {}, meta: {} }));
});

await context.route('**://id.sparxstar.com/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/auth/v1/login')) {
        return route.fulfill(
            json({
                accountId: 'acct-1',
                token: TOKEN,
                screenName: 'ada',
                tier: 'adult',
                schoolId: null,
                classId: null,
                expiresAt: Date.now() + 43_200_000,
            })
        );
    }
    return route.fulfill({
        status: 204,
        body: '',
        headers: { 'access-control-allow-origin': '*' },
    });
});

await context.route('**://rlc-api.sparxstar.com/**', async (route) => {
    const req = route.request();
    engineCalls.push({
        url: req.url(),
        auth: req.headers()['authorization'] ?? null,
        body: req.postData(),
    });
    return route.fulfill(json({ accepted: 1, failed: [] }));
});

// ---- 1. the page loads and mounts ----------------------------------------
const resp = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('index.html served with 200', resp.status() === 200, `status ${resp.status()}`);
check(
    'React app mounted (root is not empty)',
    (await page.locator('#root').innerHTML()).length > 100
);
check('page title rendered', (await page.title()) === 'Dictionary Games');
check(
    'no uncaught page errors on load',
    !consoleLines.some((l) => l.startsWith('PAGEERROR')),
    consoleLines.filter((l) => l.startsWith('PAGEERROR')).join(' | ')
);

// ---- 2. deep route still boots (SPA fallback end to end) -----------------
const deep = await page.goto(`${BASE}/play/listen-write`, { waitUntil: 'networkidle' });
check('deep route served the SPA shell (200)', deep.status() === 200);
check('app mounted on the deep route', (await page.locator('#root').innerHTML()).length > 100);

// ---- 3. guest state ------------------------------------------------------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check(
    'guest footer states local-only progress',
    (await page.locator('footer').innerText()).includes('guest')
);
check('no engine call made as a guest', engineCalls.length === 0, `${engineCalls.length} calls`);

const guestStorage = await page.evaluate(() => ({
    local: { ...window.localStorage },
    session: { ...window.sessionStorage },
}));
check(
    'localStorage holds no token as a guest',
    !JSON.stringify(guestStorage).includes('SUITE-TOKEN-CANARY')
);

// ---- 4. sign in ----------------------------------------------------------
await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click();
await page.getByLabel('Screen name').fill('ada');
await page.getByLabel('Password').fill('correct-horse-battery-staple');
await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click();
await page.waitForSelector('text=Sign out', { timeout: 10_000 });
check('signed in — sign-out control appears', true);
check(
    'signed-in footer states results earn XP',
    (await page.locator('footer').innerText()).includes('XP')
);

// ---- 5. THE token-storage invariant, in a real browser -------------------
const afterLogin = await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    const dumps = [];
    for (const { name } of dbs) {
        if (!name) continue;
        const db = await new Promise((res, rej) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        for (const store of Array.from(db.objectStoreNames)) {
            const all = await new Promise((res) => {
                const r = db.transaction(store, 'readonly').objectStore(store).getAll();
                r.onsuccess = () => res(r.result);
                r.onerror = () => res([]);
            });
            dumps.push(JSON.stringify(all));
        }
        db.close();
    }
    return {
        local: JSON.stringify({ ...window.localStorage }),
        session: JSON.stringify({ ...window.sessionStorage }),
        cookie: document.cookie,
        idb: dumps.join(''),
        url: window.location.href,
    };
});

check('localStorage contains no token', !afterLogin.local.includes('SUITE-TOKEN-CANARY'));
check('sessionStorage contains no token', !afterLogin.session.includes('SUITE-TOKEN-CANARY'));
check('cookies contain no token', !afterLogin.cookie.includes('SUITE-TOKEN-CANARY'));
check('IndexedDB contains no token', !afterLogin.idb.includes('SUITE-TOKEN-CANARY'));
check('URL contains no token', !afterLogin.url.includes('SUITE-TOKEN-CANARY'));
check('console output contains no token', !consoleLines.join(' ').includes('SUITE-TOKEN-CANARY'));

// ---- 5b. play a full run and let the results settle ----------------------
// Domain Flash needs no audio and no typing, so it can be driven headlessly:
// Reveal, then "I knew it" / "Still learning", per card.
await page.getByRole('button', { name: /Domain Flash/ }).click();
await page.getByRole('button', { name: '10' }).click();
await page.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForSelector('button:has-text("Reveal")', { timeout: 10_000 });

let cards = 0;
for (let i = 0; i < 12; i += 1) {
    const reveal = page.getByRole('button', { name: 'Reveal' });
    if (!(await reveal.isVisible().catch(() => false))) break;
    await reveal.click();
    // Alternate outcomes so both scoring branches are exercised.
    const label = i % 2 === 0 ? 'I knew it ✓' : 'Still learning';
    await page.getByRole('button', { name: label }).click();
    cards += 1;
    await page.waitForTimeout(120);
}
check('played a full run of cards', cards === 4, `${cards} cards`);

// handleComplete awaits the result chain then calls syncNow().
await page.waitForTimeout(1500);

check(
    'engine received the batch after the run',
    engineCalls.length >= 1,
    `${engineCalls.length} call(s)`
);

const batch = engineCalls.length ? JSON.parse(engineCalls[0].body) : { events: [] };
check('batch was sent with a Bearer token', (engineCalls[0]?.auth ?? '').startsWith('Bearer '));
check(
    'batch carried one game.result per card',
    batch.events.length === 4,
    `${batch.events.length} events`
);

const payloads = batch.events.map((e) => e.payload);
check(
    'every event has a unique event_id',
    new Set(batch.events.map((e) => e.event_id)).size === batch.events.length
);
check(
    'every payload is game_type dictionary_quiz',
    payloads.every((p) => p.game_type === 'dictionary_quiz')
);
check(
    'every payload carries a non-empty session_id (run id)',
    payloads.every((p) => typeof p.session_id === 'string' && p.session_id.length > 0)
);
check(
    'all events in the run share ONE session_id',
    new Set(payloads.map((p) => p.session_id)).size === 1
);
check(
    'every payload carries a distinct deal_id (question id)',
    new Set(payloads.map((p) => p.deal_id)).size === payloads.length &&
        payloads.every((p) => p.deal_id)
);
check(
    'outcomes are all in the manifest scoring table',
    payloads.every((p) => ['correct', 'learning', 'incorrect', 'skipped'].includes(p.outcome)),
    payloads.map((p) => p.outcome).join(',')
);
check(
    'attempts and time_ms are non-negative numbers',
    payloads.every(
        (p) =>
            typeof p.attempts === 'number' &&
            p.attempts >= 0 &&
            typeof p.time_ms === 'number' &&
            p.time_ms >= 0
    ),
    payloads.map((p) => `${p.attempts}/${p.time_ms}ms`).join(' ')
);
check(
    'time_ms is real measured elapsed time, not zero',
    payloads.some((p) => p.time_ms > 0)
);
check(
    'no aiwa_game_* bonus event was sent over the wire',
    batch.events.every((e) => e.event_type === 'game.result')
);

// ---- 6. refresh requires signing in again --------------------------------
await page.reload({ waitUntil: 'networkidle' });
const signInVisibleAfterReload = await page
    .getByRole('button', { name: 'Sign in' })
    .isVisible()
    .catch(() => false);
check('a refresh returns to signed-out (no silent restore)', signInVisibleAfterReload);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
if (engineCalls.length) {
    console.log('\nEngine calls observed:');
    for (const c of engineCalls) {
        console.log(`  ${c.url}  auth=${c.auth ? 'Bearer <redacted>' : 'none'}`);
        console.log(`  body: ${c.body}`);
    }
}
process.exit(failed.length ? 1 : 0);
