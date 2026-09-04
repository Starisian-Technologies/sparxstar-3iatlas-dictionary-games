/**
 * Before/after screenshots of all six games.
 *
 * Serves a built `dist-site` statically and intercepts `/api/dictionary/*`
 * with a fixed pack drawn from REAL sampled Mandinka entries, so both builds
 * see byte-identical data and the only difference in the images is the code.
 *
 * The pack deliberately leads with `njemboo` — `nj` digraph, `oo` long vowel —
 * because that is the word whose handling this change is about.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [root, outDir, label] = process.argv.slice(2);
const PORT = Number(process.env.PORT ?? 8099);
const SAMPLE = JSON.parse(fs.readFileSync(process.env.SAMPLE, 'utf8'));

/* A fixed six-word pack: the two orthographically interesting words first,
 * then whatever else the sample offers with audio and an example. */
const byName = new Map(SAMPLE.map((w) => [w.header_word, w]));
const wanted = ['njemboo', 'musukeebaa', 'kenta'];
const words = [
    ...wanted.map((n) => byName.get(n)).filter(Boolean),
    ...SAMPLE.filter((w) => !wanted.includes(w.header_word) && w.audio_url).slice(0, 3),
    ...SAMPLE.filter((w) => !wanted.includes(w.header_word)).slice(0, 6),
].slice(0, 8);

const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
        file = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
/* A real low-end phone viewport: this is a phone-first product. */
async function freshPage() {
    /*
     * A NEW context per game. The site resumes an unfinished session from
     * storage — which is a feature — so reusing one context meant every game
     * after the first opened into the previous game's session instead of the
     * setup screen, and the card was legitimately "not found".
     */
    const context = await browser.newContext({
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.route('**/api/dictionary/languages*', (route) =>
        route.fulfill({
            json: {
                ok: true,
                data: { languages: [{ slug: 'mnk', code: 'mnk', name: 'Mandinka' }] },
            },
        })
    );
    await page.route('**/api/dictionary/domains*', (route) =>
        route.fulfill({ json: { ok: true, data: { domains: [] } } })
    );
    await page.route('**/api/dictionary/game-set*', (route) =>
        route.fulfill({ json: { ok: true, data: { pack_id: 'shot', language: 'mnk', words } } })
    );
    /* No engine and no identity in a screenshot run: the games stay local-only,
     * which is the guest path and exactly what an unauthenticated visitor sees. */
    await page.route('**/rlc-api.sparxstar.com/**', (route) => route.abort());
    await page.route('**/id.sparxstar.com/**', (route) => route.abort());
    return { context, page };
}

fs.mkdirSync(outDir, { recursive: true });
const shot = async (page, name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`) });
    console.log(`  ${label}-${name}.png`);
};

const GAMES = [
    'Listen & Write',
    'Arrange the Word',
    'Meaning Match',
    'Complete the Sentence',
    'Letter Reveal',
    'Domain Flash',
];
const SLUG = [
    'listen_write',
    'arrange_word',
    'meaning_match',
    'complete_sentence',
    'letter_reveal',
    'domain_flash',
];

for (const [i, gameLabel] of GAMES.entries()) {
    const { context, page } = await freshPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    /* Reach the Games tab if the site opens elsewhere. */
    const gamesTab = page.getByRole('button', { name: /games/i }).first();
    if (await gamesTab.count()) await gamesTab.click().catch(() => {});
    await page.waitForTimeout(400);

    const card = page.getByRole('button', { name: new RegExp(gameLabel, 'i') }).first();
    if (!(await card.count())) {
        console.log(`  (skip ${SLUG[i]} — setup card not found)`);
        await context.close();
        continue;
    }
    await card.click();
    await page.waitForTimeout(200);
    await shot(page, `${SLUG[i]}-1-setup`);

    const start = page.getByRole('button', { name: /start|play|begin/i }).first();
    if (await start.count()) {
        await start.click().catch(() => {});
        await page.waitForTimeout(1100);
        await shot(page, `${SLUG[i]}-2-question`);

        /*
         * Then get it WRONG on purpose, because the difference this change made
         * is entirely in what happens next. Before: a shake, or a timer that
         * took the answer away. After: another attempt, then the answer with a
         * Continue the player presses.
         */
        const wrongTile = page
            .locator('button')
            .filter({ hasText: /^[a-z]{1,2}$/ })
            .first();
        const input = page.locator('input[type="text"]').first();
        if (await input.count()) {
            await input.fill('zzzz').catch(() => {});
            const check = page.getByRole('button', { name: /check|submit/i }).first();
            if (await check.count()) {
                await check.click().catch(() => {});
                await page.waitForTimeout(300);
                await input.fill('zzzz').catch(() => {});
                await check.click().catch(() => {});
                await page.waitForTimeout(300);
                await input.fill('zzzz').catch(() => {});
                await check.click().catch(() => {});
            }
        } else if (await wrongTile.count()) {
            for (let t = 0; t < 8; t += 1) {
                const tiles = page.locator('button').filter({ hasText: /^[a-z]{1,2}$/ });
                if (!(await tiles.count())) break;
                await tiles
                    .nth((await tiles.count()) > 1 ? 1 : 0)
                    .click()
                    .catch(() => {});
                await page.waitForTimeout(120);
            }
        } else {
            const any = page.locator('button:visible').last();
            await any.click().catch(() => {});
        }
        await page.waitForTimeout(900);
        await shot(page, `${SLUG[i]}-3-after-wrong`);
    }
    await context.close();
}

await browser.close();
server.close();
