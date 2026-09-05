/**
 * Per-game help, drawn from real Dictionary fields.
 *
 * SOURCE NOTE: the book HAS now been read (`docs/research-reconciliation.md`).
 * Fading support is genuinely its idea — via Bruner, it names "adjustable level
 * of support … taking the learner's zone of proximal development into account"
 * and support that "dwindle[s] away to nothing" as independence grows.
 *
 * But its scaffolding is SOCIAL: the first essential feature is "collaborative
 * interaction between a novice and an expert". These ladders provide the
 * adjustable and fading parts and NOT that one — there is no expert in the
 * loop. On the source's account the human is part of the mechanism, so this is
 * a real gap, and the classroom teacher role is the missing half rather than a
 * later nicety.
 *
 * WHY THIS IS NOT ONE SHARED HINT
 *
 * Three games had no help at all, and the obvious repair — show the first
 * letter everywhere — would have been wrong. Revealing the first letter of a
 * word in `MeaningMatch` gives away nothing the player was asked for: the task
 * is choosing a MEANING, not spelling. Appropriate help follows the mechanic:
 *
 *   spelling games      sound, meaning, then units of the word itself
 *   listening game      replay, meaning, then partial spelling
 *   meaning game        domain, word class, example, eliminate one distractor
 *   flashcard game      pronunciation, definition, example, a related word
 *
 * EVERY HINT COMES FROM A FIELD THAT MAY BE EMPTY. The Dictionary withholds a
 * field by returning an empty string, never by omitting it, and a hint built on
 * a withheld field would show a learner a blank box. So each rung declares
 * whether it is `available` for THIS word, and the ladder skips what is not
 * there rather than offering a rung that cannot help.
 */

/** A rung that cannot be built from this word is not offered. */
const rung = (id, label, text) => (text ? { id, label, text } : null);

/**
 * The ordered help available for one word in one game, weakest first.
 *
 * Weakest-first matters: help escalates as a learner struggles, which is the
 * fading-scaffolding shape the brief requires. Starting with the strongest
 * would answer the question on the first press.
 */
export function hintLadder(gameId, word, { language = 'en' } = {}) {
    if (!word) return [];
    const meaning =
        (language === 'fr' && word.translation_fr) ||
        word.translation_en ||
        word.french_definition ||
        word.english_definition ||
        word.definition ||
        '';
    const example = word.example_sentences?.[0]?.sentence ?? '';
    const ipa = word.ipa ?? '';
    const pos = word.part_of_speech ?? '';
    const domain = word.domain ?? word.domain_code ?? '';

    switch (gameId) {
        case 'meaning_match':
            /*
             * Never the headword's spelling — the task is choosing a meaning,
             * so spelling help would be noise. Narrowing help instead: what
             * kind of thing it is, then how it behaves in a sentence, then one
             * wrong option removed.
             */
            return [
                rung('domain', 'Where this word belongs', domain),
                rung('pos', 'Word class', pos),
                rung('example', 'Used in a sentence', example),
                /* Handled by the game itself — it owns the option list. */
                { id: 'eliminate', label: 'Remove a wrong answer', text: '' },
            ].filter(Boolean);

        case 'domain_flash':
            /*
             * A flashcard is self-graded, so help here is not about getting a
             * mark: it is about giving the player enough to judge honestly
             * whether they knew it.
             */
            return [
                rung('ipa', 'How it sounds', ipa ? `/${ipa}/` : ''),
                rung('meaning', 'What it means', meaning),
                rung('example', 'Used in a sentence', example),
                rung('root', 'Built from', word.header_word_root ?? ''),
            ].filter(Boolean);

        case 'letter_reveal':
            /* A spelling game, but one that already reveals letters as its
             * mechanic — so help is everything EXCEPT more letters. */
            return [
                rung('ipa', 'How it sounds', ipa ? `/${ipa}/` : ''),
                rung('meaning', 'What it means', meaning),
                rung('example', 'Used in a sentence', example),
            ].filter(Boolean);

        default:
            /* Written-spelling games own their own unit-reveal ladder. */
            return [];
    }
}

/**
 * The next rung, or null when help is exhausted.
 *
 * Returning null rather than repeating the last rung is deliberate: a Hint
 * button that keeps responding while showing nothing new tells the player their
 * tap did nothing, which is the defect this release already fixed once.
 */
export function nextHint(gameId, word, taken = 0, opts) {
    const ladder = hintLadder(gameId, word, opts);
    return ladder[taken] ?? null;
}

/** Is any help available at all for this word in this game? */
export function hasHint(gameId, word, opts) {
    return hintLadder(gameId, word, opts).length > 0;
}
