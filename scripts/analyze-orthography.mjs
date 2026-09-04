/**
 * Orthography and word-building coverage analysis for the approved dictionary data.
 *
 * WHY THIS SCRIPT EXISTS. `LetterReveal` shipped with a hardcoded alphabet
 * (`a`–`z`) plus a hardcoded list of six "Mandinka characters", and
 * `ArrangeWord` built its tile pool with `headword.split('')`. Neither was
 * derived from the corpus. Mattiev, Salaev & Kavšek (2025) is explicit that
 * word-game letter inventories must come from measured letter and
 * character-sequence frequency in the target language, and that the cube counts
 * they publish (eight for 3–5-letter words, nine for 6–7) are experimental
 * results across their twelve datasets — not constants to copy. This script is
 * how this repository determines its own numbers.
 *
 * WHAT IT MEASURES, all from a real sample of the approved corpus:
 *   1. Unicode inventory, and whether headwords arrive NFC-normalised.
 *   2. Headwords that are not playable at all (digits, punctuation, spaces) —
 *      these produce impossible or absurd rounds and must never be dealt.
 *   3. Orthographic units: long vowels and digraphs, measured rather than
 *      assumed, with the frequency of each.
 *   4. Unigram and character-level bigram frequencies over ORTHOGRAPHIC UNITS,
 *      following the paper's Algorithms 1–2 (including its ≤0.2% elimination
 *      threshold).
 *   5. Tile-set coverage by word length, for a range of tile counts, using
 *      bipartite matching — a word is coverable only if each of its units can
 *      be taken from a DIFFERENT tile, which is the paper's rule ("only one
 *      face of a cube can be used at a time").
 *
 * USAGE
 *   node scripts/analyze-orthography.mjs --sample path/to/sample.json
 *   node scripts/analyze-orthography.mjs --fetch https://games.sparxstar.com --seeds 5
 *
 * `--sample` takes either the BFF's game-set envelope or a plain array of
 * entries. `--fetch` pulls fresh packs from a deployed games BFF, which is the
 * only public address for this data — the Dictionary API itself is private.
 *
 * The output is a report, not a config file. A human reads it and decides.
 * Writing the chosen numbers into `src/orthography.js` is deliberate, because
 * the corpus grows and a number that silently tracked it would change the game
 * under players without anyone approving it.
 */

import { readFileSync } from 'node:fs';

/* The paper's elimination threshold (Algorithm 4, line 1): letters whose
 * frequency is at or below this share are dropped from the tile inventory and
 * their space given to frequent ones. */
const INFREQUENT_THRESHOLD_PERCENT = 0.2;

/* Faces per tile. Six, because a physical cube has six — the games are on
 * glass, but keeping the number means the analysis stays comparable with the
 * paper's and with a printed set an AIWA classroom could actually hold. */
const FACES_PER_TILE = 6;

function parseArgs(argv) {
    const out = { sample: null, fetchBase: null, seeds: 5, limit: 100 };
    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--sample') out.sample = argv[++i];
        else if (arg === '--fetch') out.fetchBase = argv[++i];
        else if (arg === '--seeds') out.seeds = Number(argv[++i]);
        else if (arg === '--limit') out.limit = Number(argv[++i]);
        else if (arg === '--language') out.language = argv[++i];
    }
    out.language = out.language ?? 'mnk';
    return out;
}

/** Entries out of either envelope shape, or a bare array. */
function entriesOf(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data?.words)) return parsed.data.words;
    if (Array.isArray(parsed?.words)) return parsed.words;
    throw new Error('unrecognised sample shape: expected an array, {words}, or {data:{words}}');
}

async function loadEntries(opts) {
    if (opts.sample) return entriesOf(JSON.parse(readFileSync(opts.sample, 'utf8')));

    if (!opts.fetchBase) throw new Error('pass --sample <file> or --fetch <games-bff-origin>');
    const byId = new Map();
    for (let i = 0; i < opts.seeds; i += 1) {
        const url =
            `${opts.fetchBase}/api/dictionary/game-set` +
            `?language=${encodeURIComponent(opts.language)}&limit=${opts.limit}&seed=analysis-${i}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} → ${res.status}`);
        for (const w of entriesOf(await res.json())) byId.set(w.entry_id ?? w.uuid, w);
    }
    return [...byId.values()];
}

/* ── Orthography ────────────────────────────────────────────────────────── */

/**
 * Candidate multi-character units to TEST FOR. Presence in this list is a
 * hypothesis to measure, not a claim about the language: the report prints the
 * measured frequency of each and the ones that do not occur are visible as
 * zeroes. Sequences an orthography actually uses show up; ones it does not are
 * ruled out by the data rather than by anybody's recollection.
 *
 * Which of these become units in play is AIWA's call — they hold linguistic and
 * orthographic authority. This script supplies the measurement they decide on.
 */
const CANDIDATE_UNITS = [
    'aa',
    'ee',
    'ii',
    'oo',
    'uu', // long vowels
    'nj',
    'ny',
    'ng',
    'ŋ',
    'kh',
    'ch',
    'sh',
    'gb',
    'kp', // candidate digraphs/consonants
];

/** Segment a headword into orthographic units, longest-match-first. */
function segment(word, units) {
    const ordered = [...units].sort((a, b) => b.length - a.length);
    const out = [];
    let i = 0;
    while (i < word.length) {
        const hit = ordered.find((u) => word.startsWith(u, i));
        if (hit) {
            out.push(hit);
            i += hit.length;
        } else {
            out.push(word[i]);
            i += 1;
        }
    }
    return out;
}

/** Is this headword fit to deal as a spelling round at all? */
function playability(word) {
    if (!word) return 'empty';
    if (/\d/.test(word)) return 'contains-digits';
    if (/\s/.test(word)) return 'contains-whitespace';
    if (/[.,;:!?()[\]"'’“”/\\]/.test(word)) return 'contains-punctuation';
    if (/^[-]|[-]$/.test(word)) return 'edge-hyphen';
    return 'playable';
}

/* ── Frequency, following Algorithm 1 over units rather than code points ── */

function frequencies(sequences, n) {
    const counts = new Map();
    let total = 0;
    for (const units of sequences) {
        for (let i = 0; i + n <= units.length; i += 1) {
            const key = units.slice(i, i + n).join('');
            counts.set(key, (counts.get(key) ?? 0) + 1);
            total += 1;
        }
    }
    return [...counts.entries()]
        .map(([key, count]) => ({ key, count, percent: total ? (count / total) * 100 : 0 }))
        .sort((a, b) => b.percent - a.percent);
}

/* ── Tile generation, following Algorithm 4 ─────────────────────────────── */

function buildTiles(unigrams, bigrams, tileCount) {
    const capacity = tileCount * FACES_PER_TILE;
    const frequent = unigrams
        .filter((u) => u.percent > INFREQUENT_THRESHOLD_PERCENT)
        .map((u) => u.key);

    /* The paper's line 6–15: walk the bigrams in descending frequency and take
     * their constituent units in the order they appear, so units that co-occur
     * often are spread across different tiles rather than trapped on one. */
    const sequence = [];
    const seen = new Set();
    for (const { key } of bigrams) {
        for (const unit of segment(key, frequent)) {
            if (!seen.has(unit) && frequent.includes(unit)) {
                seen.add(unit);
                sequence.push(unit);
            }
        }
        if (sequence.length >= frequent.length) break;
    }
    for (const unit of frequent) {
        if (!seen.has(unit)) {
            seen.add(unit);
            sequence.push(unit);
        }
    }

    /* Fill remaining faces with the most frequent units again — duplicates
     * across DIFFERENT tiles are what make repeated letters (and the long
     * vowels this corpus is full of) constructible at all. */
    const faces = [...sequence];
    let i = 0;
    while (faces.length < capacity) {
        faces.push(sequence[i % sequence.length]);
        i += 1;
    }

    /* Deal round-robin so consecutive-in-sequence units land on different
     * tiles (the paper's lines 19–23). */
    const tiles = Array.from({ length: tileCount }, () => new Set());
    faces.slice(0, capacity).forEach((unit, idx) => {
        tiles[idx % tileCount].add(unit);
    });
    return tiles.map((s) => [...s]);
}

/**
 * Can `units` be built from `tiles`, one unit per distinct tile?
 *
 * Bipartite matching by augmenting path. Cheap because a word is at most a
 * dozen units and a tile set at most a dozen tiles — and correct, which a
 * greedy "does any tile have this letter" check is not: greedy will happily
 * claim `oo` is coverable from a single tile bearing `o`.
 */
function isCoverable(units, tiles) {
    if (units.length > tiles.length) return false;
    const assignedTo = new Array(tiles.length).fill(-1);

    const tryAssign = (unitIdx, visited) => {
        for (let t = 0; t < tiles.length; t += 1) {
            if (visited[t] || !tiles[t].includes(units[unitIdx])) continue;
            visited[t] = true;
            if (assignedTo[t] === -1 || tryAssign(assignedTo[t], visited)) {
                assignedTo[t] = unitIdx;
                return true;
            }
        }
        return false;
    };

    for (let u = 0; u < units.length; u += 1) {
        if (!tryAssign(u, new Array(tiles.length).fill(false))) return false;
    }
    return true;
}

/* ── Report ─────────────────────────────────────────────────────────────── */

function pct(n, d) {
    return d ? `${((n / d) * 100).toFixed(1)}%` : '—';
}

async function main() {
    const opts = parseArgs(process.argv);
    const entries = await loadEntries(opts);
    const raw = entries.map((e) => e.header_word ?? e.headword ?? '').filter(Boolean);

    console.log(`# Orthography and coverage analysis — ${opts.language}`);
    console.log(`\nEntries in sample: **${raw.length}**`);
    console.log(
        '\n> A SAMPLE, not the corpus. The Dictionary bounds a game-set request, so this is\n' +
            '> what several bounded packs returned. Percentages are of the sample.\n'
    );

    /* 1. Normalisation. */
    const notNfc = raw.filter((w) => w.normalize('NFC') !== w);
    console.log('## 1 · Normalisation\n');
    console.log(`Headwords already in NFC: **${raw.length - notNfc.length}/${raw.length}**.`);
    if (notNfc.length)
        console.log(
            `Not NFC: ${notNfc
                .slice(0, 10)
                .map((w) => JSON.stringify(w))
                .join(', ')}`
        );
    console.log(
        '\nNFC is canonical for this platform and never NFKC/NFKD — a compatibility fold\n' +
            'destroys distinctions African orthographies carry.\n'
    );

    /* 2. Playability. */
    const buckets = new Map();
    for (const w of raw) {
        const verdict = playability(w);
        if (!buckets.has(verdict)) buckets.set(verdict, []);
        buckets.get(verdict).push(w);
    }
    const playable = buckets.get('playable') ?? [];
    console.log('## 2 · Playability of headwords as spelling rounds\n');
    console.log('| Verdict | Count | Share | Examples |');
    console.log('| :-- | --: | --: | :-- |');
    for (const [verdict, list] of [...buckets.entries()].sort(
        (a, b) => b[1].length - a[1].length
    )) {
        const eg = list
            .slice(0, 3)
            .map((w) => `\`${w}\``)
            .join(', ');
        console.log(`| ${verdict} | ${list.length} | ${pct(list.length, raw.length)} | ${eg} |`);
    }
    console.log(
        '\nEvery non-`playable` row is a round a player cannot win and must never be dealt.\n'
    );

    /* 3. Orthographic units, measured. */
    console.log('## 3 · Candidate orthographic units, measured\n');
    console.log('| Unit | Occurrences | Headwords containing it | Share of headwords |');
    console.log('| :-- | --: | --: | --: |');
    const attested = [];
    for (const unit of CANDIDATE_UNITS) {
        const occ = playable.reduce((n, w) => n + w.split(unit).length - 1, 0);
        const inWords = playable.filter((w) => w.includes(unit)).length;
        if (occ > 0) attested.push(unit);
        console.log(`| \`${unit}\` | ${occ} | ${inWords} | ${pct(inWords, playable.length)} |`);
    }
    console.log(
        `\nAttested in this sample: ${attested.map((u) => `\`${u}\``).join(', ') || 'none'}.`
    );
    console.log(
        'Unattested candidates are ruled out BY THE DATA. Which attested sequences count as\n' +
            "single units in play is AIWA's decision — they hold orthographic authority; this is\n" +
            'the measurement it rests on.\n'
    );

    /* 4. Frequencies over units. */
    const segmented = playable.map((w) => segment(w.toLowerCase(), attested));
    const unigrams = frequencies(segmented, 1);
    const bigrams = frequencies(segmented, 2);
    console.log('## 4 · Unit frequency (unigram)\n');
    console.log('| Unit | % | | Unit | % |');
    console.log('| :-- | --: | :-- | :-- | --: |');
    const half = Math.ceil(unigrams.length / 2);
    for (let i = 0; i < half; i += 1) {
        const a = unigrams[i];
        const b = unigrams[i + half];
        const cell = (x) => (x ? `\`${x.key}\` | ${x.percent.toFixed(2)}` : ' | ');
        console.log(`| ${cell(a)} | | ${cell(b)} |`);
    }
    const dropped = unigrams.filter((u) => u.percent <= INFREQUENT_THRESHOLD_PERCENT);
    console.log(
        `\nAt the paper's ≤${INFREQUENT_THRESHOLD_PERCENT}% threshold, ${dropped.length} unit(s) are ` +
            `infrequent: ${dropped.map((u) => `\`${u.key}\``).join(', ') || 'none'}.`
    );
    console.log(
        `\nTop bigrams: ${bigrams
            .slice(0, 12)
            .map((b) => `\`${b.key}\` ${b.percent.toFixed(1)}%`)
            .join(', ')}\n`
    );

    /* 5. Coverage by tile count and word length. */
    console.log('## 5 · Coverage by tile count and word length\n');
    console.log(
        'Coverage = the share of sampled words that can be BUILT, taking each unit from a\n' +
            "different tile. This is the paper's rule and it is why the check is a matching\n" +
            'rather than a letter-presence test.\n'
    );
    const byLength = new Map();
    for (const units of segmented) {
        const k = units.length;
        if (!byLength.has(k)) byLength.set(k, []);
        byLength.get(k).push(units);
    }
    const lengths = [...byLength.keys()].sort((a, b) => a - b);
    const tileCounts = [7, 8, 9, 10, 12];

    console.log(`| Units in word | Words | ${tileCounts.map((n) => `${n} tiles`).join(' | ')} |`);
    console.log(`| --: | --: | ${tileCounts.map(() => '--:').join(' | ')} |`);
    const tileSets = new Map(tileCounts.map((n) => [n, buildTiles(unigrams, bigrams, n)]));
    for (const k of lengths) {
        const words = byLength.get(k);
        const cells = tileCounts.map((n) => {
            const tiles = tileSets.get(n);
            const ok = words.filter((u) => isCoverable(u, tiles)).length;
            return pct(ok, words.length);
        });
        console.log(`| ${k} | ${words.length} | ${cells.join(' | ')} |`);
    }
    const totals = tileCounts.map((n) => {
        const tiles = tileSets.get(n);
        const ok = segmented.filter((u) => isCoverable(u, tiles)).length;
        return pct(ok, segmented.length);
    });
    console.log(
        `| **all** | **${segmented.length}** | ${totals.map((t) => `**${t}**`).join(' | ')} |`
    );

    /* 6. The comparison the paper's numbers are actually good for. */
    const inPaperRange = segmented.filter((u) => u.length >= 3 && u.length <= 7).length;
    console.log("\n## 6 · Why the paper's cube counts are a comparison point, not a setting\n");
    console.log(
        `Words of 3–7 units — the only range the paper studied — are **${inPaperRange}/${segmented.length}** ` +
            `(${pct(inPaperRange, segmented.length)}) of this sample.\n`
    );
    console.log(
        `Its headline results were 8 cubes for 3–5-letter words and 9 for 6–7, across 12\n` +
            `datasets, none of them a Mande language. The table above is the same question asked\n` +
            `of this corpus. Read the row for the lengths a game actually deals, pick from that,\n` +
            `and write the number into \`src/orthography.js\` deliberately.\n`
    );
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
